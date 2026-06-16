import { describe, it, expect } from "vitest";
import * as fc from "fast-check";
import { PromptBuilderImpl } from "./prompt-builder";
import { AGENT_CONFIGS } from "./agent-configs";
import type { AgentType, WorkspaceContext, PersistedEvent, ProposalOutput, CritiqueOutput } from "@/types/domain";

const promptBuilder = new PromptBuilderImpl();

describe("PromptBuilder Property-Based Tests", () => {
  // ===========================================================================
  // 1. OBJECTIVE FUNCTION INTEGRITY & UNIQUENESS (Task 8.3)
  // ===========================================================================
  describe("Agent Config Objective Functions", () => {
    it("should verify each configured agent has a unique, non-empty objective function", () => {
      const agents = Object.values(AGENT_CONFIGS);
      expect(agents).toHaveLength(4);

      const objectiveFunctions = new Set<string>();

      for (const agent of agents) {
        expect(agent.id).toBeDefined();
        expect(agent.displayName).toBeDefined();
        expect(agent.objectiveFunction).toBeTypeOf("string");
        expect(agent.objectiveFunction.trim().length).toBeGreaterThan(0);
        
        // Assert uniqueness
        expect(objectiveFunctions.has(agent.objectiveFunction)).toBe(false);
        objectiveFunctions.add(agent.objectiveFunction);

        // Also assert evaluation criteria
        expect(agent.evaluationCriteria).toBeInstanceOf(Array);
        expect(agent.evaluationCriteria.length).toBeGreaterThan(0);
        for (const criterion of agent.evaluationCriteria) {
          expect(criterion.trim().length).toBeGreaterThan(0);
        }

        // Also assert conflicting priorities
        expect(agent.conflictingPriorities).toBeInstanceOf(Array);
        expect(agent.conflictingPriorities.length).toBeGreaterThan(0);
        for (const priority of agent.conflictingPriorities) {
          expect(priority.trim().length).toBeGreaterThan(0);
        }
      }
    });
  });

  // ===========================================================================
  // 2. PROMPT BUILDING AND OBJECTIVE FUNCTION INCLUSION (Task 8.3)
  // ===========================================================================
  describe("Prompt Objective Function Inclusion", () => {
    const constraintArb = fc.record({
      id: fc.uuid(),
      text: fc.string(),
      category: fc.string(),
      createdAt: fc.integer({ min: 0, max: 1893456000000 }).map((epoch) => new Date(epoch).toISOString()),
    });

    const artifactStateArb = fc.record({
      id: fc.uuid(),
      sessionId: fc.uuid(),
      type: fc.constantFrom("decision", "risk", "assumption", "tradeoff", "open-question", "recommendation"),
      title: fc.string({ minLength: 1 }),
      content: fc.string(),
      status: fc.constantFrom("draft", "accepted", "rejected"),
      version: fc.integer({ min: 1 }),
      createdByAgentId: fc.string(),
      createdAt: fc.integer({ min: 0, max: 1893456000000 }).map((epoch) => new Date(epoch).toISOString()),
      updatedAt: fc.integer({ min: 0, max: 1893456000000 }).map((epoch) => new Date(epoch).toISOString()),
    });

    const roundSummaryArb = fc.record({
      roundNumber: fc.integer({ min: 1 }),
      keyProposals: fc.array(fc.string()),
      majorCritiques: fc.array(fc.string()),
      revisionOutcomes: fc.array(fc.string()),
      consensusPoints: fc.array(fc.string()),
    });

    const persistedEventArb = fc.record({
      id: fc.uuid(),
      sessionId: fc.uuid(),
      type: fc.constantFrom("proposal", "critique", "revision", "stage-progress", "session-created"),
      agentId: fc.option(fc.constantFrom("senior-engineer", "security-engineer", "performance-engineer", "product-engineer")),
      round: fc.integer({ min: 1 }),
      stage: fc.option(fc.constantFrom("proposal", "critique", "revision", "consensus")),
      content: fc.string(),
      timestamp: fc.integer({ min: 0, max: 1893456000000 }).map((epoch) => new Date(epoch).toISOString()),
    });

    const workspaceContextArb = fc.record({
      problemDescription: fc.string(),
      constraints: fc.array(constraintArb),
      workspaceSummary: fc.string(),
      artifactSummaries: fc.array(artifactStateArb),
      roundSummaries: fc.array(roundSummaryArb),
      currentRoundEvents: fc.array(persistedEventArb),
      unresolvedDisagreements: fc.constant([]),
      priorSessionSummary: fc.option(fc.string()),
    });

    it("should build proposal prompts containing the agent's objective function", () => {
      const agents = Object.values(AGENT_CONFIGS);
      
      fc.assert(
        fc.property(workspaceContextArb, (context) => {
          for (const agent of agents) {
            const request = promptBuilder.buildProposalPrompt(agent, context as WorkspaceContext);
            expect(request.systemPrompt).toContain(agent.objectiveFunction);
            expect(request.systemPrompt).toContain(agent.displayName);
            expect(request.responseFormat).toBe("json");
          }
        }),
        { numRuns: 10 }
      );
    });

    it("should build critique prompts containing the agent's objective function and routing info", () => {
      const agents = Object.values(AGENT_CONFIGS);

      const proposalOutputArb = fc.record({
        summary: fc.string(),
        recommendations: fc.array(fc.string()),
        risks: fc.array(fc.record({ description: fc.string(), severity: fc.constantFrom("low", "medium", "high") })),
        assumptions: fc.array(fc.string()),
        confidence: fc.double({ min: 0, max: 1, noNaN: true }),
        artifactSuggestions: fc.array(fc.record({ type: fc.constantFrom("decision", "risk"), title: fc.string(), content: fc.string() })),
        needsClarification: fc.boolean(),
      });

      fc.assert(
        fc.property(workspaceContextArb, fc.array(proposalOutputArb), (context, proposals) => {
          for (const agent of agents) {
            const request = promptBuilder.buildCritiquePrompt(agent, proposals as ProposalOutput[], context as WorkspaceContext);
            expect(request.systemPrompt).toContain(agent.objectiveFunction);
            expect(request.systemPrompt).toContain(agent.displayName);
            expect(request.responseFormat).toBe("json");
          }
        }),
        { numRuns: 10 }
      );
    });

    it("should build revision prompts containing the agent's objective function", () => {
      const agents = Object.values(AGENT_CONFIGS);

      const critiqueOutputArb = fc.record({
        summary: fc.string(),
        targetAgentId: fc.constantFrom("senior-engineer", "security-engineer", "performance-engineer", "product-engineer"),
        objections: fc.array(fc.record({ point: fc.string(), reasoning: fc.string(), severity: fc.constantFrom("minor", "major", "critical") })),
        acknowledgedStrengths: fc.array(fc.string()),
        confidence: fc.double({ min: 0, max: 1, noNaN: true }),
        riskAssessments: fc.array(fc.record({ description: fc.string(), severity: fc.constantFrom("low", "medium", "high") })),
        artifactSuggestions: fc.array(fc.record({ type: fc.constantFrom("decision", "risk"), title: fc.string(), content: fc.string() })),
        needsClarification: fc.boolean(),
      });

      fc.assert(
        fc.property(workspaceContextArb, fc.array(critiqueOutputArb), (context, critiques) => {
          for (const agent of agents) {
            const request = promptBuilder.buildRevisionPrompt(agent, critiques as CritiqueOutput[], context as WorkspaceContext);
            expect(request.systemPrompt).toContain(agent.objectiveFunction);
            expect(request.systemPrompt).toContain(agent.displayName);
            expect(request.responseFormat).toBe("json");
          }
        }),
        { numRuns: 10 }
      );
    });
  });
});
