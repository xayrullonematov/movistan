/**
 * Session Export Service
 *
 * Generates a comprehensive markdown report of a session's review results,
 * including problem description, constraints, findings, round summaries,
 * agent agreement, agent positions, and cost breakdown.
 */

import { snapshotManager } from "@/lib/snapshot-manager";
import { tokenBudgetManager } from "@/lib/token-budget-manager";
import type {
  SessionState,
  ArtifactState,
  SessionTokenUsage,
  AgentType,
} from "@/types/domain";

// =============================================================================
// AGENT DISPLAY NAMES
// =============================================================================

const AGENT_DISPLAY_NAMES: Record<AgentType, string> = {
  "senior-engineer": "Senior Engineer",
  "security-engineer": "Security Engineer",
  "performance-engineer": "Performance Engineer",
  "product-engineer": "Product Engineer",
};

// =============================================================================
// MARKDOWN GENERATION HELPERS
// =============================================================================

function formatArtifact(artifact: ArtifactState): string {
  const contributors = artifact.contributors
    .map((id) => AGENT_DISPLAY_NAMES[id] || id)
    .join(", ");

  return [
    `### ${artifact.title}`,
    "",
    `- **Type:** ${artifact.type}`,
    `- **Status:** ${artifact.status}`,
    `- **Contributors:** ${contributors || "Manual"}`,
    "",
    artifact.content,
    "",
  ].join("\n");
}

function formatTokenUsage(usage: SessionTokenUsage): string {
  const lines: string[] = [
    `- **Total Input Tokens:** ${usage.totalInputTokens.toLocaleString()}`,
    `- **Total Output Tokens:** ${usage.totalOutputTokens.toLocaleString()}`,
    `- **Estimated Cost:** $${usage.estimatedCostUsd.toFixed(4)}`,
    "",
    "**By Agent:**",
    "",
  ];

  for (const [agentId, agentUsage] of Object.entries(usage.byAgent)) {
    const name = AGENT_DISPLAY_NAMES[agentId as AgentType] || agentId;
    lines.push(
      `- ${name}: ${agentUsage.input.toLocaleString()} in / ${agentUsage.output.toLocaleString()} out`
    );
  }

  if (Object.keys(usage.byRound).length > 0) {
    lines.push("", "**By Round:**", "");
    for (const [round, roundUsage] of Object.entries(usage.byRound)) {
      lines.push(
        `- Round ${round}: ${roundUsage.input.toLocaleString()} in / ${roundUsage.output.toLocaleString()} out`
      );
    }
  }

  return lines.join("\n");
}

// =============================================================================
// MAIN EXPORT FUNCTION
// =============================================================================

/**
 * Generates a complete session export as a markdown report.
 *
 * @param sessionId - The session to export
 * @returns { markdown, filename } - The report content and suggested filename
 */
