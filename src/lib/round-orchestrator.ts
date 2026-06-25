/**
 * RoundOrchestrator — Orchestrates the execution of debate rounds through
 * all stages (proposal → critique → revision → consensus) with auto-advancing.
 *
 * Implements the RoundOrchestrator interface from @/types/domain.
 *
 * Key design decisions:
 * - ALL stage writes in a single prisma.$transaction to prevent SQLite write contention
 * - Stage-progress events persisted IMMEDIATELY per agent (outside transaction) for real-time frontend updates
 * - Promise.allSettled ensures one agent failing doesn't block others
 * - Lock released in finally block (even on error)
 * - Snapshot created after round-completed event
 */

import { writeFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { generateSessionExport } from "@/lib/export";
import { eventStore } from "@/lib/event-store";
import { artifactStore } from "@/lib/artifact-store";
import { sessionLock } from "@/lib/session-lock";
import { snapshotManager } from "@/lib/snapshot-manager";
import { contextAssembler } from "@/lib/context-assembler";
import { tokenBudgetManager } from "@/lib/token-budget-manager";
import { createAgentExecutor } from "@/lib/agent-executor";
import { workspaceSummaryService } from "@/lib/workspace-summary-service";
import { roundSummaryService } from "@/lib/round-summary-service";
import { AGENT_CONFIGS, getCritiqueTarget, BUDGET_CONSTRAINED_TIERS } from "@/lib/agent-configs";
import { projectSessionState } from "@/lib/state-projector";
import { prisma } from "@/lib/db";
import { fetchRepoTree, GithubError } from "@/lib/github-fetcher";
import { selectCandidateFiles } from "@/lib/repo-file-selector";
import type {
  AgentType,
  Constraint,
  ConsensusOutput,
  CritiqueOutput,
  ProposalOutput,
  ProposalRepoContext,
  RevisionOutput,
  RoundOrchestrator,
  RoundStage,
  SessionConfig,
  StageResult,
  StageTransition,
} from "@/types/domain";
import cuid from "cuid";

// =============================================================================
// CONSTANTS
// =============================================================================

const ALL_AGENTS: AgentType[] = [
  "senior-engineer",
  "security-engineer",
  "performance-engineer",
  "product-engineer",
];

// =============================================================================
// HELPER FUNCTIONS
// =============================================================================

/**
 * Parse `session.config` JSON safely. Returns an empty object if the column
 * is null, undefined, or contains invalid JSON. The orchestrator must never
 * crash a round because of a malformed config blob.
 */
function parseSessionConfig(raw: string | null | undefined): SessionConfig {
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (parsed && typeof parsed === "object") {
      return parsed as SessionConfig;
    }
    return {};
  } catch {
    return {};
  }
}

/**
 * Pre-fetch the repo tree for proposal-stage tool grounding and build a
 * per-agent shortlist of candidate paths. Returns `null` when the repo
 * cannot be fetched — the orchestrator falls back to the static-context
 * proposal path in that case. Never throws.
 */
async function prepareRepoContextForProposal(
  config: SessionConfig
): Promise<Record<AgentType, ProposalRepoContext> | null> {
  const repo = config.githubRepo;
  if (!repo) return null;

  const tree = await fetchRepoTree(repo.owner, repo.repo, repo.branch);
  if (tree instanceof GithubError) {
    console.warn(
      `[round-orchestrator] repo tree fetch failed (${repo.owner}/${repo.repo}@${repo.branch}): ${tree.kind} — ${tree.message}. Falling back to static-context proposal.`
    );
    return null;
  }

  const perAgent: Partial<Record<AgentType, ProposalRepoContext>> = {};
  for (const agentId of ALL_AGENTS) {
    perAgent[agentId] = {
      owner: tree.owner,
      repo: tree.repo,
      branch: tree.branch,
      entries: tree.entries,
      shortlist: selectCandidateFiles(tree.entries, agentId),
      rawUrl: repo.rawUrl,
    };
  }
  return perAgent as Record<AgentType, ProposalRepoContext>;
}

/**
 * Process artifact suggestions from an agent output.
 * Creates or updates artifacts based on suggestions.
 */
