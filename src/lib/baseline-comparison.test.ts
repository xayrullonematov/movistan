import { describe, it, expect } from "vitest";
import {
  generateComparisonReport,
  formatComparisonMarkdown,
  extractBaselineCategories,
  extractDebateCategories,
  computeOverlap,
  normalizeCategory,
  categoriesMatch,
  classifyCategory,
  analyzeCoverage,
  deduplicateCategories,
  type ComparisonInput,
  type ExtractedCategory,
} from "./baseline-comparison";
import type { ProposalOutput, ConsensusOutput } from "@/types/domain";
import type { BaselineResult } from "./baseline-runner";

// =============================================================================
// SYNTHETIC TEST DATA
// =============================================================================

function makeBaselineOutput(): ProposalOutput {
  return {
    summary: "Comprehensive engineering assessment",
    recommendations: [
      "Implement rate limiting on API endpoints",
      "Add database connection pooling for scalability",
      "Improve error messages for better user experience",
    ],
    risks: [
      {
        description: "SQL injection vulnerability in user input handling",
        severity: "high",
        mitigation: "Use parameterized queries",
      },
      {
        description: "No authentication on webhook endpoints",
        severity: "high",
        mitigation: "Add HMAC signature verification",
      },
      {
        description: "Memory leak in event listener cleanup",
        severity: "medium",
      },
      {
        description: "Missing database index on frequently queried columns",
        severity: "medium",
        mitigation: "Add composite index",
      },
    ],
    assumptions: ["Current traffic is under 1000 req/s"],
    confidence: 0.8,
    artifactSuggestions: [
      {
        type: "decision",
        title: "Adopt connection pooling strategy",
        content: "Use PgBouncer for connection pooling",
      },
      {
        type: "recommendation",
        title: "Migrate to parameterized queries",
        content: "Replace all string concatenation SQL with prepared statements",
      },
      {
        type: "risk",
        title: "Webhook security gap",
        content: "Unauthenticated webhooks can be spoofed",
      },
    ],
    references: [],
    needsClarification: false,
  };
}

function makeDebateConsensus(): ConsensusOutput {
  return {
    agreements: [
      {
        point: "Authentication is needed on webhook endpoints",
        supportingAgents: ["security-engineer", "senior-engineer"],
        reasoning: "Prevents spoofed webhook calls",
        evidenceChain: ["evt-1", "evt-2"],
      },
    ],
    disagreements: [
      {
        point: "Whether to use connection pooling or serverless connections",
        positions: [
          {
            agentId: "performance-engineer",
            stance: "Use connection pooling",
            reasoning: "Better for sustained workloads",
          },
          {
            agentId: "senior-engineer",
            stance: "Use serverless-friendly approach",
            reasoning: "Better for auto-scaling",
          },
        ],
        evidenceChain: ["evt-3"],
      },
    ],
    recommendedDecisions: [
      {
        title: "Implement HMAC webhook verification",
        description: "Add cryptographic verification to all webhook endpoints",
        confidence: 0.95,
      },
      {
        title: "Add API rate limiting",
        description: "Implement token bucket rate limiting per API key",
        confidence: 0.9,
      },
      {
        title: "Implement circuit breaker for external API calls",
        description: "Prevent cascade failures when third-party services are down",
        confidence: 0.85,
      },
    ],
    identifiedRisks: [
      {
        description: "SQL injection vulnerability in query builder",
        severity: "high",
        raisedBy: ["security-engineer"],
      },
      {
        description: "No authentication on webhook endpoints allows spoofing",
        severity: "high",
        raisedBy: ["security-engineer", "senior-engineer"],
      },
      {
        description: "Unbounded memory growth from uncleared event listeners",
        severity: "medium",
        raisedBy: ["performance-engineer"],
      },
      {
        description: "Cross-site scripting in user profile rendering",
        severity: "high",
        raisedBy: ["security-engineer"],
      },
      {
        description: "No graceful degradation when cache layer fails",
        severity: "medium",
        raisedBy: ["senior-engineer", "performance-engineer"],
      },
    ],
    openQuestions: [
      "What is the expected peak traffic?",
      "Are there compliance requirements (SOC2, GDPR)?",
    ],
    overallConfidence: 0.82,
    artifactOperations: [],
  };
}

function makeBaselineResult(output?: ProposalOutput): BaselineResult {
  return {
    output: output || makeBaselineOutput(),
    tokenUsage: {
      inputTokens: 5000,
      outputTokens: 2000,
      model: "test-model",
    },
    toolStats: {
      toolCallCount: 4,
      capHit: false,
      filesRead: ["src/index.ts", "src/auth.ts"],
    },
  };
}

