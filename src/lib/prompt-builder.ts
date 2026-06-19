/**
 * PromptBuilder — Assembles structured LLM prompts for each debate stage.
 *
 * Implements the PromptBuilder interface from @/types/domain.
 * Each method returns an LLMRequest with systemPrompt, userMessage,
 * and responseFormat: "json".
 */

import type {
  AgentConfig,
  CritiqueOutput,
  LLMRequest,
  PersistedEvent,
  ProposalOutput,
  PromptBuilder as IPromptBuilder,
  WorkspaceContext,
} from "@/types/domain";

import { CRITIQUE_ROUTING } from "@/lib/agent-configs";


// =============================================================================
// SCHEMA DESCRIPTIONS (included in prompts for LLM guidance)
// =============================================================================

const PROPOSAL_SCHEMA_DESC = `{
  "summary": "string (your proposal summary)",
  "recommendations": ["string (specific recommendations)"],
  "risks": [{"description": "string", "severity": "high|medium|low", "mitigation": "string (optional)"}],
  "assumptions": ["string (assumptions you are making)"],
  "confidence": number (0-1),
  "artifactSuggestions": [{"type": "decision|risk|assumption|tradeoff|open-question|recommendation", "title": "string", "content": "string"}],
  "references": [{"agentId": "string (optional)", "artifactId": "string (optional)", "description": "string"}],
  "needsClarification": boolean,
  "clarificationQuestions": ["string (optional, if needsClarification is true)"]
}`;


const CRITIQUE_SCHEMA_DESC = `{
  "summary": "string (critique summary)",
  "targetAgentId": "senior-engineer|security-engineer|performance-engineer|product-engineer",
  "objections": [{"point": "string", "reasoning": "string", "severity": "critical|major|minor"}],
  "acknowledgedStrengths": ["string"],
  "confidence": number (0-1),
  "riskAssessments": [{"description": "string", "severity": "high|medium|low"}],
  "artifactSuggestions": [{"type": "decision|risk|assumption|tradeoff|open-question|recommendation", "title": "string", "content": "string"}],
  "references": [{"agentId": "string (optional)", "artifactId": "string (optional)", "description": "string"}],
  "needsClarification": boolean,
  "clarificationQuestions": ["string (optional)"]
}`;


const REVISION_SCHEMA_DESC = `{
  "summary": "string (revised position summary)",
  "stance": "agree|disagree|partially-concede|strengthen",
  "concededPoints": [{"point": "string", "reasoning": "string"}],
  "maintainedPoints": [{"point": "string", "reasoning": "string"}],
  "newArguments": ["string"],
  "confidence": number (0-1),
  "artifactSuggestions": [{"type": "decision|risk|assumption|tradeoff|open-question|recommendation", "title": "string", "content": "string"}],
  "needsClarification": boolean,
  "clarificationQuestions": ["string (optional)"]
}`;

const CONSENSUS_SCHEMA_DESC = `{
  "agreements": [{"point": "string", "supportingAgents": ["agent-id"], "reasoning": "string", "evidenceChain": ["event-id"]}],
  "disagreements": [{"point": "string", "positions": [{"agentId": "agent-id", "stance": "string", "reasoning": "string"}], "evidenceChain": ["event-id"]}],
  "recommendedDecisions": [{"title": "string", "description": "string", "confidence": number}],
  "identifiedRisks": [{"description": "string", "severity": "high|medium|low", "raisedBy": ["agent-id"]}],
  "openQuestions": ["string"],
  "overallConfidence": number (0-1),
  "artifactOperations": [{"operation": "create|update|accept|reject", "artifactId": "string (optional)", "type": "string (optional)", "title": "string", "content": "string", "sourceEventId": "string (optional)"}]
}`;


const JSON_ONLY_INSTRUCTION =
  "Return ONLY valid JSON matching the schema above. No markdown fences, no explanatory text.";

// =============================================================================
// AGENT ROLE BLOCK (cacheable prefix)
//
// This produces the portion of the system prompt that is IDENTICAL across all
// stages (proposal, critique, revision) for a given agent. The Bedrock provider
// places a cachePoint immediately after it, so the per-agent role caches once
// per session and is read at ~10% input cost across every subsequent agent call.
// Stage-specific tails (schema descriptions, stance options, etc.) come after.
// =============================================================================

