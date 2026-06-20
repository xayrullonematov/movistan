/**
 * ConsensusOutput Zod Schema
 *
 * Defines the structured output schema for the Consensus Synthesis Stage.
 * Consensus is derived from the complete interaction history of proposals,
 * critiques, revisions, and agent stances within the current round.
 *
 * Requirements: 14.1, 14.5
 */

import { z } from "zod";
import {
  agentTypeSchema,
  artifactTypeSchema,
  severitySchema,
} from "./proposal-output";

// =============================================================================
// CONSENSUS OUTPUT SCHEMA
// =============================================================================

export const consensusOutputSchema = z.object({
  /**
   * Areas of agreement among agents.
   * Each entry includes an evidenceChain of event IDs that support the claim,
   * enabling the user to verify the agreement against specific debate events.
   */
  agreements: z.array(
    z.object({
      /** The point of agreement */
      point: z.string().min(1),
      /** Agents that support this agreement */
      supportingAgents: z.array(agentTypeSchema).min(1),
      /** Reasoning for why consensus was reached on this point */
      reasoning: z.string().min(1),
      /** Array of event IDs that reference specific events supporting this agreement */
      evidenceChain: z.array(z.string()),
    })
  ),

  /**
   * Areas of ongoing disagreement among agents.
   * Each entry includes an evidenceChain of event IDs that reference the
   * debate events where the disagreement is demonstrated.
   */
  disagreements: z.array(
    z.object({
      /** The point of disagreement */
      point: z.string().min(1),
      /** Positions held by different agents on this point */
      positions: z.array(
        z.object({
          /** The agent holding this position */
          agentId: agentTypeSchema,
          /** The agent's stance on the point */
          stance: z.string().min(1),
          /** Reasoning for the agent's position */
          reasoning: z.string().min(1),
        })
      ).min(1),
      /** Array of event IDs that reference specific events demonstrating this disagreement */
      evidenceChain: z.array(z.string()),
    })
  ),

  /** Recommended decisions derived from the consensus synthesis */
  recommendedDecisions: z.array(
    z.object({
      /** Title of the recommended decision */
      title: z.string().min(1),
      /** Description of what the decision entails */
      description: z.string().min(1),
      /** Confidence in this decision (0-1) */
      confidence: z.number().min(0).max(1),
    })
  ),

  /** Risks identified during the debate */
  identifiedRisks: z.array(
    z.object({
      /** Description of the risk */
      description: z.string().min(1),
      /** Severity level */
      severity: severitySchema,
      /** Agents that raised or identified this risk */
      raisedBy: z.array(agentTypeSchema).min(1),
    })
  ),

  /** Open questions that remain unresolved after the round */
  openQuestions: z.array(z.string()),

  /** Overall confidence in the consensus (0-1) */
  overallConfidence: z.number().min(0).max(1),

  /**
   * Artifact operations to execute based on consensus.
   * These drive automatic artifact creation, updates, acceptance, or rejection.
   * sourceEventId links back to the debate event that triggered this operation.
   */
  artifactOperations: z.array(
    z.object({
      /** The operation to perform on the artifact */
      operation: z.enum(["create", "update", "accept", "reject"]),
      /** ID of existing artifact (for update/accept/reject operations) */
      artifactId: z.string().optional(),
      /** Type of artifact (for create operations) */
      type: artifactTypeSchema.optional(),
      /** Title of the artifact */
      title: z.string().min(1),
      /** Content of the artifact (required for create/update; omit for accept/reject) */
      content: z.string().min(1).optional(),
      /** Reference to the event ID that triggered this operation */
      sourceEventId: z.string().optional(),
    })
  ),
});

// =============================================================================
// INFERRED TYPE
// =============================================================================

/** TypeScript type inferred from the Zod schema */
export type ConsensusOutputZ = z.infer<typeof consensusOutputSchema>;