function makeComparisonInput(): ComparisonInput {
  return {
    baselineResult: makeBaselineResult(),
    debateConsensus: makeDebateConsensus(),
    debateTokenUsage: { inputTokens: 25000, outputTokens: 12000 },
    baselineTokenUsage: { inputTokens: 5000, outputTokens: 2000 },
  };
}

// =============================================================================
// TESTS: Category Extraction
// =============================================================================

describe("extractBaselineCategories", () => {
  it("extracts risks from ProposalOutput", () => {
    const output = makeBaselineOutput();
    const categories = extractBaselineCategories(output);
    const riskCategories = categories.filter((c) => c.source === "risk");
    expect(riskCategories).toHaveLength(4);
    expect(riskCategories[0].originalText).toBe(
      "SQL injection vulnerability in user input handling"
    );
    expect(riskCategories[0].severity).toBe("high");
  });

  it("extracts decisions from artifactSuggestions", () => {
    const output = makeBaselineOutput();
    const categories = extractBaselineCategories(output);
    const decisions = categories.filter(
      (c) =>
        c.source === "decision" &&
        (c.originalText === "Adopt connection pooling strategy" ||
          c.originalText === "Migrate to parameterized queries")
    );
    // Should find both the decision and recommendation type artifacts
    expect(decisions).toHaveLength(2);
  });

  it("extracts recommendations as decision categories", () => {
    const output = makeBaselineOutput();
    const categories = extractBaselineCategories(output);
    const recs = categories.filter(
      (c) =>
        c.source === "decision" &&
        c.originalText === "Implement rate limiting on API endpoints"
    );
    expect(recs).toHaveLength(1);
  });

  it("does not extract risk-type artifact suggestions as categories", () => {
    const output = makeBaselineOutput();
    const categories = extractBaselineCategories(output);
    const riskArtifacts = categories.filter(
      (c) => c.originalText === "Webhook security gap"
    );
    // risk-type artifacts are not extracted as categories
    expect(riskArtifacts).toHaveLength(0);
  });

  it("returns correct total count of categories", () => {
    const output = makeBaselineOutput();
    const categories = extractBaselineCategories(output);
    // 4 risks + 2 artifact decisions/recs + 3 recommendations = 9
    expect(categories).toHaveLength(9);
  });
});

describe("extractDebateCategories", () => {
  it("extracts identifiedRisks from ConsensusOutput", () => {
    const consensus = makeDebateConsensus();
    const categories = extractDebateCategories(consensus);
    const risks = categories.filter((c) => c.source === "risk");
    expect(risks).toHaveLength(5);
    expect(risks[0].severity).toBe("high");
  });

  it("extracts recommendedDecisions from ConsensusOutput", () => {
    const consensus = makeDebateConsensus();
    const categories = extractDebateCategories(consensus);
    const decisions = categories.filter((c) => c.source === "decision");
    expect(decisions).toHaveLength(3);
    expect(decisions[0].originalText).toBe("Implement HMAC webhook verification");
  });

  it("returns correct total count", () => {
    const consensus = makeDebateConsensus();
    const categories = extractDebateCategories(consensus);
    // 5 risks + 3 decisions = 8
    expect(categories).toHaveLength(8);
  });
});

// =============================================================================
// TESTS: Overlap Computation
// =============================================================================

describe("normalizeCategory", () => {
  it("lowercases and trims", () => {
    expect(normalizeCategory("  SQL Injection  ")).toBe("sql injection");
  });

  it("removes trailing punctuation", () => {
    expect(normalizeCategory("Fix the bug.")).toBe("fix the bug");
    expect(normalizeCategory("Is this a risk?")).toBe("is this a risk");
  });
});

describe("categoriesMatch", () => {
  it("matches exact strings", () => {
    expect(categoriesMatch("sql injection", "sql injection")).toBe(true);
  });

  it("matches when one contains the other", () => {
    expect(
      categoriesMatch(
        "sql injection vulnerability",
        "sql injection vulnerability in user input handling"
      )
    ).toBe(true);
  });

  it("matches on word overlap >= 60%", () => {
    // "no authentication webhook endpoints" vs "no authentication on webhook endpoints allows spoofing"
    const a = "no authentication on webhook endpoints";
    const b = "no authentication on webhook endpoints allows spoofing";
    expect(categoriesMatch(a, b)).toBe(true);
  });

  it("does not match unrelated categories", () => {
    expect(categoriesMatch("sql injection", "memory leak")).toBe(false);
  });

  it("does not match short substrings (< 10 chars) via containment", () => {
    // "caching" is 7 chars -- too short for substring matching
    expect(
      categoriesMatch("caching", "improve caching strategy for session tokens")
    ).toBe(false);
    // "api" is 3 chars -- should not match
    expect(categoriesMatch("api", "api rate limiting implementation")).toBe(false);
  });

  it("matches substrings that are 10+ chars long", () => {
    // "rate limiting" is 13 chars -- long enough for substring match
    expect(
      categoriesMatch("rate limiting", "implement rate limiting on api endpoints")
    ).toBe(true);
    // "sql injection" is 13 chars
    expect(
      categoriesMatch("sql injection", "fix sql injection in query builder")
    ).toBe(true);
  });
});

