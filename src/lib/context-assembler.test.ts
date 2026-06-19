import { describe, it, expect, vi, beforeEach } from "vitest";
import * as fc from "fast-check";
import { contextAssembler } from "./context-assembler";
import { prisma } from "./db";
import { snapshotManager } from "./snapshot-manager";
import { eventStore } from "./event-store";
import { artifactSummaryService } from "./artifact-summary-service";
import { workspaceSummaryService } from "./workspace-summary-service";
import { roundSummaryService } from "./round-summary-service";
import type { Constraint, ArtifactState, RoundSummary, PersistedEvent } from "@/types/domain";

// Mock the modules
vi.mock("./db", () => ({
  prisma: {
    session: {
      findUniqueOrThrow: vi.fn(),
    },
  },
}));

vi.mock("./snapshot-manager", () => ({
  snapshotManager: {
    projectFromSnapshot: vi.fn(),
  },
}));

vi.mock("./event-store", () => ({
  eventStore: {
    getRoundEvents: vi.fn(),
  },
}));

vi.mock("./artifact-summary-service", () => ({
  artifactSummaryService: {
    generateArtifactSummary: vi.fn(),
  },
}));

vi.mock("./workspace-summary-service", () => ({
  workspaceSummaryService: {
    generateSummary: vi.fn(),
  },
}));

vi.mock("./round-summary-service", () => ({
  roundSummaryService: {
    getRoundSummaries: vi.fn(),
  },
}));

describe("ContextAssembler Property-Based Tests", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should assemble complete context when everything fits within budget", async () => {
    const mockProblemDescription = "Build a chat app.";
    const mockSession = { problemDescription: mockProblemDescription };
    const mockConstraints: Constraint[] = [
      { id: "c1", text: "React 19", category: "tech", createdAt: "" },
    ];
    const mockState = {
      currentRound: 1,
      constraints: mockConstraints,
      consensus: { disagreements: [{ point: "db model", positions: [], evidenceChain: [] }] },
    };
    const mockCurrentRoundEvents: PersistedEvent[] = [
      { id: "e1", sessionId: "s1", type: "proposal", agentId: "senior-engineer", round: 1, stage: "proposal", content: "{}", timestamp: "" },
    ];
    const mockArtifacts: ArtifactState[] = [
      { id: "a1", type: "decision", title: "DB choice", content: "Postgres", status: "draft", createdByAgentId: null, version: 1, contributors: [] },
    ];
    const mockWorkspaceSummary = "Workspace summary here.";
    const mockRoundSummaries: RoundSummary[] = [
      { roundNumber: 1, keyProposals: ["Use SQLite"], majorCritiques: [], revisionOutcomes: [], consensusPoints: [], artifactsCreated: 1, artifactsUpdated: 0 },
    ];

    vi.mocked(prisma.session.findUniqueOrThrow).mockResolvedValue(mockSession as any);
    vi.mocked(snapshotManager.projectFromSnapshot).mockResolvedValue(mockState as any);
    vi.mocked(eventStore.getRoundEvents).mockResolvedValue(mockCurrentRoundEvents);
    vi.mocked(artifactSummaryService.generateArtifactSummary).mockResolvedValue(mockArtifacts);
    vi.mocked(workspaceSummaryService.generateSummary).mockResolvedValue(mockWorkspaceSummary);
    vi.mocked(roundSummaryService.getRoundSummaries).mockResolvedValue(mockRoundSummaries);

    const context = await contextAssembler.assembleContext("s1", 100000);

    expect(context.problemDescription).toBe(mockProblemDescription);
    expect(context.constraints).toEqual(mockConstraints);
    expect(context.workspaceSummary).toBe(mockWorkspaceSummary);
    expect(context.artifactSummaries).toEqual(mockArtifacts);
    expect(context.roundSummaries).toEqual(mockRoundSummaries);
    expect(context.currentRoundEvents).toEqual(mockCurrentRoundEvents);
    expect(context.unresolvedDisagreements).toEqual(mockState.consensus.disagreements);
  });

  it("should respect context budget and truncate based on priorities", async () => {
    // Mock basic implementations
    const mockProblemDescription = "A very long problem description here...";
    vi.mocked(prisma.session.findUniqueOrThrow).mockResolvedValue({
      problemDescription: mockProblemDescription,
    } as any);

    vi.mocked(eventStore.getRoundEvents).mockResolvedValue([
      { id: "e1", sessionId: "s1", type: "proposal", agentId: "senior-engineer", round: 1, stage: "proposal", content: "{}", timestamp: "" },
    ]);

    // Arbitrary generators for context components
    const constraintsArb = fc.array(
      fc.record({
        id: fc.string({ minLength: 1 }),
        text: fc.string({ minLength: 10 }),
        category: fc.string(),
        createdAt: fc.string(),
      })
    );

    const artifactsArb = fc.array(
      fc.record({
        id: fc.string({ minLength: 1 }),
        type: fc.constantFrom("decision", "risk", "assumption", "tradeoff", "open-question", "recommendation"),
        title: fc.string({ minLength: 5 }),
        content: fc.string({ minLength: 20 }),
        status: fc.constantFrom("draft", "accepted", "rejected"),
        version: fc.integer(),
      })
    );

    const roundSummariesArb = fc.array(
      fc.record({
        roundNumber: fc.integer({ min: 1 }),
        keyProposals: fc.array(fc.string({ minLength: 10 })),
        majorCritiques: fc.array(fc.string()),
        revisionOutcomes: fc.array(fc.string()),
        consensusPoints: fc.array(fc.string()),
        artifactsCreated: fc.integer(),
        artifactsUpdated: fc.integer(),
      })
    );

    await fc.assert(
      fc.asyncProperty(
        constraintsArb,
        artifactsArb,
        roundSummariesArb,
        fc.string({ minLength: 50, maxLength: 200 }), // workspace summary
        fc.integer({ min: 50, max: 500 }),           // strict small token budget
        async (constraints, artifacts, roundSummaries, workspaceSummary, tokenBudget) => {
          // Set mock returns
          vi.mocked(snapshotManager.projectFromSnapshot).mockResolvedValue({
            currentRound: 1,
            constraints: constraints,
            consensus: { disagreements: [] },
          } as any);
          vi.mocked(artifactSummaryService.generateArtifactSummary).mockResolvedValue(artifacts as any);
          vi.mocked(workspaceSummaryService.generateSummary).mockResolvedValue(workspaceSummary);
          vi.mocked(roundSummaryService.getRoundSummaries).mockResolvedValue(roundSummaries as any);

          const context = await contextAssembler.assembleContext("s1", tokenBudget);

          // Priority 1: Current round events are NEVER truncated
          expect(context.currentRoundEvents).toHaveLength(1);

          // Let's estimate tokens for the returned context manually
          const chars =
            JSON.stringify(context.currentRoundEvents).length +
            JSON.stringify(context.artifactSummaries).length +
            JSON.stringify(context.constraints).length +
            context.workspaceSummary.length +
            JSON.stringify(context.roundSummaries).length +
            mockProblemDescription.length;

          const estimatedTokens = Math.ceil(chars / 4);

          // Budget verification: If we had to truncate, the final context should either be within the budget,
          // or if current round events + problem desc alone exceed the budget, it will at least contain ONLY those.
          const baseChars = JSON.stringify(context.currentRoundEvents).length + mockProblemDescription.length;
          const baseTokens = Math.ceil(baseChars / 4);

          if (estimatedTokens > tokenBudget) {
            // If it exceeds the budget, it must be because current round events + problem description already exceeds it,
            // or we have truncated all lower priorities.
            if (baseTokens <= tokenBudget) {
              // We should have at least truncated round summaries, workspace summaries, etc.
              expect(context.roundSummaries).toHaveLength(0);
            }
          }

          // Truncation ordering verification:
          // If roundSummaries are preserved, workspace summary MUST be preserved
          if (context.roundSummaries.length > 0) {
            expect(context.workspaceSummary).toBe(workspaceSummary);
          }
          // If workspace summary is preserved, constraints MUST be preserved
          if (context.workspaceSummary === workspaceSummary) {
            expect(context.constraints.length).toBe(constraints.length);
          }
          // If constraints are preserved, artifacts MUST be preserved
          if (context.constraints.length > 0) {
            expect(context.artifactSummaries.length).toBe(artifacts.length);
          }
        }
      )
    );
  });

  // ===========================================================================
  // 3. TASK 9.5: CONTEXT USES SUMMARIES NOT FULL HISTORY
  // ===========================================================================
  describe("Task 9.5: Context Uses Summaries Not Full History", () => {
    it("should verify agents receive round summaries (not full events) for prior rounds", async () => {
      const mockProblemDescription = "Test problem";
      vi.mocked(prisma.session.findUniqueOrThrow).mockResolvedValue({
        problemDescription: mockProblemDescription,
      } as any);

      const mockCurrentRoundEvents: PersistedEvent[] = [
        { id: "event-curr-1", sessionId: "sess-1", type: "proposal", agentId: "senior-engineer", round: 2, stage: "proposal", content: "{}", timestamp: "" },
      ];
      vi.mocked(eventStore.getRoundEvents).mockResolvedValue(mockCurrentRoundEvents);

      const mockState = {
        currentRound: 2,
        constraints: [],
        consensus: { disagreements: [] },
      };
      vi.mocked(snapshotManager.projectFromSnapshot).mockResolvedValue(mockState as any);

      const mockRoundSummaries: RoundSummary[] = [
        { roundNumber: 1, keyProposals: ["Round 1 Proposal"], majorCritiques: [], revisionOutcomes: [], consensusPoints: [], artifactsCreated: 1, artifactsUpdated: 0 },
      ];
      vi.mocked(roundSummaryService.getRoundSummaries).mockResolvedValue(mockRoundSummaries);

      // Explicitly mock other services to return small mock values so totalTokens is within budget
      vi.mocked(artifactSummaryService.generateArtifactSummary).mockResolvedValue([]);
      vi.mocked(workspaceSummaryService.generateSummary).mockResolvedValue("Test workspace summary");

      const context = await contextAssembler.assembleContext("sess-1", 100000);

      expect(context.roundSummaries).toEqual(mockRoundSummaries);
      expect(context.currentRoundEvents).toEqual(mockCurrentRoundEvents);
      const hasPriorRoundEvents = context.currentRoundEvents.some(e => e.round < 2);
      expect(hasPriorRoundEvents).toBe(false);
    });

    it("property: prior rounds are carried as summaries while only the current round contributes full events", async () => {
      const roundSummaryArb = fc.record({
        roundNumber: fc.integer({ min: 1 }),
        keyProposals: fc.array(fc.string()),
        majorCritiques: fc.array(fc.string()),
        revisionOutcomes: fc.array(fc.string()),
        consensusPoints: fc.array(fc.string()),
        artifactsCreated: fc.nat(),
        artifactsUpdated: fc.nat(),
      });

      await fc.assert(
        fc.asyncProperty(
          fc.integer({ min: 1, max: 20 }), // current round
          fc.array(roundSummaryArb, { maxLength: 8 }), // prior-round summaries
          fc.integer({ min: 0, max: 5 }), // number of current-round events
          async (currentRound, roundSummaries, eventCount) => {
            // The event store returns full events ONLY for the current round —
            // mirrors getRoundEvents(sessionId, currentRound).
            const currentRoundEvents: PersistedEvent[] = Array.from(
              { length: eventCount },
              (_, i) => ({
                id: `e${i}`,
                sessionId: "s1",
                type: "proposal",
                agentId: "senior-engineer",
                round: currentRound,
                stage: "proposal",
                content: "{}",
                timestamp: "",
              })
            );

            vi.mocked(prisma.session.findUniqueOrThrow).mockResolvedValue({
              problemDescription: "Problem",
            } as any);
            vi.mocked(snapshotManager.projectFromSnapshot).mockResolvedValue({
              currentRound,
              constraints: [],
              consensus: { disagreements: [] },
            } as any);
            vi.mocked(eventStore.getRoundEvents).mockResolvedValue(currentRoundEvents);
            vi.mocked(artifactSummaryService.generateArtifactSummary).mockResolvedValue([]);
            vi.mocked(workspaceSummaryService.generateSummary).mockResolvedValue("WS");
            vi.mocked(roundSummaryService.getRoundSummaries).mockResolvedValue(roundSummaries as any);

            // Generous budget so nothing is truncated.
            const context = await contextAssembler.assembleContext("s1", 1_000_000);

            // Full events come from the current round only — never prior rounds.
            expect(context.currentRoundEvents.every((e) => e.round === currentRound)).toBe(true);
            // The assembler scopes the full-event fetch to the current round
            // (it does not pull the entire session history).
            expect(eventStore.getRoundEvents).toHaveBeenCalledWith("s1", currentRound);
            // Prior-round knowledge is represented as compressed summaries.
            expect(context.roundSummaries).toEqual(roundSummaries);
          }
        )
      );
    });
  });
});
