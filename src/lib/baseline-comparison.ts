/**
 * Baseline Comparison Module
 *
 * Compares the output of a single-pass baseline LLM call against the full
 * 4-agent debate consensus. Produces metrics on:
 * 1. Primary: distinct risk/decision categories surfaced (overlap analysis)
 * 2. Secondary: token/cost overhead (debate vs baseline)
 * 3. Optional: coverage check (does baseline cluster on 1-2 lenses?)
 */

import type { ProposalOutput, ConsensusOutput, Severity } from "@/types/domain";
import type { BaselineResult } from "@/lib/baseline-runner";

// =============================================================================
// INTERFACES
// =============================================================================

/** Token usage for one arm of the comparison */
export interface ArmTokenUsage {
  inputTokens: number;
  outputTokens: number;
}

/** Input data for the comparison */
export interface ComparisonInput {
  /** Result from the baseline single-pass run */
  baselineResult: BaselineResult;
  /** Consensus output from the 4-agent debate */
  debateConsensus: ConsensusOutput;
  /** Aggregate token usage for the full debate (all agents, all rounds) */
  debateTokenUsage: ArmTokenUsage;
  /** Token usage for the baseline call */
  baselineTokenUsage: ArmTokenUsage;
}

/** A normalized category extracted from outputs */
export interface ExtractedCategory {
  /** Normalized category label */
  label: string;
  /** Original text that was normalized */
  originalText: string;
  /** Source: risk or decision */
  source: "risk" | "decision";
  /** Severity if applicable */
  severity?: Severity;
}

/** Discipline lens for coverage analysis */
export type DisciplineLens =
  | "architecture"
  | "security"
  | "performance"
  | "product";

/** Coverage analysis for the baseline */
export interface CoverageAnalysis {
  /** Whether the baseline touched each discipline */
  architecture: boolean;
  security: boolean;
  performance: boolean;
  product: boolean;
  /** Per-discipline category counts */
  categoryCounts: Record<DisciplineLens, number>;
  /** Whether baseline clusters on 1-2 lenses (true = clustered, false = balanced) */
  isClustered: boolean;
}

/** The full comparison report */
export interface ComparisonReport {
  /** Categories found in both baseline and debate */
  categories: {
    baselineOnly: ExtractedCategory[];
    debateOnly: ExtractedCategory[];
    both: ExtractedCategory[];
  };
  /** Token cost comparison */
  tokenCost: {
    baseline: ArmTokenUsage & { totalTokens: number };
    debate: ArmTokenUsage & { totalTokens: number };
    overheadMultiplier: number;
  };
  /** Coverage analysis for baseline output */
  coverageAnalysis: CoverageAnalysis;
  /** Summary statistics */
  summary: {
    baselineCategoryCount: number;
    debateCategoryCount: number;
    overlapCount: number;
    baselineOnlyCount: number;
    debateOnlyCount: number;
  };
}

// =============================================================================
// KEYWORD DICTIONARIES FOR DISCIPLINE CLASSIFICATION
// =============================================================================

const ARCHITECTURE_KEYWORDS = [
  "architect",
  "modularity",
  "modular",
  "coupling",
  "cohesion",
  "separation of concerns",
  "dependency",
  "dependencies",
  "abstraction",
  "pattern",
  "design",
  "component",
  "structure",
  "layer",
  "interface",
  "extensib",
  "maintainab",
  "refactor",
  "monolith",
  "microservice",
  "api design",
  "schema",
  "migration",
  "data model",
  "encapsulat",
  "single responsibility",
  "solid",
  "decoupl",
];

const SECURITY_KEYWORDS = [
  "security",
  "vulnerab",
  "authenticat",
  "authorizat",
  "injection",
  "xss",
  "csrf",
  "encrypt",
  "token",
  "jwt",
  "oauth",
  "cors",
  "sanitiz",
  "validat",
  "permission",
  "privilege",
  "access control",
  "attack",
  "exploit",
  "credential",
  "secret",
  "leak",
  "exposure",
  "compliance",
  "audit",
  "ssl",
  "tls",
  "cert",
  "hash",
  "password",
  "brute force",
  "rate limit",
  "dos",
  "ddos",
];

