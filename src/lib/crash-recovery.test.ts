import { describe, it, expect } from "vitest";
import * as fc from "fast-check";
import { prisma } from "./db";
import { eventStore } from "./event-store";
import { crashRecovery } from "./crash-recovery";
import type { AgentType, RoundStage } from "@/types/domain";

const ALL_AGENTS: AgentType[] = [
  "senior-engineer",
  "security-engineer",
  "performance-engineer",
  "product-engineer",
];
const STAGES: RoundStage[] = ["proposal", "critique", "revision", "consensus"];

/** Five minutes — the stale-lock threshold in crash-recovery.ts. */
const STALE_MS = 6 * 60 * 1000; // comfortably past 5 min → stale
const FRESH_MS = 10 * 1000; // 10s ago → still fresh

async function createCrashedSession(
  sessionId: string,
  round: number,
  stage: RoundStage,
  lockedAtMsAgo: number
): Promise<void> {
  await prisma.session.create({
    data: {
      id: sessionId,
      title: "Crash Test",
      problemDescription: "Recover me.",
      status: "active",
      currentRound: round,
      currentStage: stage,
      lockedBy: "worker-1",
      lockedAt: new Date(Date.now() - lockedAtMsAgo),
    },
  });
}

describe("Crash Recovery Property-Based Tests (Property 23 / Task 11.9)", () => {
  // ===========================================================================
  // Property 23: After a simulated mid-stage crash, recovery detects exactly
  // the agents that finished and re-executes exactly those that did not.
  // ===========================================================================
  it("detects exactly the completed agents and recovers exactly the missing ones", async () => {
    const sessionId = "sess-crash";

    await fc.assert(
      fc.asyncProperty(
        fc.subarray(ALL_AGENTS), // agents that completed before the crash
        fc.constantFrom(...STAGES), // stage in progress at crash time
        fc.integer({ min: 1, max: 50 }), // current round
        async (completed, stage, round) => {
          // Per-run isolation (the DB is only truncated once per `it`).
          await prisma.event.deleteMany({ where: { sessionId } });
          await prisma.session.deleteMany({ where: { id: sessionId } });
          await createCrashedSession(sessionId, round, stage, STALE_MS);

          // Completed agents have a stage-progress event for the current stage.
          for (const agent of completed) {
            await eventStore.appendEvent({
              sessionId,
              type: "stage-progress",
              agentId: agent,
              round,
              stage,
              content: { status: "complete" },
            });
          }

          // Noise: stage-progress events for a DIFFERENT stage must be ignored.
          // Use agents that did NOT complete the target stage, so any leak
          // across the stage filter would corrupt the result and fail.
          const otherStage = STAGES.find((s) => s !== stage)!;
          for (const agent of ALL_AGENTS.filter((a) => !completed.includes(a))) {
            await eventStore.appendEvent({
              sessionId,
              type: "stage-progress",
              agentId: agent,
              round,
              stage: otherStage,
              content: { status: "complete" },
            });
          }

          const detected = await crashRecovery.detectIncompleteRound(sessionId);
          expect(detected).not.toBeNull();
          expect(detected!.round).toBe(round);
          expect(detected!.stage).toBe(stage);
          expect([...detected!.completedAgents].sort()).toEqual(
            [...completed].sort()
          );

          const missing = await crashRecovery.recoverIncompleteStage(sessionId);
          const expectedMissing = ALL_AGENTS.filter(
            (a) => !completed.includes(a)
          );
          expect([...missing].sort()).toEqual([...expectedMissing].sort());

          // Completed ∪ missing covers all four agents, with no overlap.
          expect(
            [...detected!.completedAgents, ...missing].sort()
          ).toEqual([...ALL_AGENTS].sort());
        }
      ),
      { numRuns: 25 }
    );
  });

  // ===========================================================================
  // A still-fresh lock means the round may legitimately be running — recovery
  // must NOT treat it as crashed.
  // ===========================================================================
  it("treats a fresh lock as a live round (no recovery)", async () => {
    const sessionId = "sess-crash-fresh";
    await createCrashedSession(sessionId, 3, "critique", FRESH_MS);

    expect(await crashRecovery.detectIncompleteRound(sessionId)).toBeNull();
    expect(await crashRecovery.recoverIncompleteStage(sessionId)).toEqual([]);
  });

  // ===========================================================================
  // An unlocked active session is not mid-round — nothing to recover.
  // ===========================================================================
  it("ignores sessions without a lock", async () => {
    const sessionId = "sess-no-lock";
    await prisma.session.create({
      data: {
        id: sessionId,
        title: "No Lock",
        problemDescription: "Idle.",
        status: "active",
        currentRound: 2,
        currentStage: "proposal",
      },
    });

    expect(await crashRecovery.detectIncompleteRound(sessionId)).toBeNull();
    expect(await crashRecovery.recoverIncompleteStage(sessionId)).toEqual([]);
  });
});
