/**
 * GitHub Fetcher — read-only client for grounding proposal-stage agents in
 * real source code from a public GitHub repository.
 *
 * - Unauthenticated by default. If GITHUB_TOKEN is set in the environment,
 *   requests are sent with a bearer token to raise the rate limit (private
 *   repo OAuth is out of scope for Phase 1).
 * - All public surface functions return typed GithubError values instead of
 *   throwing — callers in the orchestrator must never see a raw fetch
 *   rejection.
 * - Tree results are pre-filtered to drop noise (lockfiles, build dirs,
 *   binaries, source maps) so downstream selectors only see human-authored
 *   source code.
 */

export type GithubErrorKind =
  | "invalid-url"
  | "not-found"
  | "rate-limited"
  | "network"
  | "too-large"
  | "binary";

export class GithubError extends Error {
  public readonly kind: GithubErrorKind;

  constructor(kind: GithubErrorKind, message: string) {
    super(message);
    this.name = "GithubError";
    this.kind = kind;
  }
}

export interface ParsedRepoUrl {
  owner: string;
  repo: string;
  /** May be undefined if the input did not specify one. */
  branch?: string;
}

export interface FilteredTreeEntry {
  path: string;
  size: number;
}

export interface RepoTree {
  owner: string;
  repo: string;
  branch: string;
  entries: FilteredTreeEntry[];
  /** True if GitHub flagged the tree response as truncated (very large repos). */
  truncated: boolean;
}

export interface FetchedFile {
  content: string;
  truncated: boolean;
  /** Original (untrimmed) size in bytes, if reported by GitHub. */
  size: number;
}

// =============================================================================
// CONSTANTS
// =============================================================================

const GITHUB_API_BASE = "https://api.github.com";
const REQUEST_TIMEOUT_MS = 25_000;

/** Per-file truncation threshold. Mirrors agent-tool-loop.MAX_BYTES_PER_FILE. */
export const MAX_FILE_BYTES = 50 * 1024;
export const TRUNCATION_MARKER = "\n\n[... truncated by tool guardrail at 50KB ...]";

const FILTERED_DIRECTORIES = [
  "node_modules/",
  ".git/",
  "dist/",
  "build/",
  ".next/",
  "coverage/",
  "out/",
  "target/",
  "vendor/",
  ".cache/",
  "__pycache__/",
];

const FILTERED_LOCKFILES = new Set([
  "package-lock.json",
  "yarn.lock",
  "pnpm-lock.yaml",
  "Gemfile.lock",
  "poetry.lock",
  "Cargo.lock",
  "go.sum",
  "composer.lock",
]);

const FILTERED_EXTENSIONS = new Set([
  ".map",
  // images
  ".png",
  ".jpg",
  ".jpeg",
  ".gif",
  ".webp",
  ".ico",
  ".svg",
  // docs / archives
  ".pdf",
  ".zip",
  ".tar",
  ".gz",
  ".tgz",
  ".bz2",
  ".7z",
  // fonts
  ".woff",
  ".woff2",
  ".ttf",
  ".eot",
  ".otf",
  // media
  ".mp4",
  ".mp3",
  ".mov",
  ".webm",
  ".wav",
  // binaries
  ".wasm",
  ".exe",
  ".dll",
  ".so",
  ".dylib",
  ".bin",
  ".class",
  ".jar",
]);

// =============================================================================
// URL PARSING
// =============================================================================

/**
 * Accepts:
 *   - "owner/repo"
 *   - "owner/repo@branch"
 *   - "https://github.com/owner/repo"
 *   - "https://github.com/owner/repo/tree/branch"
 *   - any of the above with optional trailing ".git"
 *
 * Returns either ParsedRepoUrl with branch=undefined (caller resolves default
 * branch via fetchRepoTree), or a GithubError of kind "invalid-url".
 */