function buildAgentRoleBlock(agent: AgentConfig): string {
  const parts: string[] = [
    `You are ${agent.displayName}.`,
    ``,
    `## Your Objective Function`,
    agent.objectiveFunction,
    ``,
    `## Your Evaluation Criteria`,
    agent.evaluationCriteria.map((c) => `- ${c}`).join("\n"),
  ];
  if (agent.reasoningPatterns && agent.reasoningPatterns.length > 0) {
    parts.push(
      ``,
      `## How You Reason`,
      agent.reasoningPatterns.map((p) => `- ${p}`).join("\n")
    );
  }
  if (agent.pitfallsToAvoid && agent.pitfallsToAvoid.length > 0) {
    parts.push(
      ``,
      `## Pitfalls You Actively Guard Against`,
      agent.pitfallsToAvoid.map((p) => `- ${p}`).join("\n")
    );
  }
  if (agent.conflictingPriorities && agent.conflictingPriorities.length > 0) {
    parts.push(
      ``,
      `## Conflicts With Other Disciplines (these tensions are expected and useful)`,
      agent.conflictingPriorities.map((p) => `- ${p}`).join("\n")
    );
  }
  return parts.join("\n");
}

/**
 * Common preamble applied to every agent's stable block. Identical across
 * agents and stages, which means it caches at Bedrock once per session
 * regardless of which agent fires. It also sets the operating principles
 * for the debate — substantive prompt engineering, not filler.
 */
const ENGINEERING_ROOM_PREAMBLE = [
  `# AI Engineering Room — Operating Principles`,
  ``,
  `You are one of four autonomous AI engineers participating in a structured`,
  `engineering debate. The other three are: Senior Engineer (architecture),`,
  `Security Engineer (threat model and defenses), Performance Engineer`,
  `(latency, throughput, scale), and Product Engineer (user value and`,
  `delivery velocity). Whichever of these you are, the other three are your`,
  `peers. Their objectives partially conflict with yours by design — that`,
  `tension is the point. A round consists of four stages:`,
  ``,
  `1. **Proposal** — each agent independently produces a proposal answering`,
  `   the problem, using their own discipline's framing. Proposals must be`,
  `   structured (no prose-only output) and include concrete recommendations,`,
  `   risks, assumptions, and suggested artifacts (decisions, tradeoffs,`,
  `   open questions, etc.).`,
  `2. **Critique** — each agent critiques exactly one opposing-pair peer's`,
  `   proposal. Critiques are not personal; they are an honest application`,
  `   of your discipline's evaluation criteria to a peer's design.`,
  `3. **Revision** — each agent revises in light of critiques received,`,
  `   choosing a stance: agree, disagree, partially-concede, or strengthen.`,
  `4. **Consensus** — a synthesizer reads the full round and produces`,
  `   agreements (with supporting agents and evidence chains), disagreements`,
  `   (with positions and evidence), and recommended decisions.`,
  ``,
  `## How to be useful here`,
  ``,
  `- Argue from your discipline's objective function, not from politeness.`,
  `  A weak critique that everyone agrees with wastes a round; a sharp,`,
  `  specific critique grounded in your criteria advances the design.`,
  `- Cite the specific decision, line of reasoning, or assumption you are`,
  `  responding to — never make global statements like "this is bad". Make`,
  `  surgical statements like "the choice of X over Y will fail under Z".`,
  `- If the proposal genuinely lacks the information you need to evaluate`,
  `  it, set needsClarification=true with concrete, decision-blocking`,
  `  questions. Do NOT use clarification as a way to avoid taking a position.`,
  `- Confidence is a calibration signal, not a self-assessment. Use lower`,
  `  confidence when you are reasoning under uncertainty; use higher`,
  `  confidence when your discipline's frame is dispositive.`,
  `- Brevity in the right places. Summaries should be tight. Reasoning fields`,
  `  should be specific and concrete. Artifact content should be substantive`,
  `  but no longer than the decision warrants.`,
  ``,
  `## Output discipline`,
  ``,
  `- You will be given a JSON schema for the current stage. Return ONLY`,
  `  valid JSON matching that schema. No markdown fences, no preamble, no`,
  `  closing remarks. The system parses your response with strict schema`,
  `  validation and will re-prompt on failure.`,
  `- When the schema asks for an array, it is fine for that array to be`,
  `  empty if your discipline genuinely has nothing to add. Do not pad.`,
  `- When the schema asks for confidence as a number 0–1, calibrate honestly:`,
  `  • 0.9+ means: this conclusion follows from your discipline's frame and`,
  `    you would defend it under hostile critique.`,
  `  • 0.6–0.8 means: this is your best read, and another competent engineer`,
  `    in your discipline might reasonably disagree.`,
  `  • Below 0.6 means: you are reasoning under real uncertainty; flag the`,
  `    information that would move the number.`,
  ``,
  `## How to write good artifact suggestions`,
  ``,
  `When the schema lets you suggest artifacts (decision / risk / assumption /`,
  `tradeoff / open-question / recommendation), each one is a concrete piece`,
  `of the engineering record:`,
  ``,
  `- **Decision** — a choice that the team will commit to and design around.`,
  `  Title is the choice ("Use X over Y for Z"). Content explains the choice,`,
  `  the alternatives considered, and the reasoning. A decision artifact is`,
  `  not a brainstorm — name the option you would pick.`,
  `- **Tradeoff** — a place where two desirable properties cannot both be`,
  `  maximized; describe both sides and the dimension along which the choice`,
  `  is being made. Tradeoffs are not "this has pros and cons" — they are`,
  `  "we gave up X to get Y, and here is why we made that exchange".`,
  `- **Risk** — a specific bad outcome with a description, a severity, and`,
  `  ideally a mitigation. Risks are not generic ("could fail"); they are`,
  `  specific ("Redis cluster split-brain during failover loses last 500ms`,
  `  of counters, allowing burst overage"). Vague risks waste a round.`,
  `- **Assumption** — something you are taking as given for this proposal`,
  `  that would invalidate the proposal if false. Call them out so future`,
  `  rounds can challenge them.`,
  `- **Open question** — a decision you cannot make from inside the round;`,
  `  the user or a future round will resolve it. Frame it so a yes/no or a`,
  `  short answer unblocks the design.`,
  `- **Recommendation** — a concrete suggestion shorter than a decision`,
  `  (e.g. "use library X", "follow IETF RateLimit header standard"). Less`,
  `  load-bearing than a decision but more directional than an opinion.`,
  ``,
  `Titles dedupe at the (session, type, title) level. If you and another`,
  `agent both propose effectively the same decision, prefer using the same`,
  `or substantively-overlapping title — that lets the workspace merge`,
  `versions rather than fragment into near-duplicates.`,
  ``,
  `## How to give evidence (in stages that ask for it)`,
  ``,
  `When the schema asks for evidenceChain or references, link to specific`,
  `events by their id (the system provides ids for every event). A claim`,
  `with a real event id is verifiable; a claim without one will be treated`,
  `as unsupported in consensus synthesis.`,
].join("\n");

