import { describe, it, expect } from "vitest";
import * as fc from "fast-check";
import { prisma } from "./db";
import { eventStore } from "./event-store";
import { artifactStore } from "./artifact-store";
import type { ArtifactType, AgentType } from "@/types/domain";

const ARTIFACT_TYPES: ArtifactType[] = [
  "decision",
  "risk",
  "assumption",
  "tradeoff",
  "open-question",
  "recommendation",
];
const AGENTS: AgentType[] = [
  "senior-engineer",
  "security-engineer",
  "performance-engineer",
  "product-engineer",
];

describe("Artifact Provenance Property-Based Tests (Property 21 / Task 11.7)", () => {
  // ===========================================================================
  // Property 21: Every ArtifactVersion has a non-null sourceEventId that
  // references a real event in the session. Holds across arbitrary sequences
  // of create/update operations (including deduplicating collisions that turn
  // a "create" into an "update").
  // ===========================================================================
  it("every artifact version links to a valid source event", async () => {
    const sessionId = "sess-provenance";

    // Each operation: produce a source event, then create an artifact that
    // references it. Collisions on (type, title) deduplicate into a new version.
    const opArb = fc.record({
      type: fc.constantFrom(...ARTIFACT_TYPES),
      // Small title pool so dedup/update paths are exercised, not just creates.
      title: fc.constantFrom("Auth model", "Cache layer", "Data store", "API shape"),
      content: fc.string({ minLength: 10, maxLength: 40 }),
      agentId: fc.constantFrom(...AGENTS),
    });

    await fc.assert(
      fc.asyncProperty(
        fc.array(opArb, { minLength: 1, maxLength: 12 }),
        async (ops) => {
          // Per-run isolation (DB is only truncated once per `it`).
          await prisma.artifactVersion.deleteMany({});
          await prisma.artifact.deleteMany({ where: { sessionId } });
          await prisma.event.deleteMany({ where: { sessionId } });
          await prisma.session.deleteMany({ where: { id: sessionId } });
          await prisma.session.create({
            data: {
              id: sessionId,
              title: "Provenance",
              problemDescription: "Trace every change.",
              status: "active",
              currentRound: 1,
            },
          });

          for (const op of ops) {
            const sourceEvent = await eventStore.appendEvent({
              sessionId,
              type: "proposal",
              agentId: op.agentId,
              round: 1,
              stage: "proposal",
              content: { summary: op.content },
            });

            await artifactStore.createArtifact({
              sessionId,
              type: op.type,
              title: op.title,
              content: op.content,
              createdByAgentId: op.agentId,
              sourceEventId: sourceEvent.id,
            });
          }

          // Collect every valid event id in the session.
          const sessionEvents = await eventStore.getSessionEvents(sessionId);
          const eventIds = new Set(sessionEvents.map((e) => e.id));

          const artifacts = await artifactStore.getSessionArtifacts(sessionId);
          // At least one artifact must exist (we ran >= 1 op).
          expect(artifacts.length).toBeGreaterThan(0);

          for (const artifact of artifacts) {
            const versions = await artifactStore.getArtifactVersions(artifact.id);
            expect(versions.length).toBeGreaterThan(0);

            // Version numbers are monotonic 1..N.
            versions.forEach((v, i) => {
              expect(v.version).toBe(i + 1);
            });

            for (const version of versions) {
              // Provenance is present...
              expect(version.sourceEventId).toBeTruthy();
              // ...and points at a real event in this session's log.
              expect(eventIds.has(version.sourceEventId)).toBe(true);
            }
          }
        }
      ),
      { numRuns: 15 }
    );
  }, 30_000);
});