describe("deduplicateCategories", () => {
  it("removes duplicates within the same arm", () => {
    const categories: ExtractedCategory[] = [
      { label: "implement rate limiting on api endpoints", originalText: "Implement rate limiting on API endpoints", source: "decision" },
      { label: "rate limiting on api endpoints", originalText: "Rate limiting on API endpoints", source: "decision" },
      { label: "sql injection vulnerability", originalText: "SQL injection", source: "risk", severity: "high" },
    ];
    const result = deduplicateCategories(categories);
    // The second rate limiting entry is a near-duplicate; should be removed
    expect(result).toHaveLength(2);
    expect(result[0].originalText).toBe("Implement rate limiting on API endpoints");
    expect(result[1].originalText).toBe("SQL injection");
  });

  it("keeps distinct categories", () => {
    const categories: ExtractedCategory[] = [
      { label: "sql injection vulnerability", originalText: "SQL injection", source: "risk", severity: "high" },
      { label: "memory leak in event listeners", originalText: "Memory leak", source: "risk", severity: "medium" },
      { label: "add api rate limiting", originalText: "Add rate limiting", source: "decision" },
    ];
    const result = deduplicateCategories(categories);
    expect(result).toHaveLength(3);
  });

  it("returns empty array for empty input", () => {
    expect(deduplicateCategories([])).toHaveLength(0);
  });

  it("deduplicates recommendations that overlap with artifactSuggestions", () => {
    // Simulates the double-counting scenario: same concern in recommendations[]
    // and artifactSuggestions of type "recommendation"
    const categories: ExtractedCategory[] = [
      { label: "migrate to parameterized queries", originalText: "Migrate to parameterized queries", source: "decision" },
      { label: "migrate to parameterized queries for all sql calls", originalText: "Migrate to parameterized queries for all SQL calls", source: "decision" },
    ];
    const result = deduplicateCategories(categories);
    expect(result).toHaveLength(1);
    expect(result[0].originalText).toBe("Migrate to parameterized queries");
  });
});

describe("computeOverlap", () => {
  it("correctly identifies overlapping categories", () => {
    const baseline: ExtractedCategory[] = [
      { label: "sql injection vulnerability", originalText: "SQL injection", source: "risk", severity: "high" },
      { label: "memory leak", originalText: "Memory leak", source: "risk", severity: "medium" },
      { label: "rate limiting", originalText: "Rate limiting", source: "decision" },
    ];
    const debate: ExtractedCategory[] = [
      { label: "sql injection vulnerability in query builder", originalText: "SQL injection in query", source: "risk", severity: "high" },
      { label: "xss vulnerability", originalText: "XSS", source: "risk", severity: "high" },
      { label: "rate limiting", originalText: "Rate limiting", source: "decision" },
    ];

    const result = computeOverlap(baseline, debate);
    expect(result.both).toHaveLength(2); // SQL injection + rate limiting
    expect(result.baselineOnly).toHaveLength(1); // memory leak
    expect(result.debateOnly).toHaveLength(1); // xss
  });

  it("handles empty inputs", () => {
    const result = computeOverlap([], []);
    expect(result.both).toHaveLength(0);
    expect(result.baselineOnly).toHaveLength(0);
    expect(result.debateOnly).toHaveLength(0);
  });

  it("handles no overlap", () => {
    const baseline: ExtractedCategory[] = [
      { label: "memory leak", originalText: "Memory leak", source: "risk" },
    ];
    const debate: ExtractedCategory[] = [
      { label: "xss vulnerability", originalText: "XSS", source: "risk" },
    ];

    const result = computeOverlap(baseline, debate);
    expect(result.both).toHaveLength(0);
    expect(result.baselineOnly).toHaveLength(1);
    expect(result.debateOnly).toHaveLength(1);
  });
});

// =============================================================================
// TESTS: Token Cost Comparison
// =============================================================================

