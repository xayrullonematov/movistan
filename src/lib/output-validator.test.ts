import { describe, it, expect } from "vitest";
import * as fc from "fast-check";
import { OutputValidatorImpl } from "./output-validator";
import type { AgentType, Severity, ObjectionSeverity } from "@/types/domain";

const validator = new OutputValidatorImpl();

// Helper to create a deep copy
const clone = <T>(obj: T): T => JSON.parse(JSON.stringify(obj));

describe("OutputValidator Property-Based Tests", () => {
  // ===========================================================================
  // 1. PROPOSAL OUTPUT CONFORMANCE
  // ===========================================================================
  describe("Proposal Validation (Zod & Schema)", () => {
    const validProposal = {
      summary: "Scaffold Next.js architecture.",
      recommendations: ["Use App Router", "Install Prisma"],
      risks: [{ description: "Initial setup latency", severity: "low", mitigation: "Use Turbopack" }],
      assumptions: ["Node is installed"],
      confidence: 0.9,
      artifactSuggestions: [{ type: "decision", title: "App Scaffold", content: "Next.js structure" }],
      references: [{ description: "Design Document" }],
      needsClarification: false,
    };

    it("should accept valid proposals with arbitrary confidence scores in [0, 1]", () => {
      fc.assert(
        fc.property(fc.double({ min: 0, max: 1, noNaN: true }), (confidence) => {
          const proposal = clone(validProposal);
          proposal.confidence = confidence;

          const result = validator.validateProposal(JSON.stringify(proposal));
          expect(result.success).toBe(true);
        })
      );
    });

    it("should reject proposals with confidence scores outside [0, 1]", () => {
      fc.assert(
        fc.property(
          fc.oneof(
            fc.double({ max: -0.001, noNaN: true }), // negative
            fc.double({ min: 1.001, noNaN: true })  // greater than 1
          ),
          (confidence) => {
            const proposal = clone(validProposal);
            proposal.confidence = confidence;

            const result = validator.validateProposal(JSON.stringify(proposal));
            expect(result.success).toBe(false);
            expect(result.errors.some(e => e.includes("confidence"))).toBe(true);
          }
        )
      );
    });

    it("should reject proposals with invalid risk severity levels", () => {
      fc.assert(
        fc.property(
          fc.string().filter((s) => !["high", "medium", "low"].includes(s)),
          (badSeverity) => {
            const proposal = clone(validProposal);
            proposal.risks[0].severity = badSeverity as Severity;

            const result = validator.validateProposal(JSON.stringify(proposal));
            expect(result.success).toBe(false);
            expect(result.errors.some(e => e.includes("severity"))).toBe(true);
          }
        )
      );
    });
  });

  // ===========================================================================
  // 2. CRITIQUE OUTPUT CONFORMANCE
  // ===========================================================================
  describe("Critique Validation (Self-Targeting & Schema)", () => {
    const validCritique = {
      summary: "Good structure but lacks cache optimization.",
      targetAgentId: "performance-engineer",
      objections: [{ point: "Indirection overhead", reasoning: "Extra layers add latency", severity: "minor" }],
      acknowledgedStrengths: ["Clean module boundaries"],
      confidence: 0.85,
      riskAssessments: [{ description: "Performance regression under load", severity: "medium" }],
      artifactSuggestions: [],
      references: [],
      needsClarification: false,
    };

    it("should accept valid critiques targeting any opposing agent", () => {
      const agents: AgentType[] = ["senior-engineer", "security-engineer", "performance-engineer", "product-engineer"];
      fc.assert(
        fc.property(
          fc.constantFrom(...agents),
          fc.constantFrom(...agents),
          (critiquer, target) => {
            fc.pre(critiquer !== target); // Ensure they are different

            const critique = clone(validCritique);
            critique.targetAgentId = target;

            const result = validator.validateCritique(JSON.stringify(critique), critiquer);
            expect(result.success).toBe(true);
          }
        )
      );
    });

    it("should reject critiques that target the critiquing agent itself", () => {
      const agents: AgentType[] = ["senior-engineer", "security-engineer", "performance-engineer", "product-engineer"];
      fc.assert(
        fc.property(fc.constantFrom(...agents), (agentId) => {
          const critique = clone(validCritique);
          critique.targetAgentId = agentId;

          const result = validator.validateCritique(JSON.stringify(critique), agentId);
          expect(result.success).toBe(false);
          expect(result.errors.some(e => e.includes("cannot be yourself"))).toBe(true);
        })
      );
    });
  });

  // ===========================================================================
  // 3. REVISION OUTPUT CONFORMANCE
  // ===========================================================================
  describe("Revision Validation (Conditional Concessions & Schema)", () => {
    const validRevision = {
      summary: "I partially concede on latencies but maintain custom abstractions.",
      stance: "partially-concede",
      concededPoints: [{ point: "Indirection overhead is real", reasoning: "Agreed, we will inline hot path calls" }],
      maintainedPoints: [{ point: "Modular layering", reasoning: "Keeps package structure clean for development" }],
      newArguments: ["We can introduce automated benchmark checks in CI"],
      confidence: 0.75,
      artifactSuggestions: [],
      needsClarification: false,
    };

    it("should reject revision with stance 'partially-concede' if concededPoints is empty", () => {
      const revision = clone(validRevision);
      revision.stance = "partially-concede";
      revision.concededPoints = [];

      const result = validator.validateRevision(JSON.stringify(revision));
      expect(result.success).toBe(false);
      expect(result.errors.some(e => e.includes("concededPoints"))).toBe(true);
    });

    it("should accept revision with stance 'partially-concede' if concededPoints is non-empty", () => {
      fc.assert(
        fc.property(
          fc.array(
            fc.record({
              point: fc.string({ minLength: 1 }),
              reasoning: fc.string({ minLength: 1 }),
            }),
            { minLength: 1 }
          ),
          (conceded) => {
            const revision = clone(validRevision);
            revision.stance = "partially-concede";
            revision.concededPoints = conceded;

            const result = validator.validateRevision(JSON.stringify(revision));
            expect(result.success).toBe(true);
          }
        )
      );
    });

    it("should accept revision with empty concededPoints for other stances", () => {
      const otherStances = ["agree", "disagree", "strengthen"];
      fc.assert(
        fc.property(fc.constantFrom(...otherStances), (stance) => {
          const revision = clone(validRevision);
          revision.stance = stance;
          revision.concededPoints = [];

          const result = validator.validateRevision(JSON.stringify(revision));
          expect(result.success).toBe(true);
        })
      );
    });
  });
});
