/**
 * Unit tests for pure logic functions in workspace UI components.
 * Tests summary extraction, confidence capping, and event parsing.
 */
import { describe, it, expect } from "vitest";
import { deriveSummary } from "../DebateMessage";
import { formatConfidence } from "../ResultsDashboard";
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