const PERFORMANCE_KEYWORDS = [
  "performance",
  "scalab",
  "latency",
  "throughput",
  "bottleneck",
  "cache",
  "caching",
  "memory",
  "cpu",
  "concurrency",
  "parallel",
  "async",
  "batch",
  "index",
  "query optim",
  "n+1",
  "load",
  "response time",
  "resource",
  "pool",
  "connection pool",
  "garbage collect",
  "profiling",
  "benchmark",
  "throttl",
  "debounce",
  "lazy load",
  "pagination",
  "stream",
  "buffer",
];

const PRODUCT_KEYWORDS = [
  "user experience",
  "ux",
  "ui",
  "usability",
  "accessibility",
  "a11y",
  "feature",
  "backward compat",
  "breaking change",
  "migration path",
  "documentation",
  "onboarding",
  "edge case",
  "error message",
  "user feedback",
  "business",
  "customer",
  "workflow",
  "adoption",
  "friction",
  "intuitive",
  "discoverab",
  "feedback",
  "notificat",
  "i18n",
  "l10n",
  "localization",
  "responsive",
  "mobile",
];

// =============================================================================
// CATEGORY EXTRACTION
// =============================================================================

/**
 * Normalize a text string into a category label.
 * Lowercases, trims, and removes trailing punctuation for consistent comparison.
 */
export function normalizeCategory(text: string): string {
  return text.toLowerCase().trim().replace(/[.!?;:]+$/, "").trim();
}

/**
 * Extract categories from a ProposalOutput (baseline output).
 * Categories come from:
 * - risks (risk.description)
 * - artifactSuggestions where type is 'decision' or 'recommendation' (title)
 * - recommendations (each recommendation string)
 */
export function extractBaselineCategories(
  output: ProposalOutput
): ExtractedCategory[] {
  const categories: ExtractedCategory[] = [];

  // Extract from risks
  for (const risk of output.risks) {
    categories.push({
      label: normalizeCategory(risk.description),
      originalText: risk.description,
      source: "risk",
      severity: risk.severity,
    });
  }

  // Extract from artifact suggestions (decisions/recommendations)
  for (const artifact of output.artifactSuggestions) {
    if (artifact.type === "decision" || artifact.type === "recommendation") {
      categories.push({
        label: normalizeCategory(artifact.title),
        originalText: artifact.title,
        source: "decision",
      });
    }
  }

  // Extract from recommendations array
  for (const rec of output.recommendations) {
    categories.push({
      label: normalizeCategory(rec),
      originalText: rec,
      source: "decision",
    });
  }

  return categories;
}

/**
 * Extract categories from a ConsensusOutput (debate output).
 * Categories come from:
 * - identifiedRisks (description)
 * - recommendedDecisions (title)
 */
export function extractDebateCategories(
  consensus: ConsensusOutput
): ExtractedCategory[] {
  const categories: ExtractedCategory[] = [];

  // Extract from identified risks
  for (const risk of consensus.identifiedRisks) {
    categories.push({
      label: normalizeCategory(risk.description),
      originalText: risk.description,
      source: "risk",
      severity: risk.severity,
    });
  }

  // Extract from recommended decisions
  for (const decision of consensus.recommendedDecisions) {
    categories.push({
      label: normalizeCategory(decision.title),
      originalText: decision.title,
      source: "decision",
    });
  }

  return categories;
}

// =============================================================================
// OVERLAP COMPUTATION
// =============================================================================

/**
 * Minimum character length for substring matching to fire.
 * Prevents short labels like "api" or "caching" from over-matching
 * longer, unrelated descriptions that happen to contain the substring.
 */
const MIN_SUBSTRING_LENGTH = 10;

