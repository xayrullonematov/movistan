import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  parseGithubUrl,
  fetchRepoTree,
  fetchFileContent,
  shouldKeepPath,
  GithubError,
  MAX_FILE_BYTES,
  TRUNCATION_MARKER,
} from "./github-fetcher";

describe("parseGithubUrl", () => {
  it("parses owner/repo shorthand", () => {
    const r = parseGithubUrl("vercel/next.js");
    expect(r).not.toBeInstanceOf(GithubError);
    if (r instanceof GithubError) return;
    expect(r).toEqual({ owner: "vercel", repo: "next.js", branch: undefined });
  });

  it("parses owner/repo@branch", () => {
    const r = parseGithubUrl("vercel/next.js@canary");
    if (r instanceof GithubError) throw r;
    expect(r).toEqual({ owner: "vercel", repo: "next.js", branch: "canary" });
  });

  it("parses full https URL", () => {
    const r = parseGithubUrl("https://github.com/vercel/next.js");
    if (r instanceof GithubError) throw r;
    expect(r).toEqual({ owner: "vercel", repo: "next.js", branch: undefined });
  });

  it("parses .git-suffixed URL", () => {
    const r = parseGithubUrl("https://github.com/vercel/next.js.git");
    if (r instanceof GithubError) throw r;
    expect(r).toEqual({ owner: "vercel", repo: "next.js", branch: undefined });
  });

  it("parses /tree/branch URL form", () => {
    const r = parseGithubUrl("https://github.com/vercel/next.js/tree/canary");
    if (r instanceof GithubError) throw r;
    expect(r).toEqual({ owner: "vercel", repo: "next.js", branch: "canary" });
  });

  it("rejects malformed input — no slash", () => {
    const r = parseGithubUrl("nextjs");
    expect(r).toBeInstanceOf(GithubError);
    if (!(r instanceof GithubError)) return;
    expect(r.kind).toBe("invalid-url");
  });

  it("rejects empty input", () => {
    const r = parseGithubUrl("");
    expect(r).toBeInstanceOf(GithubError);
    if (!(r instanceof GithubError)) return;
    expect(r.kind).toBe("invalid-url");
  });

  it("rejects too many path segments", () => {
    const r = parseGithubUrl("a/b/c/d");
    expect(r).toBeInstanceOf(GithubError);
  });

  it("rejects mixed @branch and /tree/branch", () => {
    const r = parseGithubUrl("a/b/tree/main@dev");
    expect(r).toBeInstanceOf(GithubError);
  });
});

describe("shouldKeepPath", () => {
  it.each([
    ["node_modules/foo.ts", false],
    ["src/node_modules/foo.ts", false],
    [".git/HEAD", false],
    ["dist/bundle.js", false],
    [".next/build-manifest.json", false],
    ["src/index.ts", true],
    ["package-lock.json", false],
    ["yarn.lock", false],
    ["pnpm-lock.yaml", false],
    ["assets/icon.png", false],
    ["src/foo.ts.map", false],
    ["README.md", true],
    ["src/foo.test.ts", true],
  ])("%s -> %s", (path, kept) => {
    expect(shouldKeepPath(path)).toBe(kept);
  });
});

describe("fetchRepoTree", () => {
  let fetchSpy: ReturnType<typeof vi.spyOn>;
  beforeEach(() => {
    fetchSpy = vi.spyOn(globalThis, "fetch");
  });
  afterEach(() => {
    fetchSpy.mockRestore();
  });

  it("filters out lockfiles, node_modules, .map and binary extensions", async () => {
    fetchSpy.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          tree: [
            { path: "README.md", type: "blob", size: 100 },
            { path: "src/index.ts", type: "blob", size: 200 },
            { path: "package-lock.json", type: "blob", size: 99999 },
            { path: "node_modules/lodash/index.js", type: "blob", size: 50 },
            { path: "dist/bundle.js.map", type: "blob", size: 50 },
            { path: "logo.png", type: "blob", size: 50 },
            { path: "src/", type: "tree" }, // not a blob, skipped
          ],
          truncated: false,
        }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      )
    );
    const tree = await fetchRepoTree("vercel", "next.js", "main");
    if (tree instanceof GithubError) throw tree;
    expect(tree.entries.map((e) => e.path).sort()).toEqual([
      "README.md",
      "src/index.ts",
    ]);
    expect(tree.branch).toBe("main");
  });

  it("maps 404 to GithubError{kind: 'not-found'}", async () => {
    fetchSpy.mockResolvedValueOnce(
      new Response("Not Found", { status: 404 })
    );
    const r = await fetchRepoTree("nobody", "nothing", "main");
    expect(r).toBeInstanceOf(GithubError);
    if (!(r instanceof GithubError)) return;
    expect(r.kind).toBe("not-found");
  });

  it("maps 403 with X-RateLimit-Remaining=0 to GithubError{kind: 'rate-limited'}", async () => {
    fetchSpy.mockResolvedValueOnce(
      new Response("rate limit", {
        status: 403,
        headers: { "X-RateLimit-Remaining": "0" },
      })
    );
    const r = await fetchRepoTree("vercel", "next.js", "main");
    expect(r).toBeInstanceOf(GithubError);
    if (!(r instanceof GithubError)) return;
    expect(r.kind).toBe("rate-limited");
  });

  it("resolves default branch when not specified", async () => {
    fetchSpy.mockResolvedValueOnce(
      new Response(JSON.stringify({ default_branch: "main" }), { status: 200 })
    );
    fetchSpy.mockResolvedValueOnce(
      new Response(
        JSON.stringify({ tree: [{ path: "README.md", type: "blob", size: 1 }], truncated: false }),
        { status: 200 }
      )
    );
    const r = await fetchRepoTree("vercel", "next.js");
    if (r instanceof GithubError) throw r;
    expect(r.branch).toBe("main");
  });
});

describe("fetchFileContent", () => {
  let fetchSpy: ReturnType<typeof vi.spyOn>;
  beforeEach(() => {
    fetchSpy = vi.spyOn(globalThis, "fetch");
  });
  afterEach(() => {
    fetchSpy.mockRestore();
  });

  it("decodes base64 file content", async () => {
    const content = "hello world";
    fetchSpy.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          type: "file",
          encoding: "base64",
          content: Buffer.from(content).toString("base64"),
          size: content.length,
        }),
        { status: 200 }
      )
    );
    const r = await fetchFileContent("a", "b", "src/foo.ts", "main");
    if (r instanceof GithubError) throw r;
    expect(r.content).toBe(content);
    expect(r.truncated).toBe(false);
  });

  it("truncates files over MAX_FILE_BYTES", async () => {
    const big = "x".repeat(MAX_FILE_BYTES + 1024);
    fetchSpy.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          type: "file",
          encoding: "base64",
          content: Buffer.from(big).toString("base64"),
          size: big.length,
        }),
        { status: 200 }
      )
    );
    const r = await fetchFileContent("a", "b", "src/big.ts", "main");
    if (r instanceof GithubError) throw r;
    expect(r.truncated).toBe(true);
    expect(r.content.endsWith(TRUNCATION_MARKER)).toBe(true);
    expect(r.content.length).toBe(MAX_FILE_BYTES + TRUNCATION_MARKER.length);
  });

  it("refuses filtered/binary paths", async () => {
    const r = await fetchFileContent("a", "b", "logo.png", "main");
    expect(r).toBeInstanceOf(GithubError);
    if (!(r instanceof GithubError)) return;
    expect(r.kind).toBe("binary");
  });
});