export function parseGithubUrl(input: string): ParsedRepoUrl | GithubError {
  if (typeof input !== "string") {
    return new GithubError("invalid-url", "GitHub repo input is not a string");
  }

  let s = input.trim();
  if (!s) {
    return new GithubError("invalid-url", "Empty GitHub repo input");
  }

  // Strip protocol + host for full URLs
  const urlMatch = s.match(/^https?:\/\/(?:www\.)?github\.com\/(.+)$/i);
  if (urlMatch) {
    s = urlMatch[1];
  }

  // Strip trailing ".git" and any trailing slash
  s = s.replace(/\.git$/i, "").replace(/\/+$/, "");

  // Pull out @branch first (only valid when not paired with /tree/)
  let branch: string | undefined;
  const atIdx = s.indexOf("@");
  if (atIdx !== -1) {
    branch = s.slice(atIdx + 1) || undefined;
    s = s.slice(0, atIdx);
  }

  // Then /tree/branch form
  const treeMatch = s.match(/^([^/]+)\/([^/]+)\/tree\/(.+)$/);
  if (treeMatch) {
    if (branch) {
      return new GithubError(
        "invalid-url",
        "GitHub repo input has both @branch and /tree/branch — pick one"
      );
    }
    return { owner: treeMatch[1], repo: treeMatch[2], branch: treeMatch[3] };
  }

  const slashIdx = s.indexOf("/");
  if (slashIdx === -1) {
    return new GithubError(
      "invalid-url",
      `Could not parse GitHub repo from "${input}" — expected owner/repo`
    );
  }
  const owner = s.slice(0, slashIdx);
  const rest = s.slice(slashIdx + 1);
  if (!owner || !rest || rest.includes("/")) {
    return new GithubError(
      "invalid-url",
      `Could not parse GitHub repo from "${input}" — expected owner/repo`
    );
  }

  return { owner, repo: rest, branch };
}

// =============================================================================
// FETCH HELPERS
// =============================================================================

function buildHeaders(): Record<string, string> {
  const headers: Record<string, string> = {
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
    "User-Agent": "movistan-ai-engineering-room",
  };
  const token = process.env.GITHUB_TOKEN;
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }
  return headers;
}

async function githubFetch(
  path: string,
  retries = 2
): Promise<Response | GithubError> {
  for (let attempt = 0; attempt <= retries; attempt++) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    try {
      const res = await fetch(`${GITHUB_API_BASE}${path}`, {
        headers: buildHeaders(),
        signal: controller.signal,
      });
      // Retry on transient server errors (502/503/504); give up on others.
      if ((res.status === 502 || res.status === 503 || res.status === 504) && attempt < retries) {
        await new Promise((r) => setTimeout(r, 1000 * (attempt + 1)));
        continue;
      }
      return res;
    } catch (err) {
      if (err instanceof Error && err.name === "AbortError") {
        if (attempt < retries) {
          await new Promise((r) => setTimeout(r, 1000 * (attempt + 1)));
          continue;
        }
        return new GithubError("network", `GitHub request timed out: ${path}`);
      }
      const msg = err instanceof Error ? err.message : String(err);
      return new GithubError("network", `GitHub request failed: ${msg}`);
    } finally {
      clearTimeout(timeoutId);
    }
  }
  return new GithubError("network", `GitHub request failed after ${retries + 1} attempts: ${path}`);
}

function classifyHttpError(res: Response): GithubError {
  if (res.status === 404) {
    return new GithubError("not-found", "GitHub repo or path not found (404)");
  }
  if (res.status === 403 || res.status === 429) {
    const remaining = res.headers.get("X-RateLimit-Remaining");
    if (remaining === "0" || res.status === 429) {
      return new GithubError(
        "rate-limited",
        `GitHub rate limit reached (status ${res.status}). Set GITHUB_TOKEN to raise the limit.`
      );
    }
    return new GithubError(
      "network",
      `GitHub returned ${res.status} (likely auth or forbidden)`
    );
  }
  return new GithubError("network", `GitHub returned status ${res.status}`);
}

// =============================================================================
// FILTERING
// =============================================================================

function getExtension(path: string): string {
  const slash = path.lastIndexOf("/");
  const name = slash === -1 ? path : path.slice(slash + 1);
  const dot = name.lastIndexOf(".");
  return dot <= 0 ? "" : name.slice(dot).toLowerCase();
}

function basename(path: string): string {
  const slash = path.lastIndexOf("/");
  return slash === -1 ? path : path.slice(slash + 1);
}

/** Returns true if the entry should be kept (not filtered out). */
export function shouldKeepPath(path: string): boolean {
  for (const dir of FILTERED_DIRECTORIES) {
    if (path === dir.slice(0, -1) || path.startsWith(dir) || path.includes(`/${dir}`)) {
      return false;
    }
  }
  if (FILTERED_LOCKFILES.has(basename(path))) {
    return false;
  }
  const ext = getExtension(path);
  if (ext && FILTERED_EXTENSIONS.has(ext)) {
    return false;
  }
  return true;
}

