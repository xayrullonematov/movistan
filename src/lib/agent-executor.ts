/**
 * AgentExecutor — Orchestrates individual agent LLM calls with structured output
 * validation and retry logic.
 *
 * Implements the AgentExecutor interface from @/types/domain.
 *
 * Each method follows the same pattern:
 *   1. Build prompt via PromptBuilder
 *   2. Select model tier for the stage
 *   3. Call LLM via LLMProvider
 *   4. Validate output against Zod schema (retry up to 2x on failure)
 *   5. Track token usage
 *   6. Return structured output
 */

import { createLLMProvider } from "@/lib/llm-provider";
import { PromptBuilderImpl } from "@/lib/prompt-builder";
import {
  OutputValidatorImpl,
  buildValidationErrorMessage,
} from "@/lib/output-validator";
import { tokenBudgetManager } from "@/lib/token-budget-manager";
import { getCritiqueTarget, DEFAULT_MODEL_TIERS } from "@/lib/agent-configs";
import type {
  AgentConfig,
  AgentExecutor,
  ConsensusOutput,
  CritiqueOutput,
  LLMProvider,
  LLMRequest,
  LLMResponse,
  PersistedEvent,
  ProposalOutput,
  RevisionOutput,
  ValidationResult,
  WorkspaceContext,
} from "@/types/domain";

// =============================================================================
// CONSTANTS
// =============================================================================

/** Maximum number of retries on validation failure (3 total attempts) */
const MAX_VALIDATION_RETRIES = 2;

// =============================================================================
// INTERNAL HELPERS
// =============================================================================

const promptBuilder = new PromptBuilderImpl();
const validator = new OutputValidatorImpl();

/**
 * Core retry loop: call LLM, validate output, re-prompt on failure.
 * - On validation success: track tokens + return result
 * - On validation failure: re-prompt with error message (max 2 retries)
 * - On final failure: throw an error (caller handles degraded output)
 */
async function callWithRetry<T>(params: {
  llmProvider: LLMProvider;
  request: LLMRequest;
  model: string;
  validate: (raw: string) => ValidationResult<T>;
  sessionId: string;
  agentId: AgentConfig["id"] | null;
  round: number;
  stage: "proposal" | "critique" | "revision" | "consensus";
}): Promise<T> {
  const { llmProvider, request, model, validate, sessionId, agentId, round, stage } =
    params;

  let lastResponse: LLMResponse | null = null;
  let lastErrors: string[] = [];

  for (let attempt = 0; attempt <= MAX_VALIDATION_RETRIES; attempt++) {
    // Build the effective prompt (include error feedback on retries)
    let effectiveRequest = request;
    if (attempt > 0 && lastErrors.length > 0) {
      const errorMsg = buildValidationErrorMessage(lastErrors);
      effectiveRequest = {
        ...request,
        userMessage: `${request.userMessage}\n\n---\n\n${errorMsg}\n\nPrevious invalid response:\n${lastResponse?.content ?? ""}`,
      };
    }

    // Call LLM
    const response = await llmProvider.complete(effectiveRequest, model);
    lastResponse = response;

    // Validate the output
    const result = validate(response.content);

    if (result.success) {
      // Track token usage for this successful call
      await tokenBudgetManager.trackUsage(sessionId, {
        agentId,
        round,
        stage,
        inputTokens: response.inputTokens,
        outputTokens: response.outputTokens,
        model: response.model,
      });

      return result.data;
    }

    // Validation failed — store errors for retry prompt
    lastErrors = result.errors;

    // Track token usage even for failed attempts (tokens were still consumed)
    await tokenBudgetManager.trackUsage(sessionId, {
      agentId,
      round,
      stage,
      inputTokens: response.inputTokens,
      outputTokens: response.outputTokens,
      model: response.model,
    });
  }

  // All retries exhausted — throw error with details
  throw new Error(
    `Validation failed after ${MAX_VALIDATION_RETRIES + 1} attempts for ${stage} ` +
      `(agent: ${agentId ?? "system"}). Errors: ${lastErrors.join("; ")}`
  );
}

// =============================================================================
// AGENT EXECUTOR FACTORY
// =============================================================================

/**
 * Creates an AgentExecutor instance.
 *
 * The executor holds a reference to the sessionId so that token tracking
 * and context are scoped correctly per session.
 */
export function createAgentExecutor(sessionId: string, round: number): AgentExecutor {
  const llmProvider = createLLMProvider();

  return {
    /**
     * Generate a proposal from an agent.
     * Flow: build prompt -> select model (proposal tier) -> call LLM -> validate -> track -> return
     */
    async generateProposal(
      agent: AgentConfig,
      context: WorkspaceContext
    ): Promise<ProposalOutput> {
      const request = promptBuilder.buildProposalPrompt(agent, context);
      const model = DEFAULT_MODEL_TIERS.proposal;

      return callWithRetry<ProposalOutput>({
        llmProvider,
        request,
        model,
        validate: (raw) => validator.validateProposal(raw),
        sessionId,
        agentId: agent.id,
        round,
        stage: "proposal",
      });
    },

    /**
     * Generate a critique from an agent.
     * Flow: get critique target -> build critique prompt -> select model (critique tier) -> call LLM -> validate -> track
     *
     * Note: The `proposal` parameter is the single target proposal for MVP.
     * The proposals array passed to buildCritiquePrompt contains [proposal] as the single target.
     */
    async generateCritique(
      agent: AgentConfig,
      proposal: ProposalOutput,
      context: WorkspaceContext
    ): Promise<CritiqueOutput> {
      // For MVP, pass [proposal] as the proposals array
      const request = promptBuilder.buildCritiquePrompt(agent, [proposal], context);
      const model = DEFAULT_MODEL_TIERS.critique;

      return callWithRetry<CritiqueOutput>({
        llmProvider,
        request,
        model,
        validate: (raw) => validator.validateCritique(raw, agent.id),
        sessionId,
        agentId: agent.id,
        round,
        stage: "critique",
      });
    },

    /**
     * Generate a revision from an agent.
     * Flow: build revision prompt (only critiques targeting this agent) -> select model (revision tier) -> call LLM -> validate -> track
     *
     * Note: Critiques are already filtered by the caller to only include those targeting this agent.
     */
    async generateRevision(
      agent: AgentConfig,
      critiques: CritiqueOutput[],
      context: WorkspaceContext
    ): Promise<RevisionOutput> {
      const request = promptBuilder.buildRevisionPrompt(agent, critiques, context);
      const model = DEFAULT_MODEL_TIERS.revision;

      return callWithRetry<RevisionOutput>({
        llmProvider,
        request,
        model,
        validate: (raw) => validator.validateRevision(raw),
        sessionId,
        agentId: agent.id,
        round,
        stage: "revision",
      });
    },

    /**
     * Synthesize consensus from all round events.
     * Flow: build consensus prompt -> select model (consensus tier) -> call LLM -> validate -> track
     */
    async synthesizeConsensus(
      roundEvents: PersistedEvent[],
      context: WorkspaceContext
    ): Promise<ConsensusOutput> {
      const request = promptBuilder.buildConsensusPrompt(roundEvents, context);
      const model = DEFAULT_MODEL_TIERS.consensus;

      return callWithRetry<ConsensusOutput>({
        llmProvider,
        request,
        model,
        validate: (raw) => validator.validateConsensus(raw),
        sessionId,
        agentId: null,
        round,
        stage: "consensus",
      });
    },
  };
}
