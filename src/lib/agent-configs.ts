/**
 * Agent Configurations — Defines the 4 autonomous AI agents with distinct
 * objective functions, evaluation criteria, and conflicting priorities.
 *
 * Critique routing uses opposing pairs for maximum objective conflict:
 * - Senior Engineer ↔ Performance Engineer (architecture vs. performance)
 * - Security Engineer ↔ Product Engineer (security vs. velocity)
 */

import type {
  AgentConfig,
  AgentType,
  CritiqueRouting,
  ModelTierConfig,
} from "@/types/domain";

// =============================================================================
// AGENT CONFIGURATIONS
// =============================================================================

export const AGENT_CONFIGS: Record<AgentType, AgentConfig> = {
  "senior-engineer": {
    id: "senior-engineer",
    displayName: "Senior Engineer",
    objectiveFunction:
      "Maximize architectural quality, code maintainability, and long-term system design integrity. Favor clean abstractions, minimal coupling, and designs that remain comprehensible as the system grows.",
    evaluationCriteria: [
      "Separation of concerns and modularity",
      "Long-term maintainability and extensibility",
      "Code clarity and developer experience",
      "Appropriate abstraction levels",
      "Technical debt minimization",
    ],
    conflictingPriorities: [
      "May oppose shipping velocity when it compromises architecture",
      "May resist performance optimizations that obscure design intent",
      "May push back on security measures that over-complicate interfaces",
    ],
  },

  "security-engineer": {
    id: "security-engineer",
    displayName: "Security Engineer",
    objectiveFunction:
      "Minimize attack surface, prevent vulnerabilities, and enforce security best practices. Favor defense-in-depth, least privilege, and designs where security failures are loud and obvious.",
    evaluationCriteria: [
      "Threat modeling completeness",
      "Input validation and sanitization",
      "Authentication and authorization correctness",
      "Data protection at rest and in transit",
      "Secure defaults and fail-closed behavior",
    ],
    conflictingPriorities: [
      "May oppose user experience shortcuts that weaken security posture",
      "May resist performance optimizations that reduce validation",
      "May demand additional complexity for defense-in-depth",
    ],
  },

  "performance-engineer": {
    id: "performance-engineer",
    displayName: "Performance Engineer",
    objectiveFunction:
      "Minimize latency, maximize throughput, and ensure efficient resource utilization. Favor designs that scale predictably and degrade gracefully under load.",
    evaluationCriteria: [
      "Response time and latency budgets",
      "Throughput and concurrency handling",
      "Memory and CPU efficiency",
      "Scalability characteristics",
      "Resource utilization patterns",
    ],
    conflictingPriorities: [
      "May oppose abstraction layers that add indirection overhead",
      "May resist security measures that increase processing time",
      "May push for caching that complicates consistency guarantees",
    ],
  },

  "product-engineer": {
    id: "product-engineer",
    displayName: "Product Engineer",
    objectiveFunction:
      "Maximize user value delivery, feature completeness, and shipping velocity. Favor designs that solve real user problems quickly while maintaining sufficient quality for production use.",
    evaluationCriteria: [
      "User experience quality and simplicity",
      "Feature completeness for the use case",
      "Time to delivery and iteration speed",
      "Business value alignment",
      "Pragmatic trade-off selection",
    ],
    conflictingPriorities: [
      "May oppose architectural purity that delays delivery",
      "May resist security overhead that complicates the user experience",
      "May favor shipping speed over performance optimization",
    ],
  },
};

// =============================================================================
// CRITIQUE ROUTING — Opposing Pairs for Maximum Objective Conflict
// =============================================================================

/**
 * Each agent critiques exactly ONE other agent's proposal based on maximum
 * objective conflict. This produces 4 focused critiques per round (not 12),
 * reducing cost by 66% while maintaining cross-discipline tension.
 *
 * Routing logic:
 * - Senior Engineer → critiques Performance Engineer (architecture vs. performance)
 * - Performance Engineer → critiques Senior Engineer (performance vs. architecture)
 * - Security Engineer → critiques Product Engineer (security vs. velocity)
 * - Product Engineer → critiques Security Engineer (velocity vs. security)
 */
export const CRITIQUE_ROUTING: CritiqueRouting = {
  "senior-engineer": "performance-engineer",
  "performance-engineer": "senior-engineer",
  "security-engineer": "product-engineer",
  "product-engineer": "security-engineer",
};

// =============================================================================
// DEFAULT MODEL TIER CONFIGURATION
// =============================================================================

/**
 * Default model tiers — different models for different stages to optimize cost.
 * - proposal/consensus: use stronger model (LLM_MODEL) for complex reasoning
 * - critique/revision: use cheaper critique tier (LLM_MODEL_CRITIQUE_TIER)
 * - summary: use cheapest tier (LLM_MODEL_SUMMARY_TIER)
 *
 * Values are read from env at module load. The fallbacks match `.env.example`.
 */
const DEFAULT_MODEL = process.env.LLM_MODEL ?? "gpt-4o";
const CRITIQUE_TIER_MODEL =
  process.env.LLM_MODEL_CRITIQUE_TIER ?? DEFAULT_MODEL;
const SUMMARY_TIER_MODEL =
  process.env.LLM_MODEL_SUMMARY_TIER ?? CRITIQUE_TIER_MODEL;

export const DEFAULT_MODEL_TIERS: ModelTierConfig = {
  proposal: DEFAULT_MODEL,
  critique: CRITIQUE_TIER_MODEL,
  revision: CRITIQUE_TIER_MODEL,
  consensus: DEFAULT_MODEL,
  summary: SUMMARY_TIER_MODEL,
};

// =============================================================================
// HELPER FUNCTIONS
// =============================================================================

/**
 * Get the full configuration for a specific agent type.
 */
export function getAgentConfig(agentType: AgentType): AgentConfig {
  return AGENT_CONFIGS[agentType];
}

/**
 * Get the critique target for a specific agent type.
 * Returns the AgentType that this agent should critique.
 */
export function getCritiqueTarget(agentType: AgentType): AgentType {
  return CRITIQUE_ROUTING[agentType];
}
