import { describe, it, expect, vi, beforeEach } from "vitest";
import * as fc from "fast-check";

// =============================================================================
// LLM provider stub
//
// We intercept createLLMProvider with a deterministic fake that returns
// schema-valid JSON for each stage, discriminating by unique substrings in
// the system prompt (which is the only signal the orchestrator gives us).
// State is held in module-level `currentSpec` so each test can vary the
// stub's behavior without re-wiring the mock.
//
// `concurrency` is a separate global tracker used by the parallelism PBT
// (Task 11.5) — every stub call increments a per-stage counter on entry,
// awaits a small delay, then decrements on exit. Max observed concurrency
// per stage tells us whether the orchestrator dispatched in parallel.
// =============================================================================

type DebateStage = "proposal" | "critique" | "revision" | "consensus";
type AgentId =
  | "senior-engineer"
  | "security-engineer"
  | "performance-engineer"
  | "product-engineer";

type Spec = {
  proposalConfidence: number;
  critiqueConfidence: number;
  revisionStance: "agree" | "disagree" | "strengthen";
  consensusConfidence: number;
  // 11.4 — when set, the named agent emits needsClarification=true at the
  // named stage and the orchestrator should pause the round there.
  clarifyAt: { stage: "proposal" | "critique" | "revision"; agentId: AgentId } | null;
  // 11.6 — operations returned in the consensus stub's artifactOperations.
  consensusArtifactOps: Array<{
    operation: "create";
    type: "decision" | "risk" | "assumption" | "tradeoff" | "open-question" | "recommendation";
    title: string;
    content: string;
  }>;
  // 11.5 — extra delay in the stub to amplify the parallel-vs-sequential
  // signal. Total wall time scales with this for sequential dispatch.
  stubDelayMs: number;
};

const DEFAULT_SPEC: Spec = {
  proposalConfidence: 0.5,
  critiqueConfidence: 0.5,
  revisionStance: "agree",
  consensusConfidence: 0.5,
  clarifyAt: null,
  consensusArtifactOps: [],
  stubDelayMs: 0,
};

let currentSpec: Spec = { ...DEFAULT_SPEC };

const concurrency: Record<DebateStage, { current: number; max: number }> = {
  proposal: { current: 0, max: 0 },
  critique: { current: 0, max: 0 },
  revision: { current: 0, max: 0 },
  consensus: { current: 0, max: 0 },
};

function resetConcurrency(): void {
  for (const stage of Object.keys(concurrency) as DebateStage[]) {
    concurrency[stage] = { current: 0, max: 0 };
  }
}

const DISPLAY_TO_ID: Record<string, AgentId> = {
  "Senior Engineer": "senior-engineer",
  "Security Engineer": "security-engineer",
  "Performance Engineer": "performance-engineer",
  "Product Engineer": "product-engineer",
};

const CRITIQUE_TARGET: Record<AgentId, AgentId> = {
  "senior-engineer": "performance-engineer",
  "performance-engineer": "senior-engineer",
  "security-engineer": "product-engineer",
  "product-engineer": "security-engineer",
};

function detectStage(systemPrompt: string): DebateStage {
  // Order matters: each stage's schema has at least one unique literal
  // string, so we discriminate by checking the most-specific ones first.
  // The shared preamble mentions every stage name and even some schema
  // hints, so the discriminators must be tokens that ONLY appear in their
  // stage's schema description (not in the preamble or other stages):
  //   - consensus  → "overallConfidence" (only in consensus schema)
  //   - revision   → "concededPoints"    (only in revision schema)
  //   - critique   → "targetAgentId"     (only in critique schema)
  if (systemPrompt.includes("overallConfidence")) return "consensus";
  if (systemPrompt.includes("concededPoints")) return "revision";
  if (systemPrompt.includes("targetAgentId")) return "critique";
  return "proposal";
}

