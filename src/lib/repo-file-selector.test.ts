import { describe, it, expect } from "vitest";
import * as fc from "fast-check";
import { selectCandidateFiles, SHORTLIST_MAX } from "./repo-file-selector";
import type { AgentType } from "@/types/domain";
import type { FilteredTreeEntry } from "./github-fetcher";

const ALL_AGENTS: AgentType[] = [
  "senior-engineer",
  "security-engineer",
  "performance-engineer",
  "product-engineer",
];

function entries(...paths: string[]): FilteredTreeEntry[] {
  return paths.map((p) => ({ path: p, size: 100 }));
}

describe("selectCandidateFiles — tier 1 universal paths", () => {
  it.each(ALL_AGENTS)("%s gets README, package.json, tsconfig.json", (agent) => {
    const tree = entries(
      "README.md",
      "package.json",
      "tsconfig.json",
      "src/random-noise.ts"
    );
    const result = selectCandidateFiles(tree, agent);
    expect(result).toContain("README.md");
    expect(result).toContain("package.json");
    expect(result).toContain("tsconfig.json");
  });
});

describe("selectCandidateFiles — persona-specific tier 2", () => {
  it("senior-engineer prefers architecture / orchestrator / types", () => {
    const tree = entries(
      "ARCHITECTURE.md",
      "src/types/domain.ts",
      "src/lib/orchestrator.ts",
      "src/components/Button.tsx"
    );
    const result = selectCandidateFiles(tree, "senior-engineer");
    expect(result).toContain("ARCHITECTURE.md");
    expect(result).toContain("src/types/domain.ts");
    expect(result).toContain("src/lib/orchestrator.ts");
  });

  it("security-engineer prefers auth / middleware / env / token paths", () => {
    const tree = entries(
      "src/auth/login.ts",
      "src/middleware.ts",
      "src/lib/token-manager.ts",
      ".env.example",
      "src/components/Button.tsx"
    );
    const result = selectCandidateFiles(tree, "security-engineer");
    expect(result).toContain("src/auth/login.ts");
    expect(result).toContain("src/middleware.ts");
    expect(result).toContain("src/lib/token-manager.ts");
    expect(result).toContain(".env.example");
  });

  it("performance-engineer prefers prisma / services / build configs", () => {
    const tree = entries(
      "prisma/schema.prisma",
      "src/lib/cache-service.ts",
      "next.config.ts",
      "src/components/Button.tsx"
    );
    const result = selectCandidateFiles(tree, "performance-engineer");
    expect(result).toContain("prisma/schema.prisma");
    expect(result).toContain("src/lib/cache-service.ts");
    expect(result).toContain("next.config.ts");
  });

  it("product-engineer prefers pages / forms / readme", () => {
    const tree = entries(
      "src/app/page.tsx",
      "src/components/forms/LoginForm.tsx",
      "README.md",
      "CHANGELOG.md",
      "src/lib/db.ts"
    );
    const result = selectCandidateFiles(tree, "product-engineer");
    expect(result).toContain("src/app/page.tsx");
    expect(result).toContain("src/components/forms/LoginForm.tsx");
    expect(result).toContain("README.md");
    expect(result).toContain("CHANGELOG.md");
  });
});

describe("selectCandidateFiles — invariants (property-based)", () => {
  const pathArb = fc.constantFrom(
    "README.md",
    "package.json",
    "tsconfig.json",
    "src/index.ts",
    "src/auth/login.ts",
    "src/middleware.ts",
    "src/types/domain.ts",
    "src/lib/orchestrator.ts",
    "src/lib/cache-service.ts",
    "prisma/schema.prisma",
    "src/app/page.tsx",
    "src/components/Button.tsx",
    "src/components/forms/LoginForm.tsx",
    ".env.example",
    "next.config.ts",
    "ARCHITECTURE.md",
    "CHANGELOG.md",
    "src/random/file.ts",
    "docs/intro.md",
    "src/api/users/route.ts"
  );

  it("result length is always ≤ SHORTLIST_MAX", () => {
    fc.assert(
      fc.property(
        fc.array(pathArb, { minLength: 0, maxLength: 60 }),
        fc.constantFrom(...ALL_AGENTS),
        (paths, agent) => {
          const tree = entries(...new Set(paths));
          const result = selectCandidateFiles(tree, agent);
          return result.length <= SHORTLIST_MAX;
        }
      )
    );
  });

  it("result is deterministic — same input yields same output", () => {
    fc.assert(
      fc.property(
        fc.array(pathArb, { minLength: 0, maxLength: 60 }),
        fc.constantFrom(...ALL_AGENTS),
        (paths, agent) => {
          const tree = entries(...new Set(paths));
          const a = selectCandidateFiles(tree, agent);
          const b = selectCandidateFiles(tree, agent);
          return JSON.stringify(a) === JSON.stringify(b);
        }
      )
    );
  });

  it("result contains no duplicate paths", () => {
    fc.assert(
      fc.property(
        fc.array(pathArb, { minLength: 0, maxLength: 60 }),
        fc.constantFrom(...ALL_AGENTS),
        (paths, agent) => {
          const tree = entries(...paths);
          const result = selectCandidateFiles(tree, agent);
          return new Set(result).size === result.length;
        }
      )
    );
  });
});
