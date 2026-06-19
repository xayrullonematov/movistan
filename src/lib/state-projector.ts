import type {
  AgentConfig,
  AgentState,
  AgentType,
  ArtifactState,
  ArtifactStatus,
  Constraint,
  ConsensusOutput,
  CritiqueOutput,
  PersistedEvent,
  ProposalOutput,
  RevisionOutput,
  RoundState,
  SessionState,
  SessionTokenUsage,
  Stance,
} from "@/types/domain";

// =============================================================================
// AGENT CONFIGURATIONS (hardcoded to avoid circular deps)
// =============================================================================

const AGENT_CONFIGS: Record<
  AgentType,
  Pick<AgentConfig, "id" | "displayName" | "objectiveFunction">
> = {
  "senior-engineer": {
    id: "senior-engineer",
    displayName: "Senior Engineer",
    objectiveFunction:
      "Maximize architectural quality, code maintainability, and long-term system design integrity.",
  },
  "security-engineer": {
    id: "security-engineer",
    displayName: "Security Engineer",
    objectiveFunction:
      "Minimize attack surface, prevent vulnerabilities, enforce security best practices.",
  },
  "performance-engineer": {
    id: "performance-engineer",
    displayName: "Performance Engineer",
    objectiveFunction:
      "Minimize latency, maximize throughput, ensure efficient resource utilization.",
  },
  "product-engineer": {
    id: "product-engineer",
    displayName: "Product Engineer",
    objectiveFunction:
      "Maximize user value delivery, feature completeness, and shipping velocity.",
  },
};



const ALL_AGENTS: AgentType[] = [
  "senior-engineer",
  "security-engineer",
  "performance-engineer",
  "product-engineer",
];

// =============================================================================
// INITIAL STATE FACTORY
// =============================================================================

function createInitialTokenUsage(): SessionTokenUsage {
  return {
    totalInputTokens: 0,
    totalOutputTokens: 0,
    byRound: {},
    byAgent: {
      "senior-engineer": { input: 0, output: 0 },
      "security-engineer": { input: 0, output: 0 },
      "performance-engineer": { input: 0, output: 0 },
      "product-engineer": { input: 0, output: 0 },
    },
    estimatedCostUsd: 0,
  };
}

function createInitialAgents(): AgentState[] {
  return ALL_AGENTS.map((id) => ({
    id,
    displayName: AGENT_CONFIGS[id].displayName,
    objectiveFunction: AGENT_CONFIGS[id].objectiveFunction,
    currentPosition: null,
    currentStance: null,
    confidence: null,
    hasCompletedCurrentStage: false,
  }));
}

function createEmptySessionState(): SessionState {
  return {
    id: "",
    problemDescription: "",
    status: "active",
    currentRound: 0,
    currentStage: null,
    constraints: [],
    agents: createInitialAgents(),
    rounds: [],
    artifacts: [],
    consensus: null,
    tokenUsage: createInitialTokenUsage(),
  };
}



// =============================================================================
// EVENT HANDLERS
// =============================================================================

function handleSessionCreated(
  state: SessionState,
  content: Record<string, unknown>,
  event: PersistedEvent
): SessionState {
  return {
    ...state,
    id: (content.sessionId as string) || event.sessionId,
    problemDescription: (content.problemDescription as string) || "",
    status: "active",
    agents: createInitialAgents(),
  };
}

function handleRoundStarted(
  state: SessionState,
  content: Record<string, unknown>
): SessionState {
  const newRound = (content.round as number) ?? state.currentRound + 1;
  const newRoundState: RoundState = {
    number: newRound,
    proposals: [],
    critiques: [],
    revisions: [],
    consensus: null,
    summary: null,
  };

  // Reset agent completion status for new round
  const agents = state.agents.map((agent) => ({
    ...agent,
    hasCompletedCurrentStage: false,
  }));

  return {
    ...state,
    currentRound: newRound,
    currentStage: "proposal",
    rounds: [...state.rounds, newRoundState],
    agents,
  };
}

function handleRoundCompleted(state: SessionState): SessionState {
  return {
    ...state,
    status: "active",
    currentStage: "awaiting-intervention",
    agents: state.agents.map((agent) => ({
      ...agent,
      hasCompletedCurrentStage: false,
    })),
  };
}



function handleProposal(
  state: SessionState,
  content: Record<string, unknown>,
  event: PersistedEvent
): SessionState {
  const proposalOutput = content as unknown as ProposalOutput;
  const currentRoundIndex = state.rounds.length - 1;

  if (currentRoundIndex < 0) return state;

  const updatedRounds = [...state.rounds];
  updatedRounds[currentRoundIndex] = {
    ...updatedRounds[currentRoundIndex],
    proposals: [...updatedRounds[currentRoundIndex].proposals, proposalOutput],
  };

  const agents = state.agents.map((agent) => {
    if (agent.id === event.agentId) {
      return {
        ...agent,
        hasCompletedCurrentStage: true,
        currentPosition: proposalOutput.summary || agent.currentPosition,
        confidence: proposalOutput.confidence ?? agent.confidence,
      };
    }
    return agent;
  });

  return {
    ...state,
    rounds: updatedRounds,
    agents,
  };
}