/**
 * Stable cacheable prefix: engineering-room preamble + agent role +
 * session-static problem + constraints. Identical for a given (agent,
 * session) across every stage and every retry, which is exactly what
 * Bedrock prompt caching needs to hit.
 */
function buildStableSystemBlock(
  agent: AgentConfig,
  context: WorkspaceContext
): string {
  return [
    ENGINEERING_ROOM_PREAMBLE,
    ``,
    `---`,
    ``,
    buildAgentRoleBlock(agent),
    ``,
    `## Problem Description (constant for this session)`,
    context.problemDescription,
    ``,
    `## Active Constraints (constant for this session)`,
    formatConstraints(context.constraints),
  ].join("\n");
}

// =============================================================================
// HELPER FUNCTIONS
// =============================================================================

function formatConstraints(constraints: WorkspaceContext["constraints"]): string {
  if (constraints.length === 0) return "None";
  return constraints
    .map((c) => `- [${c.category}] ${c.text}`)
    .join("\n");
}

function formatRoundSummaries(
  summaries: WorkspaceContext["roundSummaries"]
): string {
  if (summaries.length === 0) return "No prior rounds.";
  return summaries
    .map(
      (s) =>
        `Round ${s.roundNumber}:\n` +
        `  Proposals: ${s.keyProposals.join("; ")}\n` +
        `  Critiques: ${s.majorCritiques.join("; ")}\n` +
        `  Outcomes: ${s.revisionOutcomes.join("; ")}\n` +
        `  Consensus: ${s.consensusPoints.join("; ")}`
    )
    .join("\n\n");
}


function formatArtifacts(
  artifacts: WorkspaceContext["artifactSummaries"]
): string {
  if (artifacts.length === 0) return "No artifacts yet.";
  return artifacts
    .map(
      (a) =>
        `- [${a.type}] "${a.title}" (${a.status}, v${a.version}): ${a.content.slice(0, 200)}`
    )
    .join("\n");
}