/**
 * Compute similarity between two category labels.
 * Uses substring matching (with a minimum length guard) and word overlap
 * to determine if two categories refer to the same concern.
 *
 * Returns true if the categories are considered matching.
 */
export function categoriesMatch(a: string, b: string): boolean {
  // Exact match
  if (a === b) return true;

  // One contains the other (substring match) -- only if the contained
  // string is long enough to be meaningful (>= MIN_SUBSTRING_LENGTH chars).
  // This prevents short labels like "api" or "caching" from matching
  // any description that happens to include them as a substring.
  const shorter = a.length <= b.length ? a : b;
  const longer = a.length <= b.length ? b : a;
  if (shorter.length >= MIN_SUBSTRING_LENGTH && longer.includes(shorter)) {
    return true;
  }

  // Word overlap: if 60%+ of words overlap, consider a match.
  // Require at least 2 significant words in the smaller set to avoid
  // single-word labels (e.g., "caching") matching any multi-word description
  // that happens to include that word.
  const wordsA = new Set(a.split(/\s+/).filter((w) => w.length > 2));
  const wordsB = new Set(b.split(/\s+/).filter((w) => w.length > 2));

  if (wordsA.size === 0 || wordsB.size === 0) return false;

  const minSize = Math.min(wordsA.size, wordsB.size);
  if (minSize < 2) return false;

  let overlap = 0;
  for (const word of wordsA) {
    if (wordsB.has(word)) overlap++;
  }

  return overlap / minSize >= 0.6;
}

/**
 * Deduplicate a list of extracted categories using the same `categoriesMatch`
 * heuristic used for cross-arm overlap. When two categories within the same
 * arm refer to the same concern (e.g., a recommendation that also appears as
 * an artifactSuggestion), only the first occurrence is kept.
 */
export function deduplicateCategories(
  categories: ExtractedCategory[]
): ExtractedCategory[] {
  const result: ExtractedCategory[] = [];
  for (const cat of categories) {
    const isDuplicate = result.some((existing) =>
      categoriesMatch(existing.label, cat.label)
    );
    if (!isDuplicate) {
      result.push(cat);
    }
  }
  return result;
}

/**
 * Compute overlap between baseline and debate categories.
 * Returns three sets: baseline-only, debate-only, and both.
 */
export function computeOverlap(
  baselineCategories: ExtractedCategory[],
  debateCategories: ExtractedCategory[]
): {
  baselineOnly: ExtractedCategory[];
  debateOnly: ExtractedCategory[];
  both: ExtractedCategory[];
} {
  const matchedBaseline = new Set<number>();
  const matchedDebate = new Set<number>();
  const both: ExtractedCategory[] = [];

  // Find matches
  for (let i = 0; i < baselineCategories.length; i++) {
    for (let j = 0; j < debateCategories.length; j++) {
      if (matchedDebate.has(j)) continue;
      if (categoriesMatch(baselineCategories[i].label, debateCategories[j].label)) {
        matchedBaseline.add(i);
        matchedDebate.add(j);
        both.push(baselineCategories[i]);
        break;
      }
    }
  }

  const baselineOnly = baselineCategories.filter((_, i) => !matchedBaseline.has(i));
  const debateOnly = debateCategories.filter((_, i) => !matchedDebate.has(i));

  return { baselineOnly, debateOnly, both };
}

// =============================================================================
// COVERAGE ANALYSIS
// =============================================================================

/**
 * Classify a category into discipline lenses using keyword heuristics.
 * A category can match multiple lenses; returns all matching ones.
 */
export function classifyCategory(label: string): DisciplineLens[] {
  const lenses: DisciplineLens[] = [];

  if (ARCHITECTURE_KEYWORDS.some((kw) => label.includes(kw))) {
    lenses.push("architecture");
  }
  if (SECURITY_KEYWORDS.some((kw) => label.includes(kw))) {
    lenses.push("security");
  }
  if (PERFORMANCE_KEYWORDS.some((kw) => label.includes(kw))) {
    lenses.push("performance");
  }
  if (PRODUCT_KEYWORDS.some((kw) => label.includes(kw))) {
    lenses.push("product");
  }

  return lenses;
}