async function processArtifactSuggestions(
  sessionId: string,
  suggestions: { type: string; title: string; content: string }[],
  agentId: AgentType | null,
  sourceEventId: string
): Promise<{ created: number; updated: number }> {
  let created = 0;
  let updated = 0;

  for (const suggestion of suggestions) {
    if (!suggestion.content) {
      console.warn(
        `[orchestrator] Skipping artifact suggestion with undefined content (title="${suggestion.title}", type="${suggestion.type}")`
      );
      continue;
    }

    const existing = await artifactStore.findByTitleAndType(
      sessionId,
      suggestion.type as import("@/types/domain").ArtifactType,
      suggestion.title
    );

    if (existing) {
      await artifactStore.updateArtifact(existing.id, {
        content: suggestion.content,
        agentId: agentId ?? undefined,
        sourceEventId,
      });
      updated++;
    } else {
      await artifactStore.createArtifact({
        sessionId,
        type: suggestion.type as import("@/types/domain").ArtifactType,
        title: suggestion.title,
        content: suggestion.content,
        createdByAgentId: agentId ?? undefined,
        sourceEventId,
      });
      created++;
    }
  }

  return { created, updated };
}

/**
 * Execute consensus artifact operations (create/update/accept/reject).
 */
async function executeArtifactOperations(
  sessionId: string,
  operations: ConsensusOutput["artifactOperations"],
  sourceEventId: string
): Promise<{ created: number; updated: number; skipped: number }> {
  let created = 0;
  let updated = 0;
  let skipped = 0;

  // Pre-fetch existing artifact IDs so update/accept/reject ops that reference
  // a non-existent ID (e.g. the consensus agent hallucinated a slug-style ID
  // instead of using the real cuid) can be skipped without throwing — one
  // bad ID would otherwise crash the entire round at the consensus stage.
  const existing = await prisma.artifact.findMany({
    where: { sessionId },
    select: { id: true },
  });
  const existingIds = new Set(existing.map((a) => a.id));

  for (const op of operations) {
    switch (op.operation) {
      case "create": {
        if (!op.content) {
          console.warn(
            `[orchestrator] Skipping consensus create with undefined content (title="${op.title ?? ""}")`
          );
          skipped++;
          break;
        }
        await artifactStore.createArtifact({
          sessionId,
          type: (op.type ?? "decision") as import("@/types/domain").ArtifactType,
          title: op.title,
          content: op.content,
          sourceEventId: op.sourceEventId ?? sourceEventId,
        });
        created++;
        break;
      }
      case "update":
      case "accept":
      case "reject": {
        if (!op.artifactId || !existingIds.has(op.artifactId)) {
          console.warn(
            `[orchestrator] Skipping consensus ${op.operation} for unknown artifactId=${op.artifactId ?? "<none>"} (title="${op.title ?? ""}")`
          );
          skipped++;
          break;
        }
        if (op.operation === "update") {
          if (!op.content) {
            console.warn(
              `[orchestrator] Skipping consensus update with undefined content (artifactId="${op.artifactId}")`
            );
            skipped++;
            break;
          }
          await artifactStore.updateArtifact(op.artifactId, {
            content: op.content,
            sourceEventId: op.sourceEventId ?? sourceEventId,
          });
        } else if (op.operation === "accept") {
          await artifactStore.changeStatus(op.artifactId, "accepted");
        } else {
          await artifactStore.changeStatus(op.artifactId, "rejected");
        }
        updated++;
        break;
      }
    }
  }

  return { created, updated, skipped };
}

/**
 * Get the next stage in the round pipeline.
 */
function getNextStage(current: RoundStage): RoundStage {
  switch (current) {
    case "proposal":
      return "critique";
    case "critique":
      return "revision";
    case "revision":
      return "consensus";
    case "consensus":
      return "awaiting-intervention";
    default:
      return "awaiting-intervention";
  }
}

// =============================================================================
// ROUND ORCHESTRATOR IMPLEMENTATION
// =============================================================================

