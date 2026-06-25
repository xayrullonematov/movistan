/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Property-based tests for API routes and domain invariants.
 *
 * Covers tasks: 13.4, 13.5, 15.2, 15.4, 22.5, 23.3
 */
import { describe, it, expect, vi } from "vitest";
import * as fc from "fast-check";
import { prisma } from "./db";
import { eventStore } from "./event-store";
import { projectSessionState, projectStateAtIndex } from "./state-projector";
import { generateSessionExport } from "./export";
import { snapshotManager } from "./snapshot-manager";
import { tokenBudgetManager } from "./token-budget-manager";
import type { PersistedEvent, EventType, AgentType, RoundStage } from "@/types/domain";

vi.mock("./snapshot-manager", async (importOriginal) => {
  const orig = await importOriginal() as any;
  return { ...orig, snapshotManager: { ...orig.snapshotManager, projectFromSnapshot: vi.fn() } };
});
vi.mock("./token-budget-manager", async (importOriginal) => {
  const orig = await importOriginal() as any;
  return { ...orig, tokenBudgetManager: { ...orig.tokenBudgetManager, getSessionUsage: vi.fn() } };
});

// =============================================================================
// Helpers
// =============================================================================

async function createSession(id: string, problemDescription: string): Promise<void> {
  await prisma.session.create({
    data: { id, problemDescription, title: problemDescription.slice(0, 50), status: "active", currentRound: 0 },
  });
}

// =============================================================================
// 13.4 — Problem Description Acceptance (Property 15)
// =============================================================================
describe("Problem Description Acceptance (Property 15 / Task 13.4)", () => {
  it("any non-empty string is accepted as a valid problem description and persisted verbatim", async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.string({ minLength: 1, maxLength: 500 }),
        async (desc) => {
          const id = `sess-pd-${Math.random().toString(36).slice(2, 10)}`;
          await createSession(id, desc);

          // Persist session-created event (mirrors POST /api/sessions)
          await eventStore.appendEvent({
            sessionId: id,
            type: "session-created",
            agentId: null,
            round: 0,
            content: { problemDescription: desc, constraints: [] },
          });

          // Verify session stores description verbatim
          const session = await prisma.session.findUniqueOrThrow({ where: { id } });
          expect(session.problemDescription).toBe(desc);

          // Verify state projection recovers it
          const events = await eventStore.getSessionEvents(id);
          const state = projectSessionState(events);
          expect(state.problemDescription).toBe(desc);
        }
      ),
      { numRuns: 20 }
    );
  });
});

// =============================================================================
// 13.5 — Constraint Persistence Round-Trip (Property 7)
// =============================================================================
describe("Constraint Persistence Round-Trip (Property 7 / Task 13.5)", () => {
  it("constraints persisted as user-intervention events are recovered in projected state", async () => {
    const constraintArb = fc.record({
      id: fc.string({ minLength: 5, maxLength: 20 }),
      text: fc.string({ minLength: 1, maxLength: 200 }),
      category: fc.constantFrom("general", "security", "performance", "ux"),
      createdAt: fc.constant(new Date().toISOString()),
    });

    await fc.assert(
      fc.asyncProperty(
        fc.array(constraintArb, { minLength: 1, maxLength: 5 }),
        async (constraints) => {
          const id = `sess-cr-${Math.random().toString(36).slice(2, 10)}`;
          await createSession(id, "Test problem");

          await eventStore.appendEvent({
            sessionId: id,
            type: "session-created",
            agentId: null,
            round: 0,
            content: { problemDescription: "Test problem", constraints: [] },
          });

          // Persist each constraint as user-intervention
          for (const c of constraints) {
            await eventStore.appendEvent({
              sessionId: id,
              type: "user-intervention",
              agentId: null,
              round: 0,
              stage: "awaiting-intervention",
              content: c,
            });
          }

          // Project state and verify constraints round-trip
          const events = await eventStore.getSessionEvents(id);
          const state = projectSessionState(events);

          expect(state.constraints.length).toBe(constraints.length);
          for (let i = 0; i < constraints.length; i++) {
            expect(state.constraints[i].text).toBe(constraints[i].text);
            expect(state.constraints[i].category).toBe(constraints[i].category);
          }
        }
      ),
      { numRuns: 15 }
    );
  });
});