function formatEvents(events: PersistedEvent[]): string {
  if (events.length === 0) return "No events in current round.";
  return events
    .map(
      (e) =>
        `[${e.id}] ${e.type} (agent: ${e.agentId ?? "system"}, stage: ${e.stage ?? "n/a"})`
    )
    .join("\n");
}


// =============================================================================
// PROMPT BUILDER IMPLEMENTATION
// =============================================================================

export class PromptBuilderImpl implements IPromptBuilder {
  /**
   * Builds a proposal prompt for a specific agent.
   */
  buildProposalPrompt(
    agent: AgentConfig,
    context: WorkspaceContext
  ): LLMRequest {
    const systemPromptStable = buildStableSystemBlock(agent, context);
    const systemPromptStageSpecific = [
      `## Output Schema (this stage: PROPOSAL)`,
      PROPOSAL_SCHEMA_DESC,
      ``,
      JSON_ONLY_INSTRUCTION,
    ].join("\n");
    const systemPrompt = systemPromptStable + "\n\n" + systemPromptStageSpecific;

    const userMessage = [
      `## Workspace Summary`,
      context.workspaceSummary || "Empty workspace.",
      ``,
      `## Current Artifacts`,
      formatArtifacts(context.artifactSummaries),
      ``,
      `## Prior Round Summaries`,
      formatRoundSummaries(context.roundSummaries),
      ``,
      `## Task`,
      `Generate your proposal for solving this engineering problem.`,
    ].join("\n");

    return {
      systemPrompt,
      systemPromptStable,
      systemPromptStageSpecific,
      userMessage,
      responseFormat: "json",
    };
  }


  /**
   * Builds a critique prompt for a specific agent.
   * Uses CRITIQUE_ROUTING to determine which proposal to critique.
   */
  buildCritiquePrompt(
    agent: AgentConfig,
    proposals: ProposalOutput[],
    context: WorkspaceContext
  ): LLMRequest {
    const targetAgentId = CRITIQUE_ROUTING[agent.id];

    // Find the target's proposal from the current round events
    const targetProposal = this.findTargetProposal(
      targetAgentId,
      proposals,
      context
    );

    const systemPromptStable = buildStableSystemBlock(agent, context);
    const systemPromptStageSpecific = [
      `## Target Proposal to Critique`,
      `You are critiquing the proposal from: ${targetAgentId}`,
      `Set "targetAgentId" to "${targetAgentId}" in your response.`,
      ``,
      `## Target's Proposal`,
      targetProposal
        ? JSON.stringify(targetProposal, null, 2)
        : "No proposal found for target agent.",
      ``,
      `## Output Schema`,
      CRITIQUE_SCHEMA_DESC,
      ``,
      JSON_ONLY_INSTRUCTION,
    ].join("\n");
    const systemPrompt = systemPromptStable + "\n\n" + systemPromptStageSpecific;

    const userMessage = [
      `## All Proposals This Round`,
      JSON.stringify(proposals, null, 2),
      ``,
      `## Workspace Summary`,
      context.workspaceSummary || "Empty workspace.",
      ``,
      `## Current Artifacts`,
      formatArtifacts(context.artifactSummaries),
      ``,
      `## Task`,
      `Critique the proposal from ${targetAgentId} based on your`,
      `objective function and evaluation criteria.`,
    ].join("\n");

    return {
      systemPrompt,
      systemPromptStable,
      systemPromptStageSpecific,
      userMessage,
      responseFormat: "json",
    };
  }


  /**
   * Builds a revision prompt for a specific agent.
   * Only includes critiques targeted at this agent.
   */
  buildRevisionPrompt(
    agent: AgentConfig,
    critiques: CritiqueOutput[],
    context: WorkspaceContext
  ): LLMRequest {
    // Filter to only critiques targeting this agent
    const relevantCritiques = critiques.filter(
      (c) => c.targetAgentId === agent.id
    );

    // Find this agent's original proposal from current round events
    const originalProposal = this.findOwnProposal(agent.id, context);

    const systemPromptStable = buildStableSystemBlock(agent, context);
    const systemPromptStageSpecific = [
      `## Stance Options`,
      `- "agree": You fully accept the critique and change your position`,
      `- "disagree": You reject the critique and maintain your position`,
      `- "partially-concede": You accept some points but not all`,
      `  (MUST include at least one entry in concededPoints)`,
      `- "strengthen": You use the critique to reinforce your position`,
      ``,
      `## Output Schema`,
      REVISION_SCHEMA_DESC,
      ``,
      JSON_ONLY_INSTRUCTION,
    ].join("\n");
    const systemPrompt = systemPromptStable + "\n\n" + systemPromptStageSpecific;

    const userMessage = [
      `## Your Original Proposal`,
      originalProposal
        ? JSON.stringify(originalProposal, null, 2)
        : "Original proposal not found in context.",
      ``,
      `## Critiques Directed At You`,
      relevantCritiques.length > 0
        ? JSON.stringify(relevantCritiques, null, 2)
        : "No critiques directed at you this round.",
      ``,
      `## Task`,
      `Revise your position based on the critiques received.`,
    ].join("\n");

    return {
      systemPrompt,
      systemPromptStable,
      systemPromptStageSpecific,
      userMessage,
      responseFormat: "json",
    };
  }


