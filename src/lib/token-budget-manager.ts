/**
 * Token Budget Manager
 *
 * Tracks LLM API token usage per session, estimates costs,
 * and enforces budget limits. Uses hardcoded model pricing
 * defaults (configurable later).
 */

import { prisma } from "@/lib/db";
import type {
  TokenBudgetManager,
  TokenUsageRecord,
  SessionTokenUsage,
  CostEstimate,
  BudgetStatus,
  AgentType,
} from "@/types/domain";

// =============================================================================
// MODEL PRICING (hardcoded defaults, can be made configurable later)
// =============================================================================

interface ModelPricing {
  inputPricePerMillion: number;
  outputPricePerMillion: number;
}

const MODEL_PRICING: Record<string, ModelPricing> = {
  // OpenAI
  "gpt-4o": {
    inputPricePerMillion: 2.5,
    outputPricePerMillion: 10.0,
  },
  "gpt-4o-mini": {
    inputPricePerMillion: 0.15,
    outputPricePerMillion: 0.6,
  },
  // AWS Bedrock — Anthropic (per Anthropic published Sonnet 4 / Haiku 4 rates).
  // Cached input would be ~10% of these; the executor currently sums cache
  // reads into inputTokens so we under-bill rather than over-bill, which is
  // safe for the budget guardrail.
  "anthropic.claude-sonnet-4-6": {
    inputPricePerMillion: 3.0,
    outputPricePerMillion: 15.0,
  },
  "anthropic.claude-haiku-4-5-20251001-v1:0": {
    inputPricePerMillion: 0.8,
    outputPricePerMillion: 4.0,
  },
};

const DEFAULT_MODEL = "gpt-4o";

/**
 * Look up pricing for a model. Bedrock inference profile IDs (us./global.
 * prefixed) charge at the same rate as the bare model ID, so strip the
 * region prefix before lookup.
 */
function getPricing(model: string): ModelPricing {
  if (MODEL_PRICING[model]) return MODEL_PRICING[model];
  const stripped = model.replace(/^(us|eu|apac|global)\./, "");
  return MODEL_PRICING[stripped] ?? MODEL_PRICING[DEFAULT_MODEL];
}

function calculateCost(
  inputTokens: number,
  outputTokens: number,
  model: string
): number {
  const pricing = getPricing(model);
  return (
    (inputTokens * pricing.inputPricePerMillion +
      outputTokens * pricing.outputPricePerMillion) /
    1_000_000
  );
}

// =============================================================================
// CONSTANTS
// =============================================================================

/** Default estimated input tokens per call when no history is available */
const DEFAULT_CONTEXT_SIZE = 4000;

/**
 * Number of LLM calls per round:
 * 4 proposal + 4 critique + 4 revision + 1 consensus + 2 summaries = 15
 */
const CALLS_PER_ROUND = 15;

// =============================================================================
// IMPLEMENTATION
// =============================================================================

export const tokenBudgetManager: TokenBudgetManager = {
  /**
   * Persist a TokenUsage record via Prisma.
   */
  async trackUsage(sessionId: string, usage: TokenUsageRecord): Promise<void> {
    await prisma.tokenUsage.create({
      data: {
        sessionId,
        agentId: usage.agentId,
        round: usage.round,
        stage: usage.stage,
        inputTokens: usage.inputTokens,
        outputTokens: usage.outputTokens,
        model: usage.model,
      },
    });
  },

  /**
   * Query all TokenUsage records for the session and aggregate them.
   */
  async getSessionUsage(sessionId: string): Promise<SessionTokenUsage> {
    const records = await prisma.tokenUsage.findMany({
      where: { sessionId },
    });

    let totalInputTokens = 0;
    let totalOutputTokens = 0;
    const byRound: Record<number, { input: number; output: number }> = {};
    const byAgent: Record<AgentType, { input: number; output: number }> = {
      "senior-engineer": { input: 0, output: 0 },
      "security-engineer": { input: 0, output: 0 },
      "performance-engineer": { input: 0, output: 0 },
      "product-engineer": { input: 0, output: 0 },
    };

    let estimatedCostUsd = 0;

    for (const record of records) {
      totalInputTokens += record.inputTokens;
      totalOutputTokens += record.outputTokens;

      // Aggregate by round
      if (!byRound[record.round]) {
        byRound[record.round] = { input: 0, output: 0 };
      }
      byRound[record.round].input += record.inputTokens;
      byRound[record.round].output += record.outputTokens;

      // Aggregate by agent
      if (record.agentId && record.agentId in byAgent) {
        const agentKey = record.agentId as AgentType;
        byAgent[agentKey].input += record.inputTokens;
        byAgent[agentKey].output += record.outputTokens;
      }

      // Calculate cost per record using its specific model
      estimatedCostUsd += calculateCost(
        record.inputTokens,
        record.outputTokens,
        record.model
      );
    }

    return {
      totalInputTokens,
      totalOutputTokens,
      byRound,
      byAgent,
      estimatedCostUsd,
    };
  },

  /**
   * Estimate the cost of an upcoming round based on historical usage
   * or defaults.
   */
  async estimateRoundCost(sessionId: string): Promise<CostEstimate> {
    // Get average input tokens from last round's usage, or use default
    const records = await prisma.tokenUsage.findMany({
      where: { sessionId },
      orderBy: { round: "desc" },
    });

    let avgInputTokens = DEFAULT_CONTEXT_SIZE;
    let model = DEFAULT_MODEL;

    if (records.length > 0) {
      // Get the latest round number
      const latestRound = records[0].round;
      const lastRoundRecords = records.filter(
        (r) => r.round === latestRound
      );

      if (lastRoundRecords.length > 0) {
        const totalInput = lastRoundRecords.reduce(
          (sum, r) => sum + r.inputTokens,
          0
        );
        avgInputTokens = Math.round(totalInput / lastRoundRecords.length);
        // Use the model from the most recent call
        model = lastRoundRecords[0].model;
      }
    }

    // Estimate output tokens as roughly 1/4 of input tokens (typical for structured output)
    const estimatedOutputPerCall = Math.round(avgInputTokens / 4);

    const estimatedInputTokens = avgInputTokens * CALLS_PER_ROUND;
    const estimatedOutputTokens = estimatedOutputPerCall * CALLS_PER_ROUND;
    const estimatedCostUsd = calculateCost(
      estimatedInputTokens,
      estimatedOutputTokens,
      model
    );

    return {
      estimatedInputTokens,
      estimatedOutputTokens,
      estimatedCostUsd,
      model,
    };
  },

  /**
   * Check session budget status.
   * If budget is null (no limit set), remaining is null and isOverBudget is false.
   */
  async checkBudget(sessionId: string): Promise<BudgetStatus> {
    // Get the session's tokenBudget
    const session = await prisma.session.findUniqueOrThrow({
      where: { id: sessionId },
      select: { tokenBudget: true },
    });

    // Get current usage
    const usage = await tokenBudgetManager.getSessionUsage(sessionId);
    const used = usage.totalInputTokens + usage.totalOutputTokens;
    const budget = session.tokenBudget;

    if (budget === null) {
      // No budget set — unlimited
      return {
        used,
        budget: null,
        remaining: null,
        isOverBudget: false,
        warningThreshold: false,
      };
    }

    const remaining = budget - used;
    const isOverBudget = used > budget;
    const warningThreshold = used >= budget * 0.8;

    return {
      used,
      budget,
      remaining,
      isOverBudget,
      warningThreshold,
    };
  },
};