function callingAgentId(systemPrompt: string): AgentId | null {
  const match = systemPrompt.match(
    /^You are (Senior Engineer|Security Engineer|Performance Engineer|Product Engineer)\./m
  );
  return match ? DISPLAY_TO_ID[match[1]] ?? null : null;
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

vi.mock("@/lib/llm-provider", () => ({
  createLLMProvider: () => ({
    async complete(request: { systemPrompt: string; userMessage: string }) {
      const stage = detectStage(request.systemPrompt);
      const agentId = callingAgentId(request.systemPrompt);

      // Concurrency tracking (Task 11.5).
      concurrency[stage].current += 1;
      if (concurrency[stage].current > concurrency[stage].max) {
        concurrency[stage].max = concurrency[stage].current;
      }
      try {
        if (currentSpec.stubDelayMs > 0) await sleep(currentSpec.stubDelayMs);

        const clarifyHere =
          currentSpec.clarifyAt !== null &&
          stage === currentSpec.clarifyAt.stage &&
          agentId === currentSpec.clarifyAt.agentId;

        let payload: unknown;
        switch (stage) {
          case "proposal":
            payload = {
              summary: "stub proposal",
              recommendations: [],
              risks: [],
              assumptions: [],
              confidence: currentSpec.proposalConfidence,
              artifactSuggestions: [],
              references: [],
              needsClarification: clarifyHere,
              clarificationQuestions: clarifyHere
                ? [`What about ${agentId}'s constraint?`]
                : undefined,
            };
            break;

          case "critique": {
            const callerId = agentId ?? "senior-engineer";
            const target = CRITIQUE_TARGET[callerId] ?? "performance-engineer";
            payload = {
              summary: "stub critique",
              targetAgentId: target,
              objections: [],
              acknowledgedStrengths: [],
              confidence: currentSpec.critiqueConfidence,
              riskAssessments: [],
              artifactSuggestions: [],
              references: [],
              needsClarification: clarifyHere,
              clarificationQuestions: clarifyHere
                ? [`Critique-stage clarification from ${callerId}.`]
                : undefined,
            };
            break;
          }

          case "revision":
            payload = {
              summary: "stub revision",
              stance: currentSpec.revisionStance,
              concededPoints: [],
              maintainedPoints: [],
              newArguments: [],
              confidence: currentSpec.critiqueConfidence,
              artifactSuggestions: [],
              needsClarification: clarifyHere,
              clarificationQuestions: clarifyHere
                ? [`Revision-stage clarification from ${agentId}.`]
                : undefined,
            };
            break;

          case "consensus":
            payload = {
              agreements: [],
              disagreements: [],
              recommendedDecisions: [],
              identifiedRisks: [],
              openQuestions: [],
              overallConfidence: currentSpec.consensusConfidence,
              artifactOperations: currentSpec.consensusArtifactOps,
            };
            break;
        }

        return {
          content: JSON.stringify(payload),
          inputTokens: 10,
          outputTokens: 10,
          model: "stub-model",
        };
      } finally {
        concurrency[stage].current -= 1;
      }
    },
  }),
  createCancellableLLMProvider: () => ({
    async complete() {
      throw new Error("createCancellableLLMProvider stub not implemented for this test");
    },
  }),
}));

// =============================================================================
// Tests
//
// Imports must come AFTER vi.mock — vitest hoists the mock above import order
// at the source level, but local imports of the orchestrator must resolve to
// the stubbed provider, so we import the orchestrator down here for clarity.
// =============================================================================

import { roundOrchestrator } from "@/lib/round-orchestrator";
import { eventStore } from "@/lib/event-store";
import { artifactStore } from "@/lib/artifact-store";
import { prisma } from "@/lib/db";

const STAGE_ORDER = ["proposal", "critique", "revision", "consensus"] as const;
const ALL_AGENTS: AgentId[] = [
  "senior-engineer",
  "security-engineer",
  "performance-engineer",
  "product-engineer",
];

async function setupSession(sessionId: string): Promise<void> {
  await prisma.tokenUsage.deleteMany({ where: { sessionId } });
  await prisma.sessionSnapshot.deleteMany({ where: { sessionId } });
  await prisma.artifactVersion.deleteMany({});
  await prisma.artifact.deleteMany({ where: { sessionId } });
  await prisma.event.deleteMany({ where: { sessionId } });
  await prisma.session.deleteMany({ where: { id: sessionId } });
  await prisma.session.create({
    data: {
      id: sessionId,
      title: "Orchestrator PBT",
      problemDescription: "Verify orchestrator invariants.",
      status: "active",
      currentRound: 0,
    },
  });
}

beforeEach(() => {
  currentSpec = { ...DEFAULT_SPEC };
  resetConcurrency();
});

// =============================================================================
// Property 5 / Task 11.3 — Round Stage Ordering Invariant
// =============================================================================
describe("Round Orchestrator Stage Ordering (Property 5 / Task 11.3)", () => {
  it("events within a round appear in strict proposal→critique→revision→consensus order", async () => {
    const sessionId = "sess-stage-order";

    await fc.assert(
      fc.asyncProperty(
        fc.record({
          proposalConfidence: fc.float({ min: 0, max: 1, noNaN: true }),
          critiqueConfidence: fc.float({ min: 0, max: 1, noNaN: true }),
          revisionStance: fc.constantFrom(
            "agree",
            "disagree",
            "strengthen"
          ) as fc.Arbitrary<Spec["revisionStance"]>,
          consensusConfidence: fc.float({ min: 0, max: 1, noNaN: true }),
        }),
        async (spec) => {
          await setupSession(sessionId);
          currentSpec = { ...DEFAULT_SPEC, ...spec };

          await roundOrchestrator.startRound(sessionId);

          const events = await eventStore.getSessionEvents(sessionId);
          const roundEvents = events.filter((e) => e.round === 1);

          // Stage ordering: timestamps must respect the partial order.
          let lastIdx = -1;
          for (const event of roundEvents) {
            if (!event.stage) continue;
            const idx = STAGE_ORDER.indexOf(event.stage as DebateStage);
            if (idx === -1) continue;
            expect(idx).toBeGreaterThanOrEqual(lastIdx);
            lastIdx = idx;
          }

          // Sanity: every debate stage must produce at least one event,
          // otherwise the ordering check above could pass vacuously.
          const observedStages = new Set(
            roundEvents
              .map((e) => e.stage)
              .filter((s): s is DebateStage =>
                s !== null && (STAGE_ORDER as readonly string[]).includes(s)
              )
          );
          for (const stage of STAGE_ORDER) {
            expect(observedStages.has(stage)).toBe(true);
          }

          expect(roundEvents.some((e) => e.type === "round-completed")).toBe(true);
        }
      ),
      { numRuns: 5 }
    );
  }, 60_000);
});

// =============================================================================
// Property 12 / Task 11.4 — Clarification Pauses Round
// =============================================================================
describe("Round Orchestrator Clarification (Property 12 / Task 11.4)", () => {
  it("any agent setting needsClarification=true pauses the round at that stage", async () => {
    const sessionId = "sess-clarify";

    await fc.assert(
      fc.asyncProperty(
        fc.record({
          stage: fc.constantFrom("proposal", "critique", "revision") as fc.Arbitrary<
            "proposal" | "critique" | "revision"
          >,
          agentId: fc.constantFrom(...ALL_AGENTS),
        }),
        async ({ stage, agentId }) => {
          await setupSession(sessionId);
          currentSpec = { ...DEFAULT_SPEC, clarifyAt: { stage, agentId } };

          await roundOrchestrator.startRound(sessionId);

          // Session must end up paused.
          const session = await prisma.session.findUniqueOrThrow({
            where: { id: sessionId },
          });
          expect(session.status).toBe("paused");

          // A clarification-request event must have been emitted at the
          // stage where the agent flagged clarification.
          const events = await eventStore.getSessionEvents(sessionId);
          const clarRequests = events.filter((e) => e.type === "clarification-request");
          expect(clarRequests.length).toBeGreaterThan(0);
          expect(clarRequests.some((e) => e.stage === stage)).toBe(true);

          // No round-completed event — the round was paused, not finished.
          expect(events.some((e) => e.type === "round-completed")).toBe(false);

          // No stage beyond the clarifying one should have produced its
          // canonical event. Stages strictly after `stage` must be absent
          // from the event log.
          const stageIdx = STAGE_ORDER.indexOf(stage);
          const stageType: Record<typeof stage, string> = {
            proposal: "proposal",
            critique: "critique",
            revision: "revision",
          };
          for (let i = stageIdx + 1; i < STAGE_ORDER.length; i++) {
            const laterStage = STAGE_ORDER[i];
            if (laterStage === "consensus") {
              expect(events.some((e) => e.type === "consensus-update")).toBe(false);
            } else {
              expect(
                events.some(
                  (e) =>
                    e.type === stageType[laterStage as keyof typeof stageType] &&
                    e.stage === laterStage
                )
              ).toBe(false);
            }
          }
        }
      ),
      { numRuns: 8 }
    );
  }, 60_000);
});

// =============================================================================
// Property 11 / Task 11.5 — Auto-Advance After Completion + Parallelism
// =============================================================================
describe("Round Orchestrator Auto-Advance + Parallel Dispatch (Property 11 / Task 11.5)", () => {
  it("dispatches all four agents concurrently per stage and auto-advances through all stages", async () => {
    const sessionId = "sess-parallel";
    await setupSession(sessionId);

    // 20ms delay per LLM call: if sequential within a stage, the proposal
    // stage alone would take ~80ms; if parallel, ~20ms. We don't assert on
    // wall time (too flaky), we assert on the observed concurrency counter.
    currentSpec = { ...DEFAULT_SPEC, stubDelayMs: 20 };

    await roundOrchestrator.startRound(sessionId);

    // Parallelism: max concurrent calls per stage with 4 agents must be > 1
    // (and in practice 4 — Promise.allSettled fires them all together).
    for (const stage of ["proposal", "critique", "revision"] as DebateStage[]) {
      expect(concurrency[stage].max).toBe(4);
    }
    // Consensus is a single LLM call by design.
    expect(concurrency.consensus.max).toBe(1);

    // Auto-advance: the session must have walked through every stage and
    // come to rest in awaiting-intervention. Verifiable from the event log
    // plus the session row's currentStage.
    const events = await eventStore.getSessionEvents(sessionId);
    const eventStages = new Set(events.map((e) => e.stage).filter(Boolean));
    for (const stage of STAGE_ORDER) {
      expect(eventStages.has(stage)).toBe(true);
    }

    const session = await prisma.session.findUniqueOrThrow({
      where: { id: sessionId },
    });
    expect(session.currentStage).toBe("awaiting-intervention");
    expect(session.currentRound).toBe(1);

    expect(events.some((e) => e.type === "round-completed")).toBe(true);
  }, 60_000);
});

// =============================================================================
// Property 19 / Task 11.6 — Artifact Operations From Consensus + Dedup
// =============================================================================
describe("Round Orchestrator Consensus Artifact Operations (Property 19 / Task 11.6)", () => {
  // The orchestrator runs consensus.artifactOperations through the artifact
  // store, which dedupes on (sessionId, type, title). Distinct (type, title)
  // combinations create new artifacts; collisions update an existing one
  // (incrementing its version). This PBT generates arbitrary operation lists
  // and checks both invariants on the resulting artifact set.
  it("consensus create-operations produce exactly the deduplicated set of artifacts", async () => {
    const sessionId = "sess-consensus-ops";

    const opArb = fc.record({
      operation: fc.constant("create" as const),
      type: fc.constantFrom(
        "decision",
        "risk",
        "assumption",
        "tradeoff",
        "open-question",
        "recommendation"
      ) as fc.Arbitrary<Spec["consensusArtifactOps"][number]["type"]>,
      // Small title pool so colliding (type, title) combos are common.
      title: fc.constantFrom("Auth model", "Cache layer", "Data store", "API shape"),
      content: fc.string({ minLength: 5, maxLength: 30 }),
    });

    await fc.assert(
      fc.asyncProperty(
        fc.array(opArb, { minLength: 1, maxLength: 8 }),
        async (ops) => {
          await setupSession(sessionId);
          currentSpec = { ...DEFAULT_SPEC, consensusArtifactOps: ops };

          await roundOrchestrator.startRound(sessionId);

          // Expected dedup key: (type, title) — last write wins on content.
          const dedupKeys = new Set(ops.map((op) => `${op.type}::${op.title}`));

          const artifacts = await artifactStore.getSessionArtifacts(sessionId);

          // Note: artifact creation happens from BOTH consensus operations AND
          // any artifactSuggestions on proposal/critique/revision outputs. The
          // stub returns empty artifactSuggestions everywhere, so the only
          // artifacts in this session come from consensusArtifactOps.
          expect(artifacts.length).toBe(dedupKeys.size);

          // Every distinct (type, title) combination from the operations must
          // be present in the resulting artifact set.
          for (const op of ops) {
            const found = artifacts.find(
              (a) => a.type === op.type && a.title === op.title
            );
            expect(found).toBeDefined();
          }

          // Each artifact's event log must contain exactly one artifact-created
          // event (the dedup path produces updates, not duplicate creates).
          const events = await eventStore.getSessionEvents(sessionId);
          for (const artifact of artifacts) {
            const created = events.filter((e) => {
              if (e.type !== "artifact-created") return false;
              try {
                return JSON.parse(e.content).artifactId === artifact.id;
              } catch {
                return false;
              }
            });
            expect(created.length).toBe(1);
          }

          // Provenance: every artifact version must reference a real event.
          const eventIds = new Set(events.map((e) => e.id));
          for (const artifact of artifacts) {
            const versions = await artifactStore.getArtifactVersions(artifact.id);
            expect(versions.length).toBeGreaterThan(0);
            for (const v of versions) {
              expect(v.sourceEventId).toBeTruthy();
              expect(eventIds.has(v.sourceEventId)).toBe(true);
            }
          }
        }
      ),
      { numRuns: 6 }
    );
  }, 90_000);
});