// =============================================================================
// 15.2 — Export Completeness (Property 10)
// =============================================================================
describe("Export Completeness (Property 10 / Task 15.2)", () => {
  it("exported markdown contains problem description, constraints, and all artifact titles", async () => {
    const artifactArb = fc.record({
      id: fc.string({ minLength: 5 }),
      type: fc.constantFrom("decision", "risk", "assumption", "tradeoff", "open-question", "recommendation"),
      title: fc.string({ minLength: 3, maxLength: 40 }),
      content: fc.string({ minLength: 10 }),
      status: fc.constantFrom("draft", "accepted", "rejected"),
      createdByAgentId: fc.constantFrom("senior-engineer", "security-engineer", "performance-engineer", "product-engineer"),
      version: fc.integer({ min: 1 }),
      contributors: fc.array(fc.constantFrom("senior-engineer", "security-engineer", "performance-engineer", "product-engineer"), { minLength: 1, maxLength: 4 }),
    });

    const constraintArb = fc.record({
      id: fc.string({ minLength: 5 }),
      text: fc.string({ minLength: 3, maxLength: 80 }),
      category: fc.constantFrom("general", "security", "performance"),
      createdAt: fc.constant(new Date().toISOString()),
    });

    await fc.assert(
      fc.asyncProperty(
        fc.string({ minLength: 5, maxLength: 100 }), // problemDescription
        fc.array(constraintArb, { maxLength: 4 }),
        fc.array(artifactArb, { maxLength: 5 }),
        async (problemDescription, constraints, artifacts) => {
          // Mock projectFromSnapshot to return controlled state
          vi.mocked(snapshotManager.projectFromSnapshot).mockResolvedValue({
            id: "s1",
            problemDescription,
            status: "completed",
            currentRound: 1,
            currentStage: null,
            constraints,
            agents: [
              { id: "senior-engineer", displayName: "Senior Engineer", objectiveFunction: "", currentPosition: null, currentStance: null, confidence: null, hasCompletedCurrentStage: true },
              { id: "security-engineer", displayName: "Security Engineer", objectiveFunction: "", currentPosition: null, currentStance: null, confidence: null, hasCompletedCurrentStage: true },
              { id: "performance-engineer", displayName: "Performance Engineer", objectiveFunction: "", currentPosition: null, currentStance: null, confidence: null, hasCompletedCurrentStage: true },
              { id: "product-engineer", displayName: "Product Engineer", objectiveFunction: "", currentPosition: null, currentStance: null, confidence: null, hasCompletedCurrentStage: true },
            ],
            rounds: [],
            artifacts,
            consensus: null,
            tokenUsage: { totalInputTokens: 0, totalOutputTokens: 0, byRound: {}, byAgent: {} as any, estimatedCostUsd: 0 },
          });
          vi.mocked(tokenBudgetManager.getSessionUsage).mockResolvedValue({
            totalInputTokens: 100,
            totalOutputTokens: 50,
            byRound: {},
            byAgent: {} as any,
            estimatedCostUsd: 0.01,
          });

          const { markdown } = await generateSessionExport("s1");

          // Problem description appears in export
          expect(markdown).toContain(problemDescription);

          // Every constraint text appears
          for (const c of constraints) {
            expect(markdown).toContain(c.text);
          }

          // Every artifact title appears
          for (const a of artifacts) {
            expect(markdown).toContain(a.title);
          }
        }
      ),
      { numRuns: 15 }
    );
  });
});

// =============================================================================
// 15.4 — Event Replay Ordering (Property 14)
// =============================================================================
describe("Event Replay Ordering (Property 14 / Task 15.4)", () => {
  it("replay events are always returned in non-decreasing timestamp order", async () => {
    const eventTypeArb: fc.Arbitrary<EventType> = fc.constantFrom(
      "session-created", "round-started", "proposal", "critique",
      "revision", "consensus-update", "round-completed", "stage-progress"
    );

    await fc.assert(
      fc.asyncProperty(
        fc.array(
          fc.record({
            type: eventTypeArb,
            round: fc.integer({ min: 0, max: 5 }),
          }),
          { minLength: 2, maxLength: 15 }
        ),
        async (eventSpecs) => {
          const id = `sess-rp-${Math.random().toString(36).slice(2, 10)}`;
          await createSession(id, "Replay test");

          // Append events sequentially (timestamps auto-assigned in order)
          for (const spec of eventSpecs) {
            await eventStore.appendEvent({
              sessionId: id,
              type: spec.type,
              agentId: null,
              round: spec.round,
              content: "{}",
            });
          }

          // Fetch via getSessionEvents (same as replay route)
          const events = await eventStore.getSessionEvents(id);

          // Verify non-decreasing timestamp order
          for (let i = 1; i < events.length; i++) {
            expect(events[i].timestamp >= events[i - 1].timestamp).toBe(true);
          }

          // Verify projectStateAtIndex works for any valid step
          const step = Math.min(Math.floor(events.length / 2), events.length);
          const state = projectStateAtIndex(events, step);
          expect(state).toBeDefined();
          expect(state.agents).toHaveLength(4);
        }
      ),
      { numRuns: 10 }
    );
  });
});