describe("generateComparisonReport - token costs", () => {
  it("correctly reports token costs for both arms", () => {
    const input = makeComparisonInput();
    const report = generateComparisonReport(input);

    expect(report.tokenCost.baseline.inputTokens).toBe(5000);
    expect(report.tokenCost.baseline.outputTokens).toBe(2000);
    expect(report.tokenCost.baseline.totalTokens).toBe(7000);
    expect(report.tokenCost.debate.inputTokens).toBe(25000);
    expect(report.tokenCost.debate.outputTokens).toBe(12000);
    expect(report.tokenCost.debate.totalTokens).toBe(37000);
  });

  it("computes overhead multiplier correctly", () => {
    const input = makeComparisonInput();
    const report = generateComparisonReport(input);

    // 37000 / 7000 = ~5.29x
    expect(report.tokenCost.overheadMultiplier).toBeCloseTo(37000 / 7000, 2);
  });

  it("handles zero baseline tokens gracefully", () => {
    const input = makeComparisonInput();
    input.baselineTokenUsage = { inputTokens: 0, outputTokens: 0 };
    const report = generateComparisonReport(input);

    expect(report.tokenCost.overheadMultiplier).toBe(0);
  });
});

// =============================================================================
// TESTS: Coverage Analysis
// =============================================================================

describe("classifyCategory", () => {
  it("classifies security-related categories", () => {
    const lenses = classifyCategory("sql injection vulnerability in user input handling");
    expect(lenses).toContain("security");
  });

  it("classifies performance-related categories", () => {
    const lenses = classifyCategory("missing database index on frequently queried columns");
    expect(lenses).toContain("performance");
  });

  it("classifies architecture-related categories", () => {
    const lenses = classifyCategory("improve modularity and separation of concerns");
    expect(lenses).toContain("architecture");
  });

  it("classifies product-related categories", () => {
    const lenses = classifyCategory("improve error messages for better user experience");
    expect(lenses).toContain("product");
  });

  it("can classify a category into multiple lenses", () => {
    const lenses = classifyCategory("authentication design pattern for scalability");
    expect(lenses.length).toBeGreaterThanOrEqual(2);
  });

  it("returns empty array for unclassifiable categories", () => {
    const lenses = classifyCategory("something completely unrelated xyz");
    expect(lenses).toHaveLength(0);
  });
});

describe("analyzeCoverage", () => {
  it("correctly identifies which disciplines are covered", () => {
    const categories: ExtractedCategory[] = [
      { label: "sql injection vulnerability", originalText: "SQL injection", source: "risk" },
      { label: "missing database index for performance", originalText: "Missing index", source: "risk" },
      { label: "improve modularity and separation of concerns", originalText: "Modularity", source: "decision" },
    ];
    const result = analyzeCoverage(categories);

    expect(result.security).toBe(true);
    expect(result.performance).toBe(true);
    expect(result.architecture).toBe(true);
    expect(result.product).toBe(false);
  });

  it("detects clustering when only 1-2 lenses are covered", () => {
    const categories: ExtractedCategory[] = [
      { label: "sql injection vulnerability", originalText: "SQL injection", source: "risk" },
      { label: "xss vulnerability in rendering", originalText: "XSS", source: "risk" },
      { label: "authentication bypass via token manipulation", originalText: "Auth bypass", source: "risk" },
    ];
    const result = analyzeCoverage(categories);

    expect(result.security).toBe(true);
    expect(result.isClustered).toBe(true);
  });

  it("detects broad coverage when 3+ lenses are covered", () => {
    const categories: ExtractedCategory[] = [
      { label: "sql injection vulnerability", originalText: "SQL injection", source: "risk" },
      { label: "memory leak in event listener cleanup", originalText: "Memory leak", source: "risk" },
      { label: "improve modularity of component structure", originalText: "Modularity", source: "decision" },
      { label: "improve user experience for onboarding", originalText: "UX", source: "decision" },
    ];
    const result = analyzeCoverage(categories);

    expect(result.isClustered).toBe(false);
  });

  it("reports per-discipline category counts", () => {
    const categories: ExtractedCategory[] = [
      { label: "sql injection vulnerability", originalText: "SQL injection", source: "risk" },
      { label: "xss in user profile", originalText: "XSS", source: "risk" },
      { label: "missing database index for performance", originalText: "Index", source: "risk" },
    ];
    const result = analyzeCoverage(categories);

    expect(result.categoryCounts.security).toBe(2);
    expect(result.categoryCounts.performance).toBe(1);
  });
});

// =============================================================================
// TESTS: Full Comparison Report
// =============================================================================

