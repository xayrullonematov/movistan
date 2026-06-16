import { describe, it, expect } from "vitest";
import * as fc from "fast-check";
import { prisma } from "./db";
import { workspaceSummaryService } from "./workspace-summary-service";
import { roundSummaryService } from "./round-summary-service";
import { eventStore } from "./event-store";

describe("Summary Services Integration & Property Tests", () => {
  it("should generate deterministic workspace summary correctly", async () => {
    // Generate session properties
    const titleArb = fc.string({ minLength: 5, maxLength: 50 });
    const problemArb = fc.string({ minLength: 50, maxLength: 500 });
    const constraintsCountArb = fc.integer({ min: 0, max: 5 });

    await fc.assert(
      fc.asyncProperty(
        titleArb,
        problemArb,
        constraintsCountArb,
        async (title, problem, constraintsCount) => {
          // Clear DB just in case in correct order to avoid FK violation
          await prisma.artifactVersion.deleteMany().catch(() => {});
          await prisma.artifact.deleteMany().catch(() => {});
          await prisma.event.deleteMany().catch(() => {});
          await prisma.tokenUsage.deleteMany().catch(() => {});
          await prisma.sessionSnapshot.deleteMany().catch(() => {});
          await prisma.session.deleteMany().catch(() => {});

          const sessionId = "sess-summary-test";
          
          // Create session
          await prisma.session.create({
            data: {
              id: sessionId,
              title,
              problemDescription: problem,
              status: "active",
              currentRound: 1,
            },
          });

          // Insert constraints in DB
          const constraints = [];
          for (let i = 0; i < constraintsCount; i++) {
            const constraintText = `Constraint ${i} value`;
            await eventStore.appendEvent({
              sessionId,
              type: "user-intervention",
              round: 1,
              content: { text: constraintText, category: "technical" },
            });
            constraints.push(constraintText);
          }

          // Generate summary
          const summary = await workspaceSummaryService.generateSummary(sessionId);

          // Assertions
          expect(summary).toContain(`Session: ${title}`);
          expect(summary).toContain(`Problem: ${problem.slice(0, 200)}`);
          expect(summary).toContain(`Rounds completed: 0`);
          
          if (constraintsCount > 0) {
            for (const text of constraints) {
              expect(summary).toContain(text);
            }
          } else {
            expect(summary).toContain("Active constraints: none");
          }
        }
      ),
      { numRuns: 5 }
    );
  });

  it("should extract deterministic round summaries from events", async () => {
    const sessionId = "sess-round-summary";
    await prisma.session.create({
      data: {
        id: sessionId,
        title: "Round Summary Session",
        problemDescription: "A problem statement.",
        status: "active",
        currentRound: 1,
      },
    });

    // Append some structured events for round 1
    const proposalContent = { summary: "This is a key proposal summary." };
    const critiqueContent = {
      summary: "Critique",
      objections: [
        { point: "First major objection", reasoning: "because", severity: "major" },
        { point: "Second minor objection", reasoning: "because", severity: "minor" },
      ],
    };
    const revisionContent = {
      summary: "Revision",
      stance: "partially-concede",
      concededPoints: [{ point: "First major objection", reasoning: "conceded" }],
      maintainedPoints: [],
    };
    const consensusContent = {
      agreements: [{ point: "First agreed point", supportingAgents: [], reasoning: "", evidenceChain: [] }],
      disagreements: [],
      recommendedDecisions: [],
      identifiedRisks: [],
      openQuestions: [],
      overallConfidence: 0.8,
      artifactOperations: [],
    };

    await eventStore.appendEvent({
      sessionId,
      type: "proposal",
      agentId: "senior-engineer",
      round: 1,
      content: proposalContent,
    });

    await eventStore.appendEvent({
      sessionId,
      type: "critique",
      agentId: "security-engineer",
      round: 1,
      content: critiqueContent,
    });

    await eventStore.appendEvent({
      sessionId,
      type: "revision",
      agentId: "senior-engineer",
      round: 1,
      content: revisionContent,
    });

    await eventStore.appendEvent({
      sessionId,
      type: "consensus-update",
      round: 1,
      content: consensusContent,
    });

    // Generate round summary
    const summary = await roundSummaryService.generateRoundSummary(sessionId, 1);

    expect(summary.roundNumber).toBe(1);
    expect(summary.keyProposals).toContain(proposalContent.summary);
    expect(summary.majorCritiques).toContain("First major objection");
    expect(summary.majorCritiques).not.toContain("Second minor objection");
    expect(summary.revisionOutcomes).toContain("senior-engineer: partially-concede");
    expect(summary.consensusPoints).toContain("First agreed point");
  });
});