function handleCritique(
  state: SessionState,
  content: Record<string, unknown>,
  event: PersistedEvent
): SessionState {
  const critiqueOutput = content as unknown as CritiqueOutput;
  const currentRoundIndex = state.rounds.length - 1;

  if (currentRoundIndex < 0) return state;

  const updatedRounds = [...state.rounds];
  updatedRounds[currentRoundIndex] = {
    ...updatedRounds[currentRoundIndex],
    critiques: [...updatedRounds[currentRoundIndex].critiques, critiqueOutput],
  };

  const agents = state.agents.map((agent) => {
    if (agent.id === event.agentId) {
      return {
        ...agent,
        hasCompletedCurrentStage: true,
        confidence: critiqueOutput.confidence ?? agent.confidence,
      };
    }
    return agent;
  });

  return {
    ...state,
    rounds: updatedRounds,
    agents,
  };
}



function handleRevision(
  state: SessionState,
  content: Record<string, unknown>,
  event: PersistedEvent
): SessionState {
  const revisionOutput = content as unknown as RevisionOutput;
  const currentRoundIndex = state.rounds.length - 1;

  if (currentRoundIndex < 0) return state;

  const updatedRounds = [...state.rounds];
  updatedRounds[currentRoundIndex] = {
    ...updatedRounds[currentRoundIndex],
    revisions: [...updatedRounds[currentRoundIndex].revisions, revisionOutput],
  };

  const agents = state.agents.map((agent) => {
    if (agent.id === event.agentId) {
      return {
        ...agent,
        hasCompletedCurrentStage: true,
        currentStance: revisionOutput.stance as Stance,
        confidence: revisionOutput.confidence ?? agent.confidence,
        currentPosition: revisionOutput.summary || agent.currentPosition,
      };
    }
    return agent;
  });

  return {
    ...state,
    rounds: updatedRounds,
    agents,
  };
}

function handleUserIntervention(
  state: SessionState,
  content: Record<string, unknown>,
  event: PersistedEvent
): SessionState {
  const constraint: Constraint = {
    id: (content.id as string) || "",
    text: (content.text as string) || (content.constraint as string) || "",
    category: (content.category as string) || "general",
    createdAt: (content.createdAt as string) || event.timestamp,
  };

  return {
    ...state,
    constraints: [...state.constraints, constraint],
  };
}



function handleConsensusUpdate(
  state: SessionState,
  content: Record<string, unknown>
): SessionState {
  const consensusOutput = content as unknown as ConsensusOutput;
  const currentRoundIndex = state.rounds.length - 1;

  if (currentRoundIndex < 0) {
    return { ...state, consensus: consensusOutput };
  }

  const updatedRounds = [...state.rounds];
  updatedRounds[currentRoundIndex] = {
    ...updatedRounds[currentRoundIndex],
    consensus: consensusOutput,
  };

  return {
    ...state,
    rounds: updatedRounds,
    consensus: consensusOutput,
  };
}

function handleClarificationRequest(state: SessionState): SessionState {
  return {
    ...state,
    status: "paused",
  };
}

function handleArtifactCreated(
  state: SessionState,
  content: Record<string, unknown>
): SessionState {
  const artifact: ArtifactState = {
    id: (content.id as string) || "",
    type: (content.type as ArtifactState["type"]) || "decision",
    title: (content.title as string) || "",
    content: (content.content as string) || "",
    status: (content.status as ArtifactStatus) || "draft",
    createdByAgentId: (content.createdByAgentId as AgentType) || null,
    version: 1,
    contributors: content.createdByAgentId
      ? [content.createdByAgentId as AgentType]
      : [],
  };

  return {
    ...state,
    artifacts: [...state.artifacts, artifact],
  };
}



function handleArtifactUpdated(
  state: SessionState,
  content: Record<string, unknown>
): SessionState {
  const artifactId = (content.artifactId as string) || (content.id as string);
  const newContent = content.content as string | undefined;
  const newVersion = content.version as number | undefined;
  const agentId = content.agentId as AgentType | undefined;

  const artifacts = state.artifacts.map((artifact) => {
    if (artifact.id === artifactId) {
      const updatedContributors =
        agentId && !artifact.contributors.includes(agentId)
          ? [...artifact.contributors, agentId]
          : artifact.contributors;

      return {
        ...artifact,
        content: newContent ?? artifact.content,
        version: newVersion ?? artifact.version + 1,
        contributors: updatedContributors,
      };
    }
    return artifact;
  });

  return {
    ...state,
    artifacts,
  };
}