// =============================================================================
// 22.5 — Session List Completeness (Property 13)
// =============================================================================
describe("Session List Completeness (Property 13 / Task 22.5)", () => {
  it("every created session appears in the session list", async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.array(
          fc.record({
            desc: fc.string({ minLength: 1, maxLength: 100 }),
            title: fc.string({ minLength: 1, maxLength: 50 }),
          }),
          { minLength: 1, maxLength: 5 }
        ),
        async (sessionSpecs) => {
          const ids: string[] = [];

          for (const spec of sessionSpecs) {
            const id = `sess-ls-${Math.random().toString(36).slice(2, 10)}`;
            ids.push(id);
            await prisma.session.create({
              data: { id, problemDescription: spec.desc, title: spec.title, status: "active", currentRound: 0 },
            });
          }

          // Query all sessions (mirrors GET /api/sessions)
          const sessions = await prisma.session.findMany({
            orderBy: { createdAt: "desc" },
            select: { id: true, title: true, status: true, currentRound: true },
          });

          const listedIds = sessions.map((s) => s.id);
          for (const id of ids) {
            expect(listedIds).toContain(id);
          }
        }
      ),
      { numRuns: 10 }
    );
  });
});

// =============================================================================
// 23.3 — Consensus Derives From Debate (Property 9)
// =============================================================================
describe("Consensus Derives From Debate (Property 9 / Task 23.3)", () => {
  it("consensus evidenceChain references are valid event IDs from the session", async () => {
    const agentArb: fc.Arbitrary<AgentType> = fc.constantFrom(
      "senior-engineer", "security-engineer", "performance-engineer", "product-engineer"
    );

    await fc.assert(
      fc.asyncProperty(
        fc.array(agentArb, { minLength: 2, maxLength: 4 }),
        fc.array(fc.string({ minLength: 5, maxLength: 50 }), { minLength: 1, maxLength: 3 }),
        async (agents, agreementPoints) => {
          const id = `sess-cd-${Math.random().toString(36).slice(2, 10)}`;
          await createSession(id, "Consensus test");

          // Create session-created event
          await eventStore.appendEvent({
            sessionId: id, type: "session-created", agentId: null, round: 0, content: "{}",
          });

          // Simulate round 1 with proposal events
          await eventStore.appendEvent({
            sessionId: id, type: "round-started", agentId: null, round: 1, content: "{}",
          });

          const proposalEventIds: string[] = [];
          for (const agent of agents) {
            const ev = await eventStore.appendEvent({
              sessionId: id,
              type: "proposal",
              agentId: agent,
              round: 1,
              stage: "proposal",
              content: JSON.stringify({ summary: "test", recommendations: [], risks: [], assumptions: [], confidence: 0.8, artifactSuggestions: [], references: [], needsClarification: false }),
            });
            proposalEventIds.push(ev.id);
          }

          // Create a consensus event that references the proposal event IDs as evidence
          const consensusContent = {
            agreements: agreementPoints.map((point, i) => ({
              point,
              supportingAgents: [agents[i % agents.length]],
              reasoning: "test",
              evidenceChain: [proposalEventIds[i % proposalEventIds.length]],
            })),
            disagreements: [],
            recommendedDecisions: [],
            identifiedRisks: [],
            openQuestions: [],
            overallConfidence: 0.8,
            artifactOperations: [],
          };

          await eventStore.appendEvent({
            sessionId: id,
            type: "consensus-update",
            agentId: null,
            round: 1,
            stage: "consensus",
            content: JSON.stringify(consensusContent),
          });

          // Verify: all evidenceChain IDs reference valid events in this session
          const events = await eventStore.getSessionEvents(id);
          const allEventIds = new Set(events.map((e) => e.id));

          const state = projectSessionState(events);
          if (state.consensus) {
            for (const agreement of state.consensus.agreements) {
              if (agreement.evidenceChain) {
                for (const refId of agreement.evidenceChain) {
                  expect(allEventIds.has(refId)).toBe(true);
                }
              }
            }
          }
        }
      ),
      { numRuns: 10 }
    );
  });
});