export const roundOrchestrator: RoundOrchestrator = {
  /**
   * Start a new round for a session.
   *
   * Flow:
   * 1. Acquire SessionLock (cuid as lockId)
   * 2. Persist round-started event
   * 3. Update session: increment currentRound, set currentStage = "proposal"
   * 4. Execute proposal → critique → revision → consensus (auto-advancing)
   * 5. After each stage: check clarification, process artifacts
   * 6. After round: create snapshot, generate summaries, release lock, persist round-completed
   */
  async startRound(sessionId: string): Promise<void> {
    const lockId = cuid();

    // Acquire lock
    const acquired = await sessionLock.acquire(sessionId, lockId);
    if (!acquired) {
      throw new Error("Session is locked — another round is in progress");
    }

    try {
      // Get current session state to determine next round number
      const session = await prisma.session.findUniqueOrThrow({
        where: { id: sessionId },
      });
      const nextRound = session.currentRound + 1;

      // Persist round-started event
      await eventStore.appendEvent({
        sessionId,
        type: "round-started",
        round: nextRound,
        stage: "proposal",
        content: { round: nextRound },
      });

      // Update session: increment currentRound, set currentStage = "proposal"
      await prisma.session.update({
        where: { id: sessionId },
        data: {
          currentRound: nextRound,
          currentStage: "proposal",
        },
      });

      // Execute all stages sequentially with auto-advancing
      const stages: RoundStage[] = ["proposal", "critique", "revision", "consensus"];

      for (let i = 0; i < stages.length; i++) {
        // Execute stage
        const stageResult = await roundOrchestrator.executeCurrentStage(sessionId);

        // Check for clarification needed — pause if so
        if (stageResult.type === "clarification-needed") {
          await prisma.session.update({
            where: { id: sessionId },
            data: { status: "paused" },
          });
          return; // Exit early, round paused
        }

        // Check budget — pause if exceeded
        if (stageResult.type === "budget-exceeded") {
          await prisma.session.update({
            where: { id: sessionId },
            data: { status: "paused" },
          });
          return; // Exit early, round paused
        }

        // Advance to next stage (unless this was the last stage)
        const transition = await roundOrchestrator.checkAndAdvance(sessionId);
        if (
          transition.type === "paused-clarification" ||
          transition.type === "paused-budget"
        ) {
          // Mark the session as paused so the UI / next-round routes know
          // the round didn't complete. Without this, the session row keeps
          // status="active" with the stage frozen at whichever stage just
          // ran, which is the impossible "active mid-round" state.
          await prisma.session.update({
            where: { id: sessionId },
            data: { status: "paused" },
          });
          return; // Exit early, round paused
        }

        if (transition.type === "round-complete") {
          break; // Round is done
        }
      }

      // Round completed: persist event, generate summaries, then create snapshot

      // Persist round-completed event FIRST
      await eventStore.appendEvent({
        sessionId,
        type: "round-completed",
        round: nextRound,
        stage: null,
        content: { round: nextRound },
      });

      // Update session stage to awaiting-intervention
      await prisma.session.update({
        where: { id: sessionId },
        data: { currentStage: "awaiting-intervention" },
      });

      // NOW create snapshot (includes round-completed event)
      const allEvents = await eventStore.getSessionEvents(sessionId);
      const state = projectSessionState(allEvents);
      await snapshotManager.createSnapshot(sessionId, nextRound, state);

      // Generate summaries (non-blocking for state correctness)
      await roundSummaryService.generateRoundSummary(sessionId, nextRound);
      await workspaceSummaryService.generateSummary(sessionId);

      // Auto-export session markdown
      try {
        const { markdown, filename } = await generateSessionExport(sessionId);
        const dir = path.join(process.cwd(), ".movistan", "exports");
        await mkdir(dir, { recursive: true });
        const filepath = path.join(dir, filename);
        await writeFile(filepath, markdown);
        console.log(`[export] Written: ${filepath}`);
      } catch {
        // Export failure must not break the round
      }
    } finally {
      // Always release the lock
      await sessionLock.release(sessionId, lockId);
    }
  },

  /**
   * Execute the current stage based on session.currentStage.
   *
   * For each stage, agents execute in parallel via Promise.allSettled.
   * One agent failing doesn't block others.
   */
  async executeCurrentStage(sessionId: string): Promise<StageResult> {
    const session = await prisma.session.findUniqueOrThrow({
      where: { id: sessionId },
    });

    const currentStage = session.currentStage as RoundStage;
    const currentRound = session.currentRound;

    // Check budget before executing
    const budgetStatus = await tokenBudgetManager.checkBudget(sessionId);
    if (budgetStatus.isOverBudget) {
      const usage = await tokenBudgetManager.getSessionUsage(sessionId);
      return { type: "budget-exceeded", usage };
    }

    // Downgrade model tiers when budget is running low
    const modelTiers = budgetStatus.warningThreshold
      ? BUDGET_CONSTRAINED_TIERS
      : undefined;

    // Assemble context for all agents
    const context = await contextAssembler.assembleContext(sessionId);
    const agentExecutor = createAgentExecutor(sessionId, currentRound, modelTiers);

    let totalArtifactsCreated = 0;
    let totalArtifactsUpdated = 0;
    const clarificationQuestions: string[] = [];

    switch (currentStage) {
      // =======================================================================
      // PROPOSAL STAGE
      // =======================================================================
      case "proposal": {
        // Optionally ground the proposal stage in a real GitHub repo via the
        // tool-call loop. The static-context path is always the fallback if
        // no repo is configured or the fetch fails.
        const sessionConfig = parseSessionConfig(session.config);
        const repoContexts = await prepareRepoContextForProposal(sessionConfig);
        if (sessionConfig.githubRepo && !repoContexts) {
          await eventStore.appendEvent({
            sessionId,
            type: "stage-progress",
            agentId: null,
            round: currentRound,
            stage: "proposal",
            content: {
              stage: "proposal",
              status: "repo-fetch-skipped",
              repo: `${sessionConfig.githubRepo.owner}/${sessionConfig.githubRepo.repo}@${sessionConfig.githubRepo.branch}`,
            },
          });
        }

        // Execute ALL 4 agents in parallel
        const proposalResults = await Promise.allSettled(
          ALL_AGENTS.map(async (agentId) => {
            const agent = AGENT_CONFIGS[agentId];
            const repoCtx = repoContexts?.[agentId];
            let proposal: ProposalOutput;
            let toolCallCount: number | undefined;
            let capHit: boolean | undefined;
            let filesRead: string[] | undefined;
            if (repoCtx) {
              const result = await agentExecutor.generateProposalWithTools(agent, context, repoCtx);
              proposal = result.proposal;
              toolCallCount = result.toolStats.toolCallCount;
              capHit = result.toolStats.capHit;
              filesRead = result.toolStats.filesRead;
            } else {
              proposal = await agentExecutor.generateProposal(agent, context);
            }

            // Persist stage-progress event immediately for real-time UI
            await eventStore.appendEvent({
              sessionId,
              type: "stage-progress",
              agentId,
              round: currentRound,
              stage: "proposal",
              content: {
                agentId,
                stage: "proposal",
                status: "completed",
                groundedByRepo: Boolean(repoCtx),
                ...(toolCallCount !== undefined ? { toolCallCount, capHit, filesRead } : {}),
              },
            });

            return { agentId, proposal };
          })
        );

        // Batch-write all proposal events in single transaction
        const successfulProposals: { agentId: AgentType; proposal: ProposalOutput }[] = [];
        for (const result of proposalResults) {
          if (result.status === "fulfilled") {
            successfulProposals.push(result.value);
          }
        }

        // Persist all proposals in a single transaction
        await prisma.$transaction(
          successfulProposals.map(({ agentId, proposal }) =>
            prisma.event.create({
              data: {
                sessionId,
                type: "proposal",
                agentId,
                round: currentRound,
                stage: "proposal",
                content: JSON.stringify(proposal),
              },
            })
          )
        );

        // Process artifact suggestions and check clarification
        for (const { agentId, proposal } of successfulProposals) {
          if (proposal.artifactSuggestions.length > 0) {
            // Get the event ID for provenance (fetch last proposal event for this agent)
            const events = await eventStore.getRoundEvents(sessionId, currentRound, "proposal");
            const sourceEvent = events.find((e) => e.agentId === agentId);
            const sourceEventId = sourceEvent?.id ?? "";

            const { created, updated } = await processArtifactSuggestions(
              sessionId,
              proposal.artifactSuggestions,
              agentId,
              sourceEventId
            );
            totalArtifactsCreated += created;
            totalArtifactsUpdated += updated;
          }

          if (proposal.needsClarification && proposal.clarificationQuestions) {
            clarificationQuestions.push(...proposal.clarificationQuestions);
          }
        }

        break;
      }

      // =======================================================================
      // CRITIQUE STAGE
      // =======================================================================
      case "critique": {
        // Get proposals from this round's events
        const roundEvents = await eventStore.getRoundEvents(
          sessionId,
          currentRound,
          "proposal"
        );

        const proposals = new Map<AgentType, ProposalOutput>();
        for (const event of roundEvents) {
          if (event.type === "proposal" && event.agentId) {
            try {
              proposals.set(
                event.agentId as AgentType,
                JSON.parse(event.content) as ProposalOutput
              );
            } catch {
              // Skip malformed events
            }
          }
        }

        // Execute ALL 4 agents in parallel — each critiques their opposing pair
        const critiqueResults = await Promise.allSettled(
          ALL_AGENTS.map(async (agentId) => {
            const agent = AGENT_CONFIGS[agentId];
            const targetId = getCritiqueTarget(agentId);
            const targetProposal = proposals.get(targetId);

            if (!targetProposal) {
              throw new Error(
                `No proposal found for critique target ${targetId} (from agent ${agentId})`
              );
            }

            const critique = await agentExecutor.generateCritique(
              agent,
              targetProposal,
              context
            );

            // Persist stage-progress event immediately
            await eventStore.appendEvent({
              sessionId,
              type: "stage-progress",
              agentId,
              round: currentRound,
              stage: "critique",
              content: { agentId, stage: "critique", status: "completed" },
            });

            return { agentId, critique };
          })
        );

        // Batch-write all critique events
        const successfulCritiques: { agentId: AgentType; critique: CritiqueOutput }[] = [];
        for (const result of critiqueResults) {
          if (result.status === "fulfilled") {
            successfulCritiques.push(result.value);
          }
        }

        await prisma.$transaction(
          successfulCritiques.map(({ agentId, critique }) =>
            prisma.event.create({
              data: {
                sessionId,
                type: "critique",
                agentId,
                round: currentRound,
                stage: "critique",
                content: JSON.stringify(critique),
              },
            })
          )
        );

        // Process artifact suggestions and check clarification
        for (const { agentId, critique } of successfulCritiques) {
          if (critique.artifactSuggestions.length > 0) {
            const events = await eventStore.getRoundEvents(sessionId, currentRound, "critique");
            const sourceEvent = events.find((e) => e.agentId === agentId);
            const sourceEventId = sourceEvent?.id ?? "";

            const { created, updated } = await processArtifactSuggestions(
              sessionId,
              critique.artifactSuggestions,
              agentId,
              sourceEventId
            );
            totalArtifactsCreated += created;
            totalArtifactsUpdated += updated;
          }

          if (critique.needsClarification && critique.clarificationQuestions) {
            clarificationQuestions.push(...critique.clarificationQuestions);
          }
        }

        break;
      }

      // =======================================================================
      // REVISION STAGE
      // =======================================================================
      case "revision": {
        // Get critiques from this round
        const critiqueEvents = await eventStore.getRoundEvents(
          sessionId,
          currentRound,
          "critique"
        );

        const allCritiques: CritiqueOutput[] = [];
        for (const event of critiqueEvents) {
          if (event.type === "critique") {
            try {
              allCritiques.push(JSON.parse(event.content) as CritiqueOutput);
            } catch {
              // Skip malformed
            }
          }
        }

        // Execute ALL 4 agents in parallel
        // Each agent receives only critiques targeting them (already filtered by targetAgentId)
        const revisionResults = await Promise.allSettled(
          ALL_AGENTS.map(async (agentId) => {
            const agent = AGENT_CONFIGS[agentId];
            // Filter critiques targeting this agent
            const targetingCritiques = allCritiques.filter(
              (c) => c.targetAgentId === agentId
            );

            const revision = await agentExecutor.generateRevision(
              agent,
              targetingCritiques,
              context
            );

            // Persist stage-progress event immediately
            await eventStore.appendEvent({
              sessionId,
              type: "stage-progress",
              agentId,
              round: currentRound,
              stage: "revision",
              content: { agentId, stage: "revision", status: "completed" },
            });

            return { agentId, revision };
          })
        );

        // Batch-write all revision events
        const successfulRevisions: { agentId: AgentType; revision: RevisionOutput }[] = [];
        for (const result of revisionResults) {
          if (result.status === "fulfilled") {
            successfulRevisions.push(result.value);
          }
        }

        await prisma.$transaction(
          successfulRevisions.map(({ agentId, revision }) =>
            prisma.event.create({
              data: {
                sessionId,
                type: "revision",
                agentId,
                round: currentRound,
                stage: "revision",
                content: JSON.stringify(revision),
              },
            })
          )
        );

        // Process artifact suggestions and check clarification
        for (const { agentId, revision } of successfulRevisions) {
          if (revision.artifactSuggestions.length > 0) {
            const events = await eventStore.getRoundEvents(sessionId, currentRound, "revision");
            const sourceEvent = events.find((e) => e.agentId === agentId);
            const sourceEventId = sourceEvent?.id ?? "";

            const { created, updated } = await processArtifactSuggestions(
              sessionId,
              revision.artifactSuggestions,
              agentId,
              sourceEventId
            );
            totalArtifactsCreated += created;
            totalArtifactsUpdated += updated;
          }

          if (revision.needsClarification && revision.clarificationQuestions) {
            clarificationQuestions.push(...revision.clarificationQuestions);
          }
        }

        break;
      }

      // =======================================================================
      // CONSENSUS STAGE
      // =======================================================================
      case "consensus": {
        // Get all round events for consensus synthesis
        const allRoundEvents = await eventStore.getRoundEvents(
          sessionId,
          currentRound
        );

        // Single LLM call (not parallel)
        const consensus = await agentExecutor.synthesizeConsensus(
          allRoundEvents,
          context
        );

        // Persist consensus event
        const consensusEvent = await eventStore.appendEvent({
          sessionId,
          type: "consensus-update",
          agentId: null,
          round: currentRound,
          stage: "consensus",
          content: consensus,
        });

        // Execute artifact operations from ConsensusOutput
        if (consensus.artifactOperations.length > 0) {
          const { created, updated } = await executeArtifactOperations(
            sessionId,
            consensus.artifactOperations,
            consensusEvent.id
          );
          totalArtifactsCreated += created;
          totalArtifactsUpdated += updated;
        }

        break;
      }

      default:
        // No-op for awaiting-intervention or unknown stages
        break;
    }

    // Return result based on whether clarification is needed
    if (clarificationQuestions.length > 0) {
      // Check session config for clarification policy
      const config: SessionConfig = session.config
        ? JSON.parse(session.config)
        : {};
      const policy = config.clarificationPolicy ?? "allow";

      // "suppress" or 0 → never pause for clarification
      // number > 0 → pause but cap questions to that count
      // "allow" → pause with all questions (default)
      if (policy !== "suppress" && policy !== 0) {
        const questions =
          typeof policy === "number"
            ? clarificationQuestions.slice(0, policy)
            : clarificationQuestions;

        await eventStore.appendEvent({
          sessionId,
          type: "clarification-request",
          round: currentRound,
          stage: currentStage,
          content: { questions },
        });

        return { type: "clarification-needed", questions };
      }
      // Policy suppressed — continue as if no clarification was needed
    }

    return {
      type: "completed",
      artifactsCreated: totalArtifactsCreated,
      artifactsUpdated: totalArtifactsUpdated,
    };
  },

  /**
   * Check if any output has needsClarification=true → pause.
   * Check budget → pause if exceeded.
   * Otherwise advance: proposal→critique→revision→consensus→awaiting-intervention.
   */
  async checkAndAdvance(sessionId: string): Promise<StageTransition> {
    const session = await prisma.session.findUniqueOrThrow({
      where: { id: sessionId },
    });

    const currentStage = session.currentStage as RoundStage;
    const currentRound = session.currentRound;

    // Check budget
    const budgetStatus = await tokenBudgetManager.checkBudget(sessionId);
    if (budgetStatus.isOverBudget) {
      return { type: "paused-budget", status: budgetStatus };
    }

    // Determine next stage
    const nextStage = getNextStage(currentStage);

    // If we're at consensus -> awaiting-intervention, the round is complete
    if (currentStage === "consensus") {
      return { type: "round-complete", round: currentRound };
    }

    // Advance to next stage
    await prisma.session.update({
      where: { id: sessionId },
      data: { currentStage: nextStage },
    });

    return { type: "advanced", from: currentStage, to: nextStage };
  },

  /**
   * Handle a user intervention by persisting the constraint as an event.
   */
  async handleIntervention(
    sessionId: string,
    constraint: Constraint
  ): Promise<void> {
    const session = await prisma.session.findUniqueOrThrow({
      where: { id: sessionId },
    });

    await eventStore.appendEvent({
      sessionId,
      type: "user-intervention",
      round: session.currentRound,
      stage: "awaiting-intervention",
      content: constraint,
    });

    // Resume session if it was paused
    if (session.status === "paused") {
      await prisma.session.update({
        where: { id: sessionId },
        data: { status: "active" },
      });
    }
  },

  /**
   * Skip intervention and advance to next round.
   * Effectively calls startRound again.
   */
  async skipIntervention(sessionId: string): Promise<void> {
    // Resume session if paused
    await prisma.session.update({
      where: { id: sessionId },
      data: { status: "active" },
    });

    // Start a new round
    await roundOrchestrator.startRound(sessionId);
  },
};