function handleArtifactStatusChanged(
  state: SessionState,
  content: Record<string, unknown>
): SessionState {
  const artifactId = (content.artifactId as string) || (content.id as string);
  const newStatus = content.status as ArtifactStatus | undefined;

  const artifacts = state.artifacts.map((artifact) => {
    if (artifact.id === artifactId) {
      return {
        ...artifact,
        status: newStatus ?? artifact.status,
      };
    }
    return artifact;
  });

  return {
    ...state,
    artifacts,
  };
}

function handleStageProgress(
  state: SessionState,
  content: Record<string, unknown>,
  event: PersistedEvent
): SessionState {
  const agentId = (content.agentId as AgentType) || event.agentId;

  if (!agentId) return state;

  const agents = state.agents.map((agent) => {
    if (agent.id === agentId) {
      return {
        ...agent,
        hasCompletedCurrentStage: true,
      };
    }
    return agent;
  });

  return {
    ...state,
    agents,
  };
}



// =============================================================================
// STATE PROJECTOR — PUBLIC FUNCTIONS
// =============================================================================

/**
 * Projects a complete SessionState from a sequence of persisted events.
 * This is a PURE function — no side effects, no DB calls.
 *
 * Folds all events into a SessionState by applying each event's handler
 * in sequence. Handles all 13 event types defined in the domain.
 */
export function projectSessionState(events: PersistedEvent[]): SessionState {
  return events.reduce((state: SessionState, event: PersistedEvent) => {
    // Parse event content from JSON string
    let content: Record<string, unknown> = {};
    try {
      content = JSON.parse(event.content) as Record<string, unknown>;
    } catch {
      // If content is not valid JSON, use empty object
      content = {};
    }

    switch (event.type) {
      case "session-created":
        return handleSessionCreated(state, content, event);
      case "round-started":
        return handleRoundStarted(state, content);
      case "round-completed":
        return handleRoundCompleted(state);
      case "proposal":
        return handleProposal(state, content, event);
      case "critique":
        return handleCritique(state, content, event);
      case "revision":
        return handleRevision(state, content, event);
      case "user-intervention":
        return handleUserIntervention(state, content, event);
      case "consensus-update":
        return handleConsensusUpdate(state, content);
      case "clarification-request":
        return handleClarificationRequest(state);
      case "artifact-created":
        return handleArtifactCreated(state, content);
      case "artifact-updated":
        return handleArtifactUpdated(state, content);
      case "artifact-status-changed":
        return handleArtifactStatusChanged(state, content);
      case "stage-progress":
        return handleStageProgress(state, content, event);
      default:
        return state;
    }
  }, createEmptySessionState());
}

/**
 * Projects state from only the first `index` events.
 * Useful for event replay — step through history one event at a time.
 *
 * This is a PURE function — simply slices the events and delegates
 * to projectSessionState.
 */
export function projectStateAtIndex(
  events: PersistedEvent[],
  index: number
): SessionState {
  return projectSessionState(events.slice(0, index));
}

/**
 * Applies a sequence of events onto an existing base state.
 * Used by the SnapshotManager to reconstruct state from a snapshot
 * plus incremental events (O(k) instead of O(n) full replay).
 *
 * This is a PURE function — folds events onto the provided base state
 * using the same event handlers as projectSessionState.
 */
export function applyEvents(
  baseState: SessionState,
  events: PersistedEvent[]
): SessionState {
  return events.reduce((state: SessionState, event: PersistedEvent) => {
    let content: Record<string, unknown> = {};
    try {
      content = JSON.parse(event.content) as Record<string, unknown>;
    } catch {
      content = {};
    }

    switch (event.type) {
      case "session-created":
        return handleSessionCreated(state, content, event);
      case "round-started":
        return handleRoundStarted(state, content);
      case "round-completed":
        return handleRoundCompleted(state);
      case "proposal":
        return handleProposal(state, content, event);
      case "critique":
        return handleCritique(state, content, event);
      case "revision":
        return handleRevision(state, content, event);
      case "user-intervention":
        return handleUserIntervention(state, content, event);
      case "consensus-update":
        return handleConsensusUpdate(state, content);
      case "clarification-request":
        return handleClarificationRequest(state);
      case "artifact-created":
        return handleArtifactCreated(state, content);
      case "artifact-updated":
        return handleArtifactUpdated(state, content);
      case "artifact-status-changed":
        return handleArtifactStatusChanged(state, content);
      case "stage-progress":
        return handleStageProgress(state, content, event);
      default:
        return state;
    }
  }, baseState);
}