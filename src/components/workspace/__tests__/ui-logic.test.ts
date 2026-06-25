/**
 * Unit tests for pure logic functions in workspace UI components.
 * Tests summary extraction, confidence capping, and event parsing.
 */
import { describe, it, expect } from "vitest";
import { deriveSummary } from "../DebateMessage";
import { formatConfidence } from "../ResultsDashboard";
import { buildReplayMilestones } from "../ReplayScrubber";
import { parseStageProgress } from "../ToolCallTrace";
import type { PersistedEvent } from "@/types/domain";

// ---------- deriveSummary ----------

describe("deriveSummary", () => {
  it("returns parsed.summary when available", () => {
    const parsed = { summary: "This is the summary", position: "Some position" };
    expect(deriveSummary(parsed, '{"summary":"This is the summary"}')).toBe(
      "This is the summary"
    );
  });

  it("returns parsed.position when summary is missing", () => {
    const parsed = { position: "We recommend adopting this approach" };
    expect(deriveSummary(parsed, '{"position":"We recommend adopting this approach"}')).toBe(
      "We recommend adopting this approach"
    );
  });

  it("returns parsed.recommendation when summary and position are missing", () => {
    const parsed = { recommendation: "Use Redis for caching" };
    expect(deriveSummary(parsed, '{"recommendation":"Use Redis for caching"}')).toBe(
      "Use Redis for caching"
    );
  });

  it("returns parsed.assessment when other fields are missing", () => {
    const parsed = { assessment: "The system is performant", other: "data" };
    expect(deriveSummary(parsed, '{"assessment":"The system is performant"}')).toBe(
      "The system is performant"
    );
  });

  it("falls back to raw content slice when parsed has no known text fields", () => {
    const parsed = { objections: [{ point: "too slow" }], agreements: [] };
    const raw = '{"objections":[{"point":"too slow"}],"agreements":[]}';
    expect(deriveSummary(parsed, raw)).toBe(raw.slice(0, 100));
  });

  it("falls back to raw content slice when parsed is null", () => {
    const raw = "This is plain text content that is not JSON";
    expect(deriveSummary(null, raw)).toBe(raw.slice(0, 100));
  });

  it("truncates raw content to 100 characters", () => {
    const raw = "A".repeat(200);
    expect(deriveSummary(null, raw)).toHaveLength(100);
  });

  it("trims whitespace from summary fields", () => {
    const parsed = { summary: "  trimmed summary  " };
    expect(deriveSummary(parsed, "raw")).toBe("trimmed summary");
  });

  it("skips empty summary and falls through to position", () => {
    const parsed = { summary: "   ", position: "Fallback to position" };
    expect(deriveSummary(parsed, "raw")).toBe("Fallback to position");
  });
});

// ---------- formatConfidence ----------

describe("formatConfidence", () => {
  it("converts 0-1 fraction to percentage", () => {
    expect(formatConfidence(0.85)).toBe(85);
  });

  it("converts 0 to 0%", () => {
    expect(formatConfidence(0)).toBe(0);
  });

  it("converts 1 to 100%", () => {
    expect(formatConfidence(1)).toBe(100);
  });

  it("treats values > 1 as already a percentage", () => {
    expect(formatConfidence(72)).toBe(72);
  });

  it("rounds fractional percentages that are > 1", () => {
    expect(formatConfidence(85.7)).toBe(86);
  });

  it("rounds fractional values in 0-1 range", () => {
    expect(formatConfidence(0.857)).toBe(86);
  });

  it("handles edge case of 1.0 as 100%", () => {
    // Exactly 1 is treated as a fraction (1 * 100 = 100)
    expect(formatConfidence(1.0)).toBe(100);
  });
});

// ---------- parseStageProgress ----------

describe("parseStageProgress", () => {
  function makeEvent(content: string, overrides?: Partial<PersistedEvent>): PersistedEvent {
    return {
      id: "evt-1",
      sessionId: "sess-1",
      type: "stage-progress",
      round: 1,
      stage: "proposal",
      agentId: "senior-engineer",
      content,
      timestamp: new Date().toISOString(),
      ...overrides,
    } as PersistedEvent;
  }

  it("parses a valid grounded event", () => {
    const content = JSON.stringify({
      agentId: "security-engineer",
      stage: "proposal",
      status: "completed",
      toolCallCount: 5,
      capHit: false,
      filesRead: ["src/auth.ts", "src/middleware.ts"],
      groundedByRepo: true,
    });
    const result = parseStageProgress(makeEvent(content));
    expect(result).not.toBeNull();
    expect(result!.agentId).toBe("security-engineer");
    expect(result!.toolCallCount).toBe(5);
    expect(result!.filesRead).toEqual(["src/auth.ts", "src/middleware.ts"]);
    expect(result!.capHit).toBe(false);
    expect(result!.groundedByRepo).toBe(true);
  });

  it("returns null for non-grounded events", () => {
    const content = JSON.stringify({
      agentId: "senior-engineer",
      stage: "proposal",
      status: "completed",
      toolCallCount: 3,
      groundedByRepo: false,
    });
    expect(parseStageProgress(makeEvent(content))).toBeNull();
  });

  it("returns null for events where groundedByRepo is missing", () => {
    const content = JSON.stringify({
      agentId: "senior-engineer",
      stage: "proposal",
      status: "completed",
    });
    expect(parseStageProgress(makeEvent(content))).toBeNull();
  });

  it("returns null for invalid JSON content", () => {
    expect(parseStageProgress(makeEvent("not json at all"))).toBeNull();
  });

  it("falls back to event.agentId when content.agentId is missing", () => {
    const content = JSON.stringify({
      stage: "proposal",
      status: "in-progress",
      toolCallCount: 2,
      groundedByRepo: true,
    });
    const result = parseStageProgress(makeEvent(content, { agentId: "performance-engineer" }));
    expect(result).not.toBeNull();
    expect(result!.agentId).toBe("performance-engineer");
  });

  it("falls back to senior-engineer when both agentId fields are missing", () => {
    const content = JSON.stringify({
      stage: "proposal",
      status: "completed",
      toolCallCount: 1,
      groundedByRepo: true,
    });
    const event = makeEvent(content);
    // Clear the event-level agentId
    (event as Record<string, unknown>).agentId = undefined;
    const result = parseStageProgress(event);
    expect(result).not.toBeNull();
    expect(result!.agentId).toBe("senior-engineer");
  });

  it("defaults filesRead to empty array when not provided", () => {
    const content = JSON.stringify({
      agentId: "senior-engineer",
      stage: "proposal",
      status: "completed",
      toolCallCount: 0,
      groundedByRepo: true,
    });
    const result = parseStageProgress(makeEvent(content));
    expect(result).not.toBeNull();
    expect(result!.filesRead).toEqual([]);
  });

  it("defaults capHit to false when not provided", () => {
    const content = JSON.stringify({
      agentId: "senior-engineer",
      stage: "proposal",
      status: "completed",
      groundedByRepo: true,
    });
    const result = parseStageProgress(makeEvent(content));
    expect(result).not.toBeNull();
    expect(result!.capHit).toBe(false);
  });
});


// ---------- buildReplayMilestones ----------

describe("buildReplayMilestones", () => {
  function makeReplayEvent(overrides: Partial<PersistedEvent>): PersistedEvent {
    return {
      id: overrides.id ?? `evt-${Math.random().toString(36).slice(2, 8)}`,
      sessionId: "sess-1",
      type: "session-created",
      round: 0,
      stage: null,
      agentId: null,
      content: "{}",
      timestamp: new Date().toISOString(),
      ...overrides,
    } as PersistedEvent;
  }

  it("turns replay events into customer-facing milestones", () => {
    const events: PersistedEvent[] = [
      makeReplayEvent({
        id: "created",
        type: "session-created",
        content: JSON.stringify({ problemDescription: "Choose the safest rollout strategy." }),
      }),
      makeReplayEvent({ id: "round-started", type: "round-started", round: 1, stage: "proposal", content: JSON.stringify({ round: 1 }) }),
      makeReplayEvent({ id: "progress", type: "stage-progress", round: 1, stage: "proposal", content: JSON.stringify({ status: "completed" }) }),
      makeReplayEvent({ id: "proposal", type: "proposal", round: 1, stage: "proposal", agentId: "senior-engineer", content: JSON.stringify({ summary: "Use a phased rollout." }) }),
      makeReplayEvent({ id: "critique", type: "critique", round: 1, stage: "critique", agentId: "security-engineer", content: JSON.stringify({ summary: "Audit the auth path." }) }),
      makeReplayEvent({
        id: "consensus",
        type: "consensus-update",
        round: 1,
        stage: "consensus",
        content: JSON.stringify({
          recommendedDecisions: [{ title: "Ship behind a feature flag", confidence: 0.86 }],
          overallConfidence: 0.8,
        }),
      }),
      makeReplayEvent({
        id: "risk",
        type: "artifact-created",
        agentId: "security-engineer",
        content: JSON.stringify({ artifactId: "risk-1", type: "risk", title: "Privileged users bypass beta gate" }),
      }),
      makeReplayEvent({ id: "complete", type: "round-completed", round: 1, content: JSON.stringify({ round: 1 }) }),
    ];

    const milestones = buildReplayMilestones(events);

    expect(milestones.map((milestone) => milestone.title)).toEqual([
      "Decision review created",
      "Round 1 started",
      "Proposal stage completed",
      "Critique stage completed",
      "Consensus: Ship behind a feature flag",
      "Risk added",
      "Round 1 completed",
    ]);
    expect(milestones.some((milestone) => milestone.title === "Stage progress")).toBe(false);
    expect(milestones.find((milestone) => milestone.title === "Risk added")?.tone).toBe("risk");
  });

  it("uses one milestone per round stage even when multiple agents contribute", () => {
    const events: PersistedEvent[] = [
      makeReplayEvent({ id: "round-started", type: "round-started", round: 1, stage: "proposal", content: JSON.stringify({ round: 1 }) }),
      makeReplayEvent({ id: "proposal-1", type: "proposal", round: 1, stage: "proposal", agentId: "senior-engineer", content: JSON.stringify({ summary: "A" }) }),
      makeReplayEvent({ id: "proposal-2", type: "proposal", round: 1, stage: "proposal", agentId: "security-engineer", content: JSON.stringify({ summary: "B" }) }),
      makeReplayEvent({ id: "revision", type: "revision", round: 1, stage: "revision", agentId: "product-engineer", content: JSON.stringify({ summary: "C" }) }),
    ];

    const milestones = buildReplayMilestones(events);

    expect(milestones.filter((milestone) => milestone.title === "Proposal stage completed")).toHaveLength(1);
    expect(milestones.filter((milestone) => milestone.title === "Revision stage completed")).toHaveLength(1);
  });
});
