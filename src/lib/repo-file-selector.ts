/**
 * Repo File Selector — heuristic pre-filter that produces a per-persona
 * ranked shortlist of paths from a (pre-filtered) repo tree.
 *
 * The shortlist is sent to the agent as a hint in the proposal-stage prompt
 * so the model can spend its scarce tool-call budget on files most relevant
 * to its objective function (security paths for Security Engineer, etc.).
 *
 * Tier 1 (all personas): README, top-level manifest + config files.
 * Tier 2 (per-persona):  keyword matches scored against the path.
 *
 * Notes on naming: the source prompt uses "Advocate" for what this codebase
 * calls `product-engineer`. The mapping is 1:1.
 */

import type { AgentType } from "@/types/domain";
import type { FilteredTreeEntry } from "@/lib/github-fetcher";

export const SHORTLIST_MAX = 20;

// =============================================================================
// TIER 1 — universal high-signal paths
// =============================================================================

const TOP_LEVEL_MANIFESTS = new Set([
  "package.json",
  "pyproject.toml",
  "Cargo.toml",
  "go.mod",
  "pom.xml",
  "build.gradle",
  "Gemfile",
  "composer.json",
]);

const TOP_LEVEL_CONFIG = new Set([
  "tsconfig.json",
  "jsconfig.json",
  "next.config.js",
  "next.config.ts",
  "next.config.mjs",
  "vite.config.js",
  "vite.config.ts",
  "webpack.config.js",
  "rollup.config.js",
  "eslint.config.js",
  "eslint.config.mjs",
  ".eslintrc",
  ".eslintrc.json",
  "prettier.config.js",
  ".prettierrc",
  ".env.example",
  "Dockerfile",
  "docker-compose.yml",
  "Makefile",
]);

function isTierOne(path: string): boolean {
  const base = basename(path);
  // README* anywhere; CHANGELOG/LICENSE only at top level
  if (/^README(\.[a-z0-9.]+)?$/i.test(base)) return true;
  if (!path.includes("/")) {
    if (TOP_LEVEL_MANIFESTS.has(base)) return true;
    if (TOP_LEVEL_CONFIG.has(base)) return true;
    if (/^architecture(\.[a-z0-9.]+)?$/i.test(base)) return true;
    if (/^design(\.[a-z0-9.]+)?$/i.test(base)) return true;
  }
  return false;
}

// =============================================================================
// TIER 2 — per-persona scoring rules
// =============================================================================

type Scorer = (path: string, base: string, lower: string) => number;

const SCORERS: Record<AgentType, Scorer> = {
  "senior-engineer": (path, base, lower) => {
    let s = 0;
    if (/^architecture(\.[a-z0-9.]+)?$/i.test(base)) s += 4;
    if (/^design(\.[a-z0-9.]+)?$/i.test(base)) s += 4;
    if (lower.includes("/types/") || lower.includes("/type/")) s += 2;
    if (lower.includes("orchestrator")) s += 3;
    if (lower.includes("router") || lower.includes("/routes/")) s += 2;
    if (/(^|\/)src\/(index|main|app)\.(ts|tsx|js|jsx)$/i.test(path)) s += 3;
    if (/(^|\/)src\/app\/.*page\.(tsx|jsx)$/i.test(path)) s += 1;
    if (lower.includes("/domain/") || /(^|\/)domain\.(ts|js)$/i.test(path)) s += 2;
    if (lower.includes("/core/")) s += 1;
    return s;
  },

  "security-engineer": (path, base, lower) => {
    let s = 0;
    if (/auth/i.test(lower)) s += 4;
    if (/middleware/i.test(lower)) s += 3;
    if (/(\/|^)api\/.+\/route\.(ts|js)$/i.test(path)) s += 3;
    if (base === ".env.example") s += 3;
    if (/token|secret|session|crypt|jwt|password|hash/i.test(lower)) s += 3;
    if (lower.includes("/schemas/") || lower.includes("/schema/")) s += 2;
    if (lower.includes("/validation/") || lower.includes("validator")) s += 2;
    if (/cors|csrf|xss|sanitize/i.test(lower)) s += 2;
    return s;
  },

  "performance-engineer": (path, base, lower) => {
    let s = 0;
    if (lower.startsWith("prisma/") || base === "schema.prisma") s += 4;
    if (lower.includes("/models/") || lower.includes("/model/")) s += 3;
    if (lower.includes("service") || lower.includes("manager")) s += 2;
    if (/(\/|^)api\/.+\/route\.(ts|js)$/i.test(path)) s += 2;
    if (
      base === "next.config.js" ||
      base === "next.config.ts" ||
      base === "next.config.mjs" ||
      base === "webpack.config.js" ||
      base === "vite.config.js" ||
      base === "vite.config.ts" ||
      /^rollup\.config\./i.test(base)
    )
      s += 3;
    if (lower.includes("/queries/") || lower.includes("query")) s += 2;
    if (lower.includes("cache") || lower.includes("index")) s += 1;
    return s;
  },

  "product-engineer": (path, base, lower) => {
    let s = 0;
    if (/(^|\/)(page|layout)\.(tsx|jsx)$/i.test(path)) s += 4;
    if (lower.includes("/pages/")) s += 3;
    if (lower.includes("form") || lower.includes("/forms/")) s += 2;
    if (lower.includes("error") || base.toLowerCase().startsWith("not-found"))
      s += 2;
    if (/^README(\.[a-z0-9.]+)?$/i.test(base)) s += 3;
    if (/^CHANGELOG(\.[a-z0-9.]+)?$/i.test(base)) s += 2;
    if (lower.includes("/components/")) s += 1;
    if (lower.includes("/hooks/") || lower.includes("use-")) s += 1;
    return s;
  },
};

// =============================================================================
// PUBLIC API
// =============================================================================

/**
 * Pick ~15-20 candidate paths for the given persona. Tier-1 paths always come
 * first when present; tier-2 paths fill the remainder ranked by score.
 *
 * Deterministic — no I/O, no random — so the same tree always produces the
 * same shortlist for the same persona (important for replay/testing).
 */
export function selectCandidateFiles(
  entries: FilteredTreeEntry[],
  agentId: AgentType
): string[] {
  const scorer = SCORERS[agentId];
  const tier1: string[] = [];
  const tier2: Array<{ path: string; score: number }> = [];

  for (const entry of entries) {
    const path = entry.path;
    if (isTierOne(path)) {
      tier1.push(path);
      continue;
    }
    const lower = path.toLowerCase();
    const base = basename(path);
    const score = scorer(path, base, lower);
    if (score > 0) {
      tier2.push({ path, score });
    }
  }

  // Stable sort: by score desc, then path asc to keep determinism
  tier2.sort((a, b) => (b.score - a.score) || a.path.localeCompare(b.path));
  tier1.sort((a, b) => a.localeCompare(b));

  const seen = new Set<string>();
  const result: string[] = [];
  for (const p of tier1) {
    if (!seen.has(p) && result.length < SHORTLIST_MAX) {
      seen.add(p);
      result.push(p);
    }
  }
  for (const { path } of tier2) {
    if (!seen.has(path) && result.length < SHORTLIST_MAX) {
      seen.add(path);
      result.push(path);
    }
  }
  return result;
}

function basename(path: string): string {
  const slash = path.lastIndexOf("/");
  return slash === -1 ? path : path.slice(slash + 1);
}