/**
 * Perform coverage analysis on baseline categories.
 * Determines which disciplines the baseline touches and whether it clusters.
 */
export function analyzeCoverage(
  categories: ExtractedCategory[]
): CoverageAnalysis {
  const counts: Record<DisciplineLens, number> = {
    architecture: 0,
    security: 0,
    performance: 0,
    product: 0,
  };

  for (const cat of categories) {
    const lenses = classifyCategory(cat.label);
    for (const lens of lenses) {
      counts[lens]++;
    }
  }

  const architecture = counts.architecture > 0;
  const security = counts.security > 0;
  const performance = counts.performance > 0;
  const product = counts.product > 0;

  // Determine clustering: if 2 or fewer lenses are covered out of 4
  const lensesCovered = [architecture, security, performance, product].filter(
    Boolean
  ).length;
  const isClustered = lensesCovered <= 2;

  return {
    architecture,
    security,
    performance,
    product,
    categoryCounts: counts,
    isClustered,
  };
}

// =============================================================================
// MAIN COMPARISON FUNCTION
// =============================================================================

/**
 * Generate a comparison report between baseline and debate outputs.
 *
 * Computes:
 * 1. Category overlap (what both found, what each uniquely found)
 * 2. Token cost comparison (overhead of debate vs baseline)
 * 3. Coverage analysis (discipline lens distribution for baseline)
 */
export function generateComparisonReport(
  input: ComparisonInput
): ComparisonReport {
  // Extract categories from both arms, then deduplicate within each arm
  // to avoid inflating counts when the LLM produces the same concern in
  // multiple output fields (e.g., recommendations[] and artifactSuggestions).
  const rawBaselineCategories = extractBaselineCategories(input.baselineResult.output);
  const rawDebateCategories = extractDebateCategories(input.debateConsensus);
  const baselineCategories = deduplicateCategories(rawBaselineCategories);
  const debateCategories = deduplicateCategories(rawDebateCategories);

  // Compute overlap
  const { baselineOnly, debateOnly, both } = computeOverlap(
    baselineCategories,
    debateCategories
  );

  // Token costs
  const baselineTotalTokens =
    input.baselineTokenUsage.inputTokens + input.baselineTokenUsage.outputTokens;
  const debateTotalTokens =
    input.debateTokenUsage.inputTokens + input.debateTokenUsage.outputTokens;
  const overheadMultiplier =
    baselineTotalTokens > 0 ? debateTotalTokens / baselineTotalTokens : 0;

  // Coverage analysis
  const coverageAnalysis = analyzeCoverage(baselineCategories);

  return {
    categories: { baselineOnly, debateOnly, both },
    tokenCost: {
      baseline: { ...input.baselineTokenUsage, totalTokens: baselineTotalTokens },
      debate: { ...input.debateTokenUsage, totalTokens: debateTotalTokens },
      overheadMultiplier,
    },
    coverageAnalysis,
    summary: {
      baselineCategoryCount: baselineCategories.length,
      debateCategoryCount: debateCategories.length,
      overlapCount: both.length,
      baselineOnlyCount: baselineOnly.length,
      debateOnlyCount: debateOnly.length,
    },
  };
}

// =============================================================================
// MARKDOWN FORMATTER
// =============================================================================

/**
 * Format a comparison report as readable markdown.
 */
