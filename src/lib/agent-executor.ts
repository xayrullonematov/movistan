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
import { runProposalToolLoop } from "@/lib/agent-tool-loop";
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
  ProposalRepoContext,
  ProposalWithToolsResult,
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

    // If output was truncated (finish_reason: length), retry with 2x max_tokens
    if (response.finishReason === "length" && attempt < MAX_VALIDATION_RETRIES) {
      const currentMax = effectiveRequest.maxTokens ?? 12288;
      effectiveRequest = { ...effectiveRequest, maxTokens: Math.min(currentMax * 2, 32768) };
      lastErrors = ["Output was truncated (max_tokens reached). Retrying with larger budget."];
      await tokenBudgetManager.trackUsage(sessionId, {
        agentId, round, stage,
        inputTokens: response.inputTokens,
        outputTokens: response.outputTokens,
        model: response.model,
      });
      continue;
    }

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

  // All retries exhausted — throw error with details.
  // Log first so failures surface even when the caller (e.g. Promise.allSettled
  // in the orchestrator) swallows the rejection.
  const lastSnippet = (lastResponse?.content ?? "").slice(0, 400);
  console.error(
    `[agent-executor] ${stage} validation failed after ${MAX_VALIDATION_RETRIES + 1} attempts ` +
      `(agent=${agentId ?? "system"}, model=${lastResponse?.model ?? "?"}). ` +
      `Errors: ${lastErrors.join("; ")}. ` +
      `Last response snippet: ${lastSnippet}`
  );
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
export function createAgentExecutor(sessionId: string, round: number, modelTiers?: Partial<import("@/types/domain").ModelTierConfig>): AgentExecutor {
  const llmProvider = createLLMProvider();
  const tiers = { ...DEFAULT_MODEL_TIERS, ...modelTiers };

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
      const model = tiers.proposal;

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
     * Tool-grounded proposal: runs the GitHub tool-call loop, then validates.
     * On validation failure, falls back to the standard re-prompt retry path
     * (no further tool calls) so the model can repair its JSON cheaply.
     * Combined usage from every tool-loop turn is tracked as a single record.
     */
    async generateProposalWithTools(
      agent: AgentConfig,
      context: WorkspaceContext,
      repoContext: ProposalRepoContext
    ): Promise<ProposalWithToolsResult> {
      const baseRequest = promptBuilder.buildProposalPrompt(agent, context);
      const model = tiers.proposal;

      // First attempt: full tool loop.
      const loopResult = await runProposalToolLoop({
        llmProvider,
        baseRequest,
        model,
        agentId: agent.id,
        repoContext: {
          owner: repoContext.owner,
          repo: repoContext.repo,
          branch: repoContext.branch,
          entries: repoContext.entries,
          shortlist: repoContext.shortlist,
          rawUrl: repoContext.rawUrl,
        },
      });

      const toolStats = {
        toolCallCount: loopResult.toolCallCount,
        capHit: loopResult.capHit,
        filesRead: loopResult.filesRead,
      };

      // Always record the cumulative tool-loop usage, even before validation,
      // so the next stage's budget check sees the real cost.
      await tokenBudgetManager.trackUsage(sessionId, {
        agentId: agent.id,
        round,
        stage: "proposal",
        inputTokens: loopResult.combinedUsage.inputTokens,
        outputTokens: loopResult.combinedUsage.outputTokens,
        model: loopResult.combinedUsage.model,
      });

      const firstValidation = validator.validateProposal(loopResult.finalContent);
      if (firstValidation.success) {
        return { proposal: firstValidation.data, toolStats };
      }

      // Validation failed — re-prompt up to MAX_VALIDATION_RETRIES times with
      // tools disabled. The model already has the tool results in context via
      // the prior conversation; we just need it to fix the JSON shape.
      let lastErrors = firstValidation.errors;
      let lastContent = loopResult.finalContent;

      for (let attempt = 1; attempt <= MAX_VALIDATION_RETRIES; attempt++) {
        const errorMsg = buildValidationErrorMessage(lastErrors);
        const repairRequest: LLMRequest = {
          ...baseRequest,
          userMessage: `${baseRequest.userMessage}\n\n---\n\n${errorMsg}\n\nPrevious invalid response:\n${lastContent}`,
        };
        const response = await llmProvider.complete(repairRequest, model);
        lastContent = response.content;
        await tokenBudgetManager.trackUsage(sessionId, {
          agentId: agent.id,
          round,
          stage: "proposal",
          inputTokens: response.inputTokens,
          outputTokens: response.outputTokens,
          model: response.model,
        });

        const result = validator.validateProposal(response.content);
        if (result.success) {
          return { proposal: result.data, toolStats };
        }
        lastErrors = result.errors;
      }

      console.error(
        `[agent-executor] proposal (with tools) validation failed after ${MAX_VALIDATION_RETRIES + 1} attempts ` +
          `(agent=${agent.id}, model=${loopResult.combinedUsage.model}, toolCalls=${loopResult.toolCallCount}, capHit=${loopResult.capHit}). ` +
          `Errors: ${lastErrors.join("; ")}. ` +
          `Last response snippet: ${lastContent.slice(0, 400)}`
      );
      throw new Error(
        `Validation failed after ${MAX_VALIDATION_RETRIES + 1} attempts for proposal (agent: ${agent.id}). Errors: ${lastErrors.join("; ")}`
      );
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
      const model = tiers.critique;

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
      const model = tiers.revision;

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
      const model = tiers.consensus;

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
