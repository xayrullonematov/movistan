import { describe, it, expect } from "vitest";
import * as fc from "fast-check";
import { prisma } from "./db";
import { artifactStore } from "./artifact-store";
import { tokenBudgetManager } from "./token-budget-manager";
import { eventStore } from "./event-store";
import type { ArtifactType, ArtifactStatus, AgentType } from "@/types/domain";

// Helper to set up a test session in the database
async function createTestSession(id: string): Promise<void> {
  await prisma.session.create({
    data: {
      id,
      problemDescription: "Test session description.",
      title: "Test Session",
      status: "active",
      currentRound: 1,
    },
  });
}

describe("Database-Backed Stores Property-Based Tests", () => {
  // ===========================================================================
  // 1. ARTIFACT LIFECYCLE & DEDUPLICATION (Task 5.2)
  // ===========================================================================
  describe("Artifact Store Lifecycle & Deduplication", () => {
    it("should create new artifacts with version history, provenance, and events", async () => {
      const sessionId = "sess-artifact-1";
      await createTestSession(sessionId);

      // Generate arbitrary properties for artifact creation
      const artifactTypes: ArtifactType[] = ["decision", "risk", "assumption", "tradeoff", "open-question", "recommendation"];
      const agents: AgentType[] = ["senior-engineer", "security-engineer", "performance-engineer", "product-engineer"];

      await fc.assert(
        fc.asyncProperty(
          fc.constantFrom(...artifactTypes),
          fc.string({ minLength: 5, maxLength: 20 }),
          fc.string({ minLength: 10 }),
          fc.constantFrom(...agents),
          async (type, title, content, agentId) => {
            // Create target source event in db
            const sourceEvent = await eventStore.appendEvent({
              sessionId,
              type: "proposal",
              agentId,
              round: 1,
              content: "{}",
            });

            // Create artifact
            const artifact = await artifactStore.createArtifact({
              sessionId,
              type,
              title,
              content,
              createdByAgentId: agentId,
              sourceEventId: sourceEvent.id,
            });

            // Assertions
            expect(artifact.title).toBe(title);
            expect(artifact.type).toBe(type);
            expect(artifact.content).toBe(content);
            expect(artifact.status).toBe("draft");
            expect(artifact.version).toBe(1);
            expect(artifact.createdByAgentId).toBe(agentId);

            // Verify version record exists
            const versions = await artifactStore.getArtifactVersions(artifact.id);
            expect(versions).toHaveLength(1);
            expect(versions[0].version).toBe(1);
            expect(versions[0].content).toBe(content);
            expect(versions[0].sourceEventId).toBe(sourceEvent.id);
            expect(versions[0].agentId).toBe(agentId);

            // Verify event log contains artifact-created event
            const events = await eventStore.getSessionEvents(sessionId);
            const createdEvent = events.find((e) => e.type === "artifact-created" && JSON.parse(e.content).artifactId === artifact.id);
            expect(createdEvent).toBeDefined();
          }
        ),
        { numRuns: 10 } // SQLite is fast, but 10 runs per PBT is plenty for integration tests
      );
    });

    it("should prevent duplicate artifacts and update the existing one on title/type collision (deduplication)", async () => {
      const sessionId = "sess-artifact-dedup";
      await createTestSession(sessionId);

      const title = "System Architectural Strategy";
      const type: ArtifactType = "decision";

      const sourceEvent1 = await eventStore.appendEvent({ sessionId, type: "proposal", round: 1, content: "{}" });
      const sourceEvent2 = await eventStore.appendEvent({ sessionId, type: "proposal", round: 1, content: "{}" });

      // Create first artifact
      const artifact1 = await artifactStore.createArtifact({
        sessionId,
        type,
        title,
        content: "Original Content",
        createdByAgentId: "senior-engineer",
        sourceEventId: sourceEvent1.id,
      });

      // Attempt to create second artifact with same title (different case) and type
      const artifact2 = await artifactStore.createArtifact({
        sessionId,
        type,
        title: title.toLowerCase(), // case-insensitive check
        content: "Updated Content",
        createdByAgentId: "performance-engineer",
        sourceEventId: sourceEvent2.id,
      });

      // Verify that it updated the first artifact instead of creating a duplicate
      expect(artifact2.id).toBe(artifact1.id);
      expect(artifact2.version).toBe(2);
      expect(artifact2.content).toBe("Updated Content");

      // Verify the database table only has 1 record
      const dbRecords = await prisma.artifact.findMany({ where: { sessionId } });
      expect(dbRecords).toHaveLength(1);

      // Verify version history has both entries
      const versions = await artifactStore.getArtifactVersions(artifact1.id);
      expect(versions).toHaveLength(2);
      expect(versions[0].content).toBe("Original Content");
      expect(versions[1].content).toBe("Updated Content");
      expect(versions[1].agentId).toBe("performance-engineer");
    });

    it("should only allow valid status transitions", async () => {
      const sessionId = "sess-artifact-status";
      await createTestSession(sessionId);

      const sourceEvent = await eventStore.appendEvent({ sessionId, type: "proposal", round: 1, content: "{}" });

      const artifact = await artifactStore.createArtifact({
        sessionId,
        type: "decision",
        title: "Test Transition",
        content: "Content",
        sourceEventId: sourceEvent.id,
      });

      // Valid: draft -> accepted
      const accepted = await artifactStore.changeStatus(artifact.id, "accepted");
      expect(accepted.status).toBe("accepted");

      // Valid: accepted -> draft (reopened)
      const reopened = await artifactStore.changeStatus(artifact.id, "draft");
      expect(reopened.status).toBe("draft");

      // Valid: draft -> rejected
      const rejected = await artifactStore.changeStatus(artifact.id, "rejected");
      expect(rejected.status).toBe("rejected");

      // Invalid: rejected -> draft (reopen from rejected is blocked per spec mapping)
      await expect(artifactStore.changeStatus(artifact.id, "draft")).rejects.toThrow();
    });
  });

  // ===========================================================================
  // 2. TOKEN BUDGET ENFORCEMENT (Task 7.2)
  // ===========================================================================
  describe("Token Budget Enforcement & Cost Management", () => {
    it("should track usages, calculate costs, and trigger budget thresholds", async () => {
      const sessionId = "sess-budget-1";
      await prisma.session.create({
        data: {
          id: sessionId,
          problemDescription: "Budget Test",
          title: "Budget Session",
          status: "active",
          currentRound: 1,
          tokenBudget: 10000, // Strict small token budget
        },
      });

      // Check initial empty budget
      let status = await tokenBudgetManager.checkBudget(sessionId);
      expect(status.isOverBudget).toBe(false);
      expect(status.warningThreshold).toBe(false);
      expect(status.used).toBe(0);

      // We will track arbitrary usages and verify the budget manager responds
      await fc.assert(
        fc.asyncProperty(
          fc.integer({ min: 100, max: 2000 }), // input tokens
          fc.integer({ min: 100, max: 2000 }), // output tokens
          async (input, output) => {
            // Track usage
            await tokenBudgetManager.trackUsage(sessionId, {
              agentId: "senior-engineer",
              round: 1,
              stage: "proposal",
              inputTokens: input,
              outputTokens: output,
              model: "gpt-4o",
            });

            const currentUsage = await tokenBudgetManager.getSessionUsage(sessionId);
            const totalUsed = currentUsage.totalInputTokens + currentUsage.totalOutputTokens;

            status = await tokenBudgetManager.checkBudget(sessionId);
            expect(status.used).toBe(totalUsed);

            if (totalUsed >= 10000) {
              expect(status.isOverBudget).toBe(true);
            }
            if (totalUsed >= 8000) {
              expect(status.warningThreshold).toBe(true);
            }
          }
        ),
        { numRuns: 5 } // Sequence of accumulating runs
      );
    });
  });

  // ===========================================================================
  // 3. EVENT STRUCTURAL INTEGRITY (Task 4.2)
  // ===========================================================================
  describe("Event Store Structural Integrity", () => {
    it("should verify structural integrity of all appended events", async () => {
      const sessionId = "sess-events-integrity";
      await createTestSession(sessionId);

      const agentEvents = ["proposal", "critique", "revision", "stage-progress"];
      const systemEvents = [
        "session-created",
        "round-started",
        "round-completed",
        "user-intervention",
        "consensus-update",
        "clarification-request",
        "artifact-created",
        "artifact-updated",
        "artifact-status-changed",
      ];
      const allTypes = [...agentEvents, ...systemEvents];
      const agents: AgentType[] = ["senior-engineer", "security-engineer", "performance-engineer", "product-engineer"];

      await fc.assert(
        fc.asyncProperty(
          fc.constantFrom(...allTypes),
          fc.constantFrom(...agents),
          fc.integer({ min: 0, max: 100 }),
          fc.string({ minLength: 2, maxLength: 50 }),
          async (type, agentId, round, rawContent) => {
            const isAgentEvent = agentEvents.includes(type);
            const content = { data: rawContent };

            const appended = await eventStore.appendEvent({
              sessionId,
              type: type as any,
              agentId: isAgentEvent ? agentId : null,
              round,
              content,
            });

            // Assertions
            expect(allTypes).toContain(appended.type);
            expect(new Date(appended.timestamp).getTime()).not.toBeNaN();
            expect(appended.round).toBeGreaterThanOrEqual(0);
            expect(appended.content).toBeTypeOf("string");
            expect(appended.content.length).toBeGreaterThan(0);
            expect(JSON.parse(appended.content)).toEqual(content);

            if (isAgentEvent) {
              expect(appended.agentId).toBe(agentId);
              expect(agents).toContain(appended.agentId);
            } else {
              expect(appended.agentId).toBeNull();
            }
          }
        ),
        { numRuns: 15 }
      );
    });
  });
});