export function formatComparisonMarkdown(report: ComparisonReport): string {
  const lines: string[] = [];

  // Header
  lines.push("# Baseline vs Debate Comparison Report");
  lines.push("");

  // Summary section
  lines.push("## Summary");
  lines.push("");
  lines.push("| Metric | Baseline | Debate | Overlap |");
  lines.push("|--------|----------|--------|---------|");
  lines.push(
    `| Distinct categories | ${report.summary.baselineCategoryCount} | ${report.summary.debateCategoryCount} | ${report.summary.overlapCount} |`
  );
  lines.push(
    `| Unique categories | ${report.summary.baselineOnlyCount} | ${report.summary.debateOnlyCount} | - |`
  );
  lines.push("");

  // Category comparison section
  lines.push("## Category Comparison");
  lines.push("");

  lines.push("### Found by Both");
  lines.push("");
  if (report.categories.both.length === 0) {
    lines.push("_No overlapping categories found._");
  } else {
    for (const cat of report.categories.both) {
      lines.push(
        `- **[${cat.source}]** ${cat.originalText}${cat.severity ? ` (${cat.severity})` : ""}`
      );
    }
  }
  lines.push("");

  lines.push("### Found Only by Baseline");
  lines.push("");
  if (report.categories.baselineOnly.length === 0) {
    lines.push("_No baseline-only categories._");
  } else {
    for (const cat of report.categories.baselineOnly) {
      lines.push(
        `- **[${cat.source}]** ${cat.originalText}${cat.severity ? ` (${cat.severity})` : ""}`
      );
    }
  }
  lines.push("");

  lines.push("### Found Only by Debate");
  lines.push("");
  if (report.categories.debateOnly.length === 0) {
    lines.push("_No debate-only categories._");
  } else {
    for (const cat of report.categories.debateOnly) {
      lines.push(
        `- **[${cat.source}]** ${cat.originalText}${cat.severity ? ` (${cat.severity})` : ""}`
      );
    }
  }
  lines.push("");

  // Token/Cost analysis section
  lines.push("## Token/Cost Analysis");
  lines.push("");
  lines.push("| Arm | Input Tokens | Output Tokens | Total Tokens |");
  lines.push("|-----|-------------|---------------|--------------|");
  lines.push(
    `| Baseline | ${report.tokenCost.baseline.inputTokens.toLocaleString()} | ${report.tokenCost.baseline.outputTokens.toLocaleString()} | ${report.tokenCost.baseline.totalTokens.toLocaleString()} |`
  );
  lines.push(
    `| Debate (4-agent) | ${report.tokenCost.debate.inputTokens.toLocaleString()} | ${report.tokenCost.debate.outputTokens.toLocaleString()} | ${report.tokenCost.debate.totalTokens.toLocaleString()} |`
  );
  lines.push("");
  lines.push(
    `**Overhead multiplier:** ${report.tokenCost.overheadMultiplier.toFixed(2)}x (debate uses ${report.tokenCost.overheadMultiplier.toFixed(2)}x the tokens of baseline)`
  );
  lines.push("");

  // Coverage analysis section
  lines.push("## Coverage Analysis");
  lines.push("");
  lines.push(
    "Does the baseline touch all 4 discipline lenses, or cluster on 1-2?"
  );
  lines.push("");
  lines.push("| Discipline | Covered | Category Count |");
  lines.push("|-----------|---------|----------------|");
  const lenses: DisciplineLens[] = [
    "architecture",
    "security",
    "performance",
    "product",
  ];
  for (const lens of lenses) {
    const covered = report.coverageAnalysis[lens] ? "Yes" : "No";
    const count = report.coverageAnalysis.categoryCounts[lens];
    lines.push(
      `| ${lens.charAt(0).toUpperCase() + lens.slice(1)} | ${covered} | ${count} |`
    );
  }
  lines.push("");
  lines.push(
    `**Assessment:** ${report.coverageAnalysis.isClustered ? "Baseline clusters on 1-2 lenses (limited coverage)" : "Baseline touches 3+ lenses (broad coverage)"}`
  );
  lines.push("");

  // Raw data section
  lines.push("## Raw Data");
  lines.push("");
  lines.push("```json");
  lines.push(JSON.stringify(report, null, 2));
  lines.push("```");
  lines.push("");

  return lines.join("\n");
}
