import { describe, it, expect } from "vitest";
import * as fc from "fast-check";
import { projectSessionState, applyEvents } from "./state-projector";
import type { PersistedEvent, AgentType } from "@/types/domain";

// Helper to generate a dummy PersistedEvent
function createDummyEvent(overrides: Partial<PersistedEvent>): PersistedEvent {
  return {
    id: `event-${Math.random().toString(36).slice(2, 9)}`,
    sessionId: "session-123",
    type: "stage-progress",
    agentId: null,
    round: 0,
    stage: null,
    content: "{}",
    timestamp: new Date().toISOString(),
    ...overrides,
  };
}

describe("StateProjector Property-Based Tests", () => {
  // ===========================================================================
  // 1. DETERMINISTIC PROJECTION (Task 4.4)
  // ===========================================================================
  it("should project identical states given the same event sequence (pure function round-trip)", () => {
    // Arbitrary generator for basic event sequences
    const eventSeqArb = fc.array(
      fc.record({
        id: fc.string({ minLength: 5 }),
        type: fc.constantFrom(
          "session-created",
          "round-started",
          "round-completed",
          "proposal",
          "critique",
          "revision",
          "user-intervention",
          "consensus-update",
          "clarification-request",
          "artifact-created",
          "artifact-updated",
          "artifact-status-changed",
          "stage-progress"
        ),
        agentId: fc.oneof(
          fc.constant(null),
          fc.constantFrom("senior-engineer", "security-engineer", "performance-engineer", "product-engineer")
        ),
        round: fc.integer({ min: 0, max: 10 }),
        stage: fc.oneof(
          fc.constant(null),
          fc.constantFrom("proposal", "critique", "revision", "consensus", "awaiting-intervention")
        ),
        content: fc.constant("{}"),
        timestamp: fc.integer({ min: 0, max: 1893456000000 }).map((epoch) => new Date(epoch).toISOString()),
      })
    ).map((arr) =>
      arr.map((e) =>
        createDummyEvent({
          id: e.id,
          type: e.type as any,
          agentId: e.agentId as any,
          round: e.round,
          stage: e.stage as any,
          content: e.content,
          timestamp: e.timestamp,
        })
      )
    );

    fc.assert(
      fc.property(eventSeqArb, (events) => {
        const state1 = projectSessionState(events);
        const state2 = projectSessionState(events);

        expect(state1).toEqual(state2);
      })
    );
  });

  // ===========================================================================
  // 2. SESSION AGENT INVARIANT (Task 4.5)
  // ===========================================================================
  it("should always project a state containing exactly the four defined agents", () => {
    const eventSeqArb = fc.array(
      fc.record({
        type: fc.constantFrom("session-created", "round-started", "proposal", "stage-progress"),
        agentId: fc.oneof(
          fc.constant(null),
          fc.constantFrom("senior-engineer", "security-engineer", "performance-engineer", "product-engineer")
        ),
        round: fc.integer({ min: 0, max: 5 }),
      })
    ).map((arr) =>
      arr.map((e) =>
        createDummyEvent({
          type: e.type as any,
          agentId: e.agentId as any,
          round: e.round,
        })
      )
    );

    fc.assert(
      fc.property(eventSeqArb, (events) => {
        const state = projectSessionState(events);
        expect(state.agents).toHaveLength(4);

        const agentIds = state.agents.map((a) => a.id);
        expect(agentIds).toContain("senior-engineer");
        expect(agentIds).toContain("security-engineer");
        expect(agentIds).toContain("performance-engineer");
        expect(agentIds).toContain("product-engineer");
      })
    );
  });

  // ===========================================================================
  // 3. SNAPSHOT CONSISTENCY (Task 4.7)
  // ===========================================================================
  it("should project identical states using snapshots + incremental events versus full projection", () => {
    // Generate an event sequence of size 10 to 50
    const eventSeqArb = fc.array(
      fc.record({
        type: fc.constantFrom(
          "session-created",
          "round-started",
          "proposal",
          "critique",
          "revision",
          "consensus-update",
          "round-completed"
        ),
        agentId: fc.oneof(
          fc.constant(null),
          fc.constantFrom("senior-engineer", "security-engineer", "performance-engineer", "product-engineer")
        ),
        round: fc.integer({ min: 0, max: 5 }),
      }),
      { minLength: 10, maxLength: 50 }
    ).map((arr) =>
      arr.map((e) =>
        createDummyEvent({
          type: e.type as any,
          agentId: e.agentId as any,
          round: e.round,
        })
      )
    );

    fc.assert(
      fc.property(
        eventSeqArb,
        fc.integer({ min: 1, max: 9 }), // Split point index
        (events, splitIndex) => {
          // Adjust splitIndex to be within events bounds
          const actualSplit = Math.min(splitIndex, events.length - 1);

          const fullState = projectSessionState(events);

          // Simulate snapshotting at split point
          const snapshotEvents = events.slice(0, actualSplit);
          const remainingEvents = events.slice(actualSplit);

          const snapshotState = projectSessionState(snapshotEvents);
          const incrementalState = applyEvents(snapshotState, remainingEvents);

          expect(incrementalState).toEqual(fullState);
        }
      )
    );
  });

  // ===========================================================================
  // 4. SPECIFIC STATE CHANGE HANDLERS
  // ===========================================================================
  describe("Event Handler Specifics", () => {
    it("should update problemDescription on session-created event", () => {
      const desc = "Design a low-latency cache system.";
      const events = [
        createDummyEvent({
          type: "session-created",
          content: JSON.stringify({ problemDescription: desc }),
        }),
      ];

      const state = projectSessionState(events);
      expect(state.problemDescription).toBe(desc);
      expect(state.status).toBe("active");
    });

    it("should advance currentRound and set stage to proposal on round-started event", () => {
      const events = [
        createDummyEvent({ type: "session-created", content: "{}" }),
        createDummyEvent({ type: "round-started", round: 1, content: "{ round: 1 }" }),
      ];

      const state = projectSessionState(events);
      expect(state.currentRound).toBe(1);
      expect(state.currentStage).toBe("proposal");
    });

    it("should append constraints on user-intervention events", () => {
      const constraintText = "System must run under 100ms response time.";
      const events = [
        createDummyEvent({ type: "session-created", content: "{}" }),
        createDummyEvent({
          type: "user-intervention",
          content: JSON.stringify({ text: constraintText, category: "performance" }),
        }),
      ];

      const state = projectSessionState(events);
      expect(state.constraints).toHaveLength(1);
      expect(state.constraints[0].text).toBe(constraintText);
      expect(state.constraints[0].category).toBe("performance");
    });
  });
});