describe("generateComparisonReport", () => {
  it("produces a complete report with all sections", () => {
    const input = makeComparisonInput();
    const report = generateComparisonReport(input);

    expect(report.categories).toBeDefined();
    expect(report.categories.baselineOnly).toBeDefined();
    expect(report.categories.debateOnly).toBeDefined();
    expect(report.categories.both).toBeDefined();
    expect(report.tokenCost).toBeDefined();
    expect(report.coverageAnalysis).toBeDefined();
    expect(report.summary).toBeDefined();
  });

  it("summary counts are consistent", () => {
    const input = makeComparisonInput();
    const report = generateComparisonReport(input);

    expect(report.summary.baselineCategoryCount).toBe(
      report.summary.overlapCount + report.summary.baselineOnlyCount
    );
    // Debate category count = overlap + debate-only
    expect(report.summary.debateCategoryCount).toBe(
      report.summary.overlapCount + report.summary.debateOnlyCount
    );
  });

  it("finds overlapping categories between baseline and debate", () => {
    const input = makeComparisonInput();
    const report = generateComparisonReport(input);

    // Both should find SQL injection and webhook authentication
    expect(report.summary.overlapCount).toBeGreaterThan(0);
  });

  it("finds debate-only categories", () => {
    const input = makeComparisonInput();
    const report = generateComparisonReport(input);

    // Debate should have XSS and circuit breaker that baseline does not
    expect(report.summary.debateOnlyCount).toBeGreaterThan(0);
  });
});

// =============================================================================
// TESTS: Markdown Formatter
// =============================================================================

describe("formatComparisonMarkdown", () => {
  it("produces valid markdown with all required sections", () => {
    const input = makeComparisonInput();
    const report = generateComparisonReport(input);
    const markdown = formatComparisonMarkdown(report);

    expect(markdown).toContain("# Baseline vs Debate Comparison Report");
    expect(markdown).toContain("## Summary");
    expect(markdown).toContain("## Category Comparison");
    expect(markdown).toContain("## Token/Cost Analysis");
    expect(markdown).toContain("## Coverage Analysis");
    expect(markdown).toContain("## Raw Data");
  });

  it("includes category lists in the output", () => {
    const input = makeComparisonInput();
    const report = generateComparisonReport(input);
    const markdown = formatComparisonMarkdown(report);

    expect(markdown).toContain("### Found by Both");
    expect(markdown).toContain("### Found Only by Baseline");
    expect(markdown).toContain("### Found Only by Debate");
  });

  it("includes token cost table", () => {
    const input = makeComparisonInput();
    const report = generateComparisonReport(input);
    const markdown = formatComparisonMarkdown(report);

    expect(markdown).toContain("| Baseline |");
    expect(markdown).toContain("| Debate (4-agent) |");
    expect(markdown).toContain("Overhead multiplier");
  });

  it("includes coverage analysis table", () => {
    const input = makeComparisonInput();
    const report = generateComparisonReport(input);
    const markdown = formatComparisonMarkdown(report);

    expect(markdown).toContain("| Architecture |");
    expect(markdown).toContain("| Security |");
    expect(markdown).toContain("| Performance |");
    expect(markdown).toContain("| Product |");
  });

  it("includes raw JSON data", () => {
    const input = makeComparisonInput();
    const report = generateComparisonReport(input);
    const markdown = formatComparisonMarkdown(report);

    expect(markdown).toContain("```json");
    // Verify it contains valid JSON
    const jsonMatch = markdown.match(/```json\n([\s\S]*?)\n```/);
    expect(jsonMatch).not.toBeNull();
    const parsed = JSON.parse(jsonMatch![1]);
    expect(parsed.categories).toBeDefined();
    expect(parsed.tokenCost).toBeDefined();
  });

  it("handles empty categories gracefully", () => {
    const input = makeComparisonInput();
    // Use an output with no risks and no recommendations
    input.baselineResult.output = {
      summary: "Empty",
      recommendations: [],
      risks: [],
      assumptions: [],
      confidence: 0.5,
      artifactSuggestions: [],
      references: [],
      needsClarification: false,
    };
    input.debateConsensus = {
      agreements: [],
      disagreements: [],
      recommendedDecisions: [],
      identifiedRisks: [],
      openQuestions: [],
      overallConfidence: 0.5,
      artifactOperations: [],
    };

    const report = generateComparisonReport(input);
    const markdown = formatComparisonMarkdown(report);

    expect(markdown).toContain("_No overlapping categories found._");
    expect(markdown).toContain("_No baseline-only categories._");
    expect(markdown).toContain("_No debate-only categories._");
  });
});
