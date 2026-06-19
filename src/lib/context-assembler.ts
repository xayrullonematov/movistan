import { prisma } from "@/lib/db";
import { eventStore } from "@/lib/event-store";
import { snapshotManager } from "@/lib/snapshot-manager";
import { workspaceSummaryService } from "@/lib/workspace-summary-service";
import { artifactSummaryService } from "@/lib/artifact-summary-service";
import { roundSummaryService } from "@/lib/round-summary-service";
import type {
  ContextAssembler,
  WorkspaceContext,
  Constraint,
  ArtifactState,
  RoundSummary,
  PersistedEvent,
  ConsensusOutput,
} from "@/types/domain";

/**
 * ContextAssembler implementation.
 *
 * Assembles the complete workspace context for an agent LLM call.
 * Respects a configurable token budget (default: 100,000 tokens).
 *
 * Token estimation: character-based heuristic (chars / 4 ≈ tokens).
 *
 * Context priority (when approaching budget, truncate from lowest priority first):
 * 1. Current round events (NEVER truncated)
 * 2. Artifact state
 * 3. Active constraints
 * 4. Workspace summary
 * 5. Round summaries (oldest removed first)
 * 6. Prior session context (removed first)
 */

/** Default token budget for context assembly */
const DEFAULT_TOKEN_BUDGET = 100_000;

/**
 * Estimates token count from text content using character-based heuristic.
 * chars / 4 ≈ tokens (rough approximation for English text and JSON).
 */
function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

/**
 * Estimates token count for serialized data.
 */
function estimateTokensForData(data: unknown): number {
  const serialized = JSON.stringify(data);
  return estimateTokens(serialized);
}

export const contextAssembler: ContextAssembler = {
  /**
   * Assembles the complete workspace context for an agent LLM call.
   *
   * Assembly order:
   * 1. Get workspace summary via WorkspaceSummaryService
   * 2. Get artifact summaries via ArtifactSummaryService
   * 3. Get round summaries via RoundSummaryService
   * 4. Get current round events from EventStore (full, never truncated)
   * 5. Get constraints from session state
   * 6. Get unresolved disagreements from latest consensus
   *
   * When approaching token budget, truncation happens from lowest priority first:
   * - Prior session context removed first (priority 6)
   * - Round summaries oldest removed first (priority 5)
   * - Workspace summary (priority 4)
   * - Active constraints (priority 3)
   * - Artifact state (priority 2)
   * - Current round events: NEVER truncated (priority 1)
   */
  async assembleContext(
    sessionId: string,
    tokenBudget?: number
  ): Promise<WorkspaceContext> {
    const budget = tokenBudget ?? DEFAULT_TOKEN_BUDGET;

    // Get session data and projected state
    const session = await prisma.session.findUniqueOrThrow({
      where: { id: sessionId },
    });
    const state = await snapshotManager.projectFromSnapshot(sessionId);

    // Priority 1: Current round events (NEVER truncated)
    const currentRoundEvents: PersistedEvent[] =
      state.currentRound > 0
        ? await eventStore.getRoundEvents(sessionId, state.currentRound)
        : [];

    // Priority 2: Artifact summaries
    const artifactSummaries: ArtifactState[] =
      await artifactSummaryService.generateArtifactSummary(sessionId);

    // Priority 3: Active constraints
    const constraints: Constraint[] = state.constraints;

    // Priority 4: Workspace summary
    const workspaceSummary: string =
      await workspaceSummaryService.generateSummary(sessionId);

    // Priority 5: Round summaries (all completed rounds)
    const roundSummaries: RoundSummary[] =
      await roundSummaryService.getRoundSummaries(sessionId);

    // Priority 6: Unresolved disagreements from latest consensus
    const unresolvedDisagreements: ConsensusOutput["disagreements"] =
      state.consensus?.disagreements ?? [];

    // --- Token budget enforcement ---
    // Fixed-cost components (never truncated): current round events, the
    // unresolved disagreements carried from consensus, and the problem statement.
    const fixedTokens =
      estimateTokensForData(currentRoundEvents) +
      estimateTokensForData(unresolvedDisagreements) +
      estimateTokens(session.problemDescription);

    // Truncation operates on copies — never mutate the arrays returned by the
    // services. Lowest priority is removed first.
    const finalRoundSummaries = [...roundSummaries];
    let finalWorkspaceSummary = workspaceSummary;
    let finalConstraints = constraints;
    let finalArtifactSummaries = artifactSummaries;

    // Recompute the total from the current working set after every step rather
    // than decrementing a running counter. Decrementing drifts at budget
    // boundaries (the array is costed with one ceil but elements are removed
    // with per-element ceils), which can stop truncation while the context is
    // still over budget. Recomputing keeps the estimate a consistent upper
    // bound on the true serialized cost.
    const totalTokens = () =>
      fixedTokens +
      estimateTokensForData(finalArtifactSummaries) +
      estimateTokensForData(finalConstraints) +
      estimateTokens(finalWorkspaceSummary) +
      estimateTokensForData(finalRoundSummaries);

    // Priority 6: Prior session context (not implemented in MVP) — removed first.

    // Priority 5: Remove oldest round summaries first.
    while (totalTokens() > budget && finalRoundSummaries.length > 0) {
      finalRoundSummaries.shift();
    }

    // Priority 4: Remove workspace summary if still over budget.
    if (totalTokens() > budget) {
      finalWorkspaceSummary = "";
    }

    // Priority 3: Remove constraints if still over budget.
    if (totalTokens() > budget) {
      finalConstraints = [];
    }

    // Priority 2: Remove artifact summaries if still over budget.
    if (totalTokens() > budget) {
      finalArtifactSummaries = [];
    }

    // Priority 1: Current round events are NEVER truncated.

    return {
      problemDescription: session.problemDescription,
      constraints: finalConstraints,
      workspaceSummary: finalWorkspaceSummary,
      artifactSummaries: finalArtifactSummaries,
      roundSummaries: finalRoundSummaries,
      currentRoundEvents,
      unresolvedDisagreements,
    };
  },
};