export async function generateSessionExport(
  sessionId: string
): Promise<{ markdown: string; filename: string }> {
  // Get session state and token usage
  const state: SessionState = await snapshotManager.projectFromSnapshot(sessionId);
  const usage: SessionTokenUsage = await tokenBudgetManager.getSessionUsage(sessionId);

  const title = state.problemDescription.slice(0, 80) || "Untitled Session";
  const sections: string[] = [];

  // Title
  sections.push(`# Repo Review Report: ${title}`);
  sections.push("");

  // Problem Description
  sections.push("## Problem Description");
  sections.push("");
  sections.push(state.problemDescription);
  sections.push("");

  // Constraints
  if (state.constraints.length > 0) {
    sections.push("## Constraints");
    sections.push("");
    for (const constraint of state.constraints) {
      sections.push(`- **[${constraint.category}]** ${constraint.text}`);
    }
    sections.push("");
  }

  // Findings
  if (state.artifacts.length > 0) {
    sections.push("## Findings");
    sections.push("");
    for (const artifact of state.artifacts) {
      sections.push(formatArtifact(artifact));
    }
  }

  // Debate Summary (round by round)
  if (state.rounds.length > 0) {
    sections.push("## Debate Summary");
    sections.push("");

    for (const round of state.rounds) {
      sections.push(`### Round ${round.number}`);
      sections.push("");

      if (round.summary) {
        if (round.summary.keyProposals.length > 0) {
          sections.push("**Key Proposals:**");
          for (const p of round.summary.keyProposals) {
            sections.push(`- ${p}`);
          }
          sections.push("");
        }

        if (round.summary.majorCritiques.length > 0) {
          sections.push("**Major Critiques:**");
          for (const c of round.summary.majorCritiques) {
            sections.push(`- ${c}`);
          }
          sections.push("");
        }

        if (round.summary.revisionOutcomes.length > 0) {
          sections.push("**Revision Outcomes:**");
          for (const r of round.summary.revisionOutcomes) {
            sections.push(`- ${r}`);
          }
          sections.push("");
        }

        if (round.summary.consensusPoints.length > 0) {
          sections.push("**Consensus Points:**");
          for (const cp of round.summary.consensusPoints) {
            sections.push(`- ${cp}`);
          }
          sections.push("");
        }
      } else {
        // No summary available — list proposal summaries
        if (round.proposals.length > 0) {
          sections.push("**Proposals:**");
          for (const proposal of round.proposals) {
            sections.push(`- ${proposal.summary}`);
          }
          sections.push("");
        }

        if (round.critiques.length > 0) {
          sections.push("**Critiques:**");
          for (const critique of round.critiques) {
            sections.push(`- ${critique.summary}`);
          }
          sections.push("");
        }

        if (round.revisions.length > 0) {
          sections.push("**Revisions:**");
          for (const revision of round.revisions) {
            sections.push(`- [${revision.stance}] ${revision.summary}`);
          }
          sections.push("");
        }
      }
    }
  }

  // Agent Agreement
  if (state.consensus) {
    sections.push("## Agent Agreement");
    sections.push("");

    if (state.consensus.agreements.length > 0) {
      sections.push("**Agreements:**");
      sections.push("");
      for (const agreement of state.consensus.agreements) {
        const supporters = agreement.supportingAgents
          .map((id) => AGENT_DISPLAY_NAMES[id] || id)
          .join(", ");
        sections.push(`- ${agreement.point} *(${supporters})*`);
        sections.push(`  - Reasoning: ${agreement.reasoning}`);
      }
      sections.push("");
    }

    if (state.consensus.disagreements.length > 0) {
      sections.push("**Disagreements:**");
      sections.push("");
      for (const disagreement of state.consensus.disagreements) {
        sections.push(`- ${disagreement.point}`);
        for (const position of disagreement.positions) {
          const name = AGENT_DISPLAY_NAMES[position.agentId] || position.agentId;
          sections.push(`  - ${name} (${position.stance}): ${position.reasoning}`);
        }
      }
      sections.push("");
    }

    if (state.consensus.openQuestions.length > 0) {
      sections.push("**Open Questions:**");
      sections.push("");
      for (const question of state.consensus.openQuestions) {
        sections.push(`- ${question}`);
      }
      sections.push("");
    }
  }

  // Agent Final Positions
  const agentsWithPositions = state.agents.filter((a) => a.currentPosition);
  if (agentsWithPositions.length > 0) {
    sections.push("## Agent Final Positions");
    sections.push("");

    for (const agent of agentsWithPositions) {
      sections.push(`### ${agent.displayName}`);
      sections.push("");
      sections.push(`- **Stance:** ${agent.currentStance || "N/A"}`);
      sections.push(`- **Confidence:** ${agent.confidence !== null ? `${(agent.confidence * 100).toFixed(0)}%` : "N/A"}`);
      sections.push(`- **Position:** ${agent.currentPosition}`);
      sections.push("");
    }
  }

  // Cost Summary
  sections.push("## Cost Summary");
  sections.push("");
  sections.push(formatTokenUsage(usage));
  sections.push("");

  const markdown = sections.join("\n");

  // Generate filename from title
  const sanitizedTitle = title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 50);
  const filename = `reposcope-report-${sanitizedTitle}-${new Date().toISOString().split("T")[0]}.md`;

  return { markdown, filename };
}
