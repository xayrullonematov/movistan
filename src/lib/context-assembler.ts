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
    // Calculate token usage for each component
    const currentRoundTokens = estimateTokensForData(currentRoundEvents);
    const artifactTokens = estimateTokensForData(artifactSummaries);
    const constraintTokens = estimateTokensForData(constraints);
    const summaryTokens = estimateTokens(workspaceSummary);
    const roundSummaryTokens = estimateTokensForData(roundSummaries);
    const disagreementTokens = estimateTokensForData(unresolvedDisagreements);
    const problemTokens = estimateTokens(session.problemDescription);

    let totalTokens =
      currentRoundTokens +
      artifactTokens +
      constraintTokens +
      summaryTokens +
      roundSummaryTokens +
      disagreementTokens +
      problemTokens;

    // Truncation: remove from lowest priority first

    // Priority 6: Remove prior session context (not implemented in MVP, skip)
    // Already no priorSessionSummary in MVP

    // Priority 5: Remove oldest round summaries first
    while (totalTokens > budget && roundSummaries.length > 0) {
      const removedSummary = roundSummaries.shift()!;
      const removedTokens = estimateTokensForData(removedSummary);
      totalTokens -= removedTokens;
    }

    // Priority 4: Remove workspace summary if still over budget
    let finalWorkspaceSummary = workspaceSummary;
    if (totalTokens > budget) {
      totalTokens -= summaryTokens;
      finalWorkspaceSummary = "";
    }

    // Priority 3: Remove constraints if still over budget
    let finalConstraints = constraints;
    if (totalTokens > budget) {
      totalTokens -= constraintTokens;
      finalConstraints = [];
    }

    // Priority 2: Remove artifact summaries if still over budget
    let finalArtifactSummaries = artifactSummaries;
    if (totalTokens > budget) {
      totalTokens -= artifactTokens;
      finalArtifactSummaries = [];
    }

    // Priority 1: Current round events are NEVER truncated

    return {
      problemDescription: session.problemDescription,
      constraints: finalConstraints,
      workspaceSummary: finalWorkspaceSummary,
      artifactSummaries: finalArtifactSummaries,
      roundSummaries,
      currentRoundEvents,
      unresolvedDisagreements,
    };
  },
};