// =============================================================================
// PUBLIC API
// =============================================================================

/**
 * Resolve the default branch of a repo when the caller did not specify one.
 * Returns the branch name or a GithubError.
 */
async function fetchDefaultBranch(
  owner: string,
  repo: string
): Promise<string | GithubError> {
  const res = await githubFetch(`/repos/${owner}/${repo}`);
  if (res instanceof GithubError) return res;
  if (!res.ok) return classifyHttpError(res);
  const json = (await res.json().catch(() => null)) as {
    default_branch?: string;
  } | null;
  if (!json?.default_branch) {
    return new GithubError(
      "network",
      "GitHub response did not include default_branch"
    );
  }
  return json.default_branch;
}

/**
 * Fetch the full recursive file tree of a repo and apply the filtering rules.
 * Resolves the default branch automatically if `branch` is undefined.
 */
export async function fetchRepoTree(
  owner: string,
  repo: string,
  branch?: string
): Promise<RepoTree | GithubError> {
  let resolvedBranch = branch;
  if (!resolvedBranch) {
    const def = await fetchDefaultBranch(owner, repo);
    if (def instanceof GithubError) return def;
    resolvedBranch = def;
  }

  const res = await githubFetch(
    `/repos/${owner}/${repo}/git/trees/${encodeURIComponent(resolvedBranch)}?recursive=1`
  );
  if (res instanceof GithubError) return res;
  if (!res.ok) return classifyHttpError(res);

  const json = (await res.json().catch(() => null)) as {
    tree?: Array<{ path?: string; type?: string; size?: number }>;
    truncated?: boolean;
  } | null;

  if (!json?.tree || !Array.isArray(json.tree)) {
    return new GithubError("network", "GitHub tree response missing tree array");
  }

  const entries: FilteredTreeEntry[] = [];
  for (const node of json.tree) {
    if (node.type !== "blob" || typeof node.path !== "string") continue;
    if (!shouldKeepPath(node.path)) continue;
    entries.push({ path: node.path, size: node.size ?? 0 });
  }

  return {
    owner,
    repo,
    branch: resolvedBranch,
    entries,
    truncated: Boolean(json.truncated),
  };
}

/**
 * Fetch a single file's content via the contents API. Always returns text
 * (base64-decoded UTF-8). Truncates at MAX_FILE_BYTES with an explicit marker
 * so the calling LLM is told the content was cut off.
 *
 * - Refuses files whose path extension is in the binary blocklist (returns
 *   `kind: "binary"`).
 * - Maps 404 → not-found, 403/rate-limit → rate-limited, etc.
 */
export async function fetchFileContent(
  owner: string,
  repo: string,
  path: string,
  branch: string
): Promise<FetchedFile | GithubError> {
  if (!shouldKeepPath(path)) {
    return new GithubError(
      "binary",
      `Refusing to fetch filtered path "${path}" (binary or build artifact)`
    );
  }

  const res = await githubFetch(
    `/repos/${owner}/${repo}/contents/${path
      .split("/")
      .map(encodeURIComponent)
      .join("/")}?ref=${encodeURIComponent(branch)}`
  );
  if (res instanceof GithubError) return res;
  if (!res.ok) return classifyHttpError(res);

  const json = (await res.json().catch(() => null)) as {
    content?: string;
    encoding?: string;
    size?: number;
    type?: string;
  } | null;

  if (!json || json.type !== "file" || typeof json.content !== "string") {
    return new GithubError(
      "not-found",
      `GitHub contents API did not return a file for "${path}"`
    );
  }

  const encoding = json.encoding ?? "base64";
  if (encoding !== "base64") {
    return new GithubError(
      "network",
      `Unexpected encoding "${encoding}" for "${path}"`
    );
  }

  let decoded: string;
  try {
    decoded = Buffer.from(json.content, "base64").toString("utf8");
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return new GithubError("binary", `Failed to decode "${path}" as UTF-8: ${msg}`);
  }

  const size = json.size ?? Buffer.byteLength(decoded, "utf8");
  if (decoded.length > MAX_FILE_BYTES) {
    return {
      content: decoded.slice(0, MAX_FILE_BYTES) + TRUNCATION_MARKER,
      truncated: true,
      size,
    };
  }
  return { content: decoded, truncated: false, size };
}