  /**
   * Builds a consensus synthesis prompt.
   * Includes all round events and workspace context.
   */
  buildConsensusPrompt(
    roundEvents: PersistedEvent[],
    context: WorkspaceContext
  ): LLMRequest {
    const systemPrompt = [
      `You are the Consensus Synthesizer.`,
      ``,
      `## Role`,
      `Analyze all proposals, critiques, and revisions from the current`,
      `round to synthesize areas of agreement and disagreement.`,
      ``,
      `## Important`,
      `- Include event IDs in evidenceChain arrays to link back to source events`,
      `- Identify all areas of agreement and disagreement`,
      `- Recommend concrete decisions based on the debate`,
      `- Flag identified risks with the agents who raised them`,
      `- List any open questions that remain unresolved`,
      ``,
      `## Output Schema`,
      CONSENSUS_SCHEMA_DESC,
      ``,
      JSON_ONLY_INSTRUCTION,
    ].join("\n");

    const userMessage = [
      `## Round Events (proposals, critiques, revisions)`,
      formatEvents(roundEvents),
      ``,
      `## Full Event Details`,
      JSON.stringify(
        roundEvents.map((e) => ({
          id: e.id,
          type: e.type,
          agentId: e.agentId,
          content: safeParseContent(e.content),
        })),
        null,
        2
      ),
      ``,
      `## Problem Description`,
      context.problemDescription,
      ``,
      `## Active Constraints`,
      formatConstraints(context.constraints),
      ``,
      `## Workspace Summary`,
      context.workspaceSummary || "Empty workspace.",
      ``,
      `## Current Artifacts`,
      formatArtifacts(context.artifactSummaries),
      ``,
      `## Task`,
      `Synthesize the consensus from this round's debate.`,
    ].join("\n");

    return { systemPrompt, userMessage, responseFormat: "json" };
  }


  // ===========================================================================
  // PRIVATE HELPERS
  // ===========================================================================

  /**
   * Finds the target agent's proposal from the proposals array.
   * Falls back to searching current round events in the context.
   */
  private findTargetProposal(
    targetAgentId: string,
    proposals: ProposalOutput[],
    context: WorkspaceContext
  ): ProposalOutput | null {
    // Proposals array passed directly — find by matching round events
    // Since ProposalOutput doesn't have agentId, we look in events
    const proposalEvents = context.currentRoundEvents.filter(
      (e) => e.type === "proposal" && e.agentId === targetAgentId
    );

    if (proposalEvents.length > 0) {
      try {
        return JSON.parse(proposalEvents[0].content) as ProposalOutput;
      } catch {
        // Fall through
      }
    }

    // If we have proposals but can't match by agent, return first one
    // (this case shouldn't happen with proper event tracking)
    return proposals.length > 0 ? proposals[0] : null;
  }

  /**
   * Finds this agent's own proposal from the current round events.
   */
  private findOwnProposal(
    agentId: string,
    context: WorkspaceContext
  ): ProposalOutput | null {
    const proposalEvent = context.currentRoundEvents.find(
      (e) => e.type === "proposal" && e.agentId === agentId
    );

    if (proposalEvent) {
      try {
        return JSON.parse(proposalEvent.content) as ProposalOutput;
      } catch {
        return null;
      }
    }

    return null;
  }
}


// =============================================================================
// UTILITY
// =============================================================================

/**
 * Safely parses JSON content string, returning parsed object or raw string.
 */
function safeParseContent(content: string): unknown {
  try {
    return JSON.parse(content);
  } catch {
    return content;
  }
}
