/**
 * AI Engineering Room - Domain Types
 *
 * Complete type definitions for the event-sourced, multi-agent engineering
 * collaboration platform. All types correspond to the design document.
 */

// =============================================================================
// CORE ENUMS
// =============================================================================

/** The four autonomous AI agents with distinct objective functions */
export type AgentType =
  | "senior-engineer"
  | "security-engineer"
  | "performance-engineer"
  | "product-engineer";

/** All 13 event types persisted in the event log */
export type EventType =
  | "session-created"
  | "round-started"
  | "round-completed"
  | "proposal"
  | "critique"
  | "revision"
  | "user-intervention"
  | "consensus-update"
  | "clarification-request"
  | "artifact-created"
  | "artifact-updated"
  | "artifact-status-changed"
  | "stage-progress";

/** Round stages in sequential execution order */
export type RoundStage =
  | "proposal"
  | "critique"
  | "revision"
  | "consensus"
  | "awaiting-intervention";

/** Agent stance during revision (how they respond to critiques) */
export type Stance = "agree" | "disagree" | "partially-concede" | "strengthen";

/** Types of engineering artifacts produced collaboratively */
export type ArtifactType =
  | "decision"
  | "risk"
  | "assumption"
  | "tradeoff"
  | "open-question"
  | "recommendation";

/** Lifecycle states for artifacts */
export type ArtifactStatus = "draft" | "accepted" | "rejected";

/**
 * clarificationPolicy controls whether agents can pause a round for clarification.
 * - "allow"    — default, pause on any clarification request
 * - "suppress" — ignore all clarification requests, never pause
 * - number     — max questions allowed per stage before suppressing the rest
 */
export type ClarificationPolicy = "allow" | "suppress" | number;

/** Session-level configuration stored as JSON in the Session.config column */
export interface SessionConfig {
  clarificationPolicy?: ClarificationPolicy;
  /**
   * Optional GitHub repository to ground the proposal stage in. Parsed from
   * the user-supplied URL by `parseGithubUrl` in github-fetcher.ts before
   * being persisted; `branch` is the resolved branch (may differ from what
   * the user typed if they omitted one and we filled in the default).
   */
  githubRepo?: {
    owner: string;
    repo: string;
    branch: string;
    rawUrl: string;
  };
}

/** Risk severity levels */
export type Severity = "high" | "medium" | "low";

/** Objection severity in critiques */
export type ObjectionSeverity = "critical" | "major" | "minor";

// =============================================================================
// STRUCTURED OUTPUT INTERFACES (Agent LLM Responses)
// =============================================================================

/** Structured output from an agent during the Proposal Stage */
export interface ProposalOutput {
  summary: string;
  recommendations: string[];
  risks: { description: string; severity: Severity; mitigation?: string }[];
  assumptions: string[];
  confidence: number; // 0-1
  artifactSuggestions: { type: ArtifactType; title: string; content: string }[];
  references: { agentId?: AgentType; artifactId?: string; description: string }[];
  needsClarification: boolean;
  clarificationQuestions?: string[];
}

/** Structured output from an agent during the Critique Stage */
export interface CritiqueOutput {
  summary: string;
  targetAgentId: AgentType; // Which agent's proposal is being critiqued (opposing-pair routing)
  objections: { point: string; reasoning: string; severity: ObjectionSeverity }[];
  acknowledgedStrengths: string[];
  confidence: number; // 0-1
  riskAssessments: { description: string; severity: Severity }[];
  artifactSuggestions: { type: ArtifactType; title: string; content: string }[];
  references: { agentId?: AgentType; artifactId?: string; description: string }[];
  needsClarification: boolean;
  clarificationQuestions?: string[];
}

/** Structured output from an agent during the Revision Stage */
export interface RevisionOutput {
  summary: string;
  stance: Stance;
  concededPoints: { point: string; reasoning: string }[];
  maintainedPoints: { point: string; reasoning: string }[];
  newArguments: string[];
  confidence: number; // 0-1
  artifactSuggestions: { type: ArtifactType; title: string; content: string }[];
  needsClarification: boolean;
  clarificationQuestions?: string[];
}

/** Structured output from consensus synthesis with evidence chains */
export interface ConsensusOutput {
  agreements: {
    point: string;
    supportingAgents: AgentType[];
    reasoning: string;
    evidenceChain: string[]; // Event IDs that support this agreement
  }[];
  disagreements: {
    point: string;
    positions: { agentId: AgentType; stance: string; reasoning: string }[];
    evidenceChain: string[]; // Event IDs showing the disagreement
  }[];
  recommendedDecisions: { title: string; description: string; confidence: number }[];
  identifiedRisks: { description: string; severity: Severity; raisedBy: AgentType[] }[];
  openQuestions: string[];
  overallConfidence: number; // 0-1
  artifactOperations: {
    operation: "create" | "update" | "accept" | "reject";
    artifactId?: string;
    type?: ArtifactType;
    title: string;
    content?: string; // required for create/update; omit for accept/reject
    sourceEventId?: string; // Links back to the event that justifies this operation
  }[];
}

// =============================================================================
// STATE INTERFACES
// =============================================================================

/** Complete projected state of a session (derived from event log) */
export interface SessionState {
  id: string;
  problemDescription: string;
  status: "active" | "paused" | "completed";
  currentRound: number;
  currentStage: RoundStage | null;
  constraints: Constraint[];
  agents: AgentState[];
  rounds: RoundState[];
  artifacts: ArtifactState[];
  consensus: ConsensusOutput | null;
  tokenUsage: SessionTokenUsage;
}

/** A user-provided constraint */
export interface Constraint {
  id: string;
  text: string;
  category: string;
  createdAt: string;
}

/** Current state of an individual agent */
export interface AgentState {
  id: AgentType;
  displayName: string;
  objectiveFunction: string;
  currentPosition: string | null;
  currentStance: Stance | null;
  confidence: number | null;
  hasCompletedCurrentStage: boolean;
}

/** State of a single round */
export interface RoundState {
  number: number;
  proposals: ProposalOutput[];
  critiques: CritiqueOutput[];
  revisions: RevisionOutput[];
  consensus: ConsensusOutput | null;
  summary: RoundSummary | null;
}

/** Current state of an artifact in the workspace */
export interface ArtifactState {
  id: string;
  type: ArtifactType;
  title: string;
  content: string;
  status: ArtifactStatus;
  createdByAgentId: AgentType | null;
  version: number;
  contributors: AgentType[];
}

/** Condensed summary of a completed round (for context compression) */
export interface RoundSummary {
  roundNumber: number;
  keyProposals: string[];
  majorCritiques: string[];
  revisionOutcomes: string[];
  consensusPoints: string[];
  artifactsCreated: number;
  artifactsUpdated: number;
}

// =============================================================================
// TOKEN AND COST TYPES
// =============================================================================

/** Aggregated token usage for a session */
export interface SessionTokenUsage {
  totalInputTokens: number;
  totalOutputTokens: number;
  byRound: Record<number, { input: number; output: number }>;
  byAgent: Record<AgentType, { input: number; output: number }>;
  estimatedCostUsd: number;
}

/** Record of a single LLM call's token consumption */
export interface TokenUsageRecord {
  agentId: AgentType | null;
  round: number;
  stage: RoundStage;
  inputTokens: number;
  outputTokens: number;
  model: string;
}

/** Estimated cost for an upcoming round */
export interface CostEstimate {
  estimatedInputTokens: number;
  estimatedOutputTokens: number;
  estimatedCostUsd: number;
  model: string;
}

/** Current budget status for a session */
export interface BudgetStatus {
  used: number;
  budget: number | null;
  remaining: number | null;
  isOverBudget: boolean;
  warningThreshold: boolean; // true when >= 80% of budget used
}

/** Model tier configuration - different models for different stages */
export interface ModelTierConfig {
  proposal: string;
  critique: string;
  revision: string;
  consensus: string;
  summary: string;
}

// =============================================================================
// CONTEXT TYPES
// =============================================================================

/** Complete workspace context assembled for an agent LLM call */
export interface WorkspaceContext {
  problemDescription: string;
  constraints: Constraint[];
  workspaceSummary: string;
  artifactSummaries: ArtifactState[];
  roundSummaries: RoundSummary[];
  currentRoundEvents: PersistedEvent[];
  unresolvedDisagreements: ConsensusOutput["disagreements"];
  priorSessionSummary?: string; // Optional context from a prior exported session
}

/** An event that has been persisted to the database */
export interface PersistedEvent {
  id: string;
  sessionId: string;
  type: EventType;
  agentId: AgentType | null;
  round: number;
  stage: RoundStage | null;
  content: string; // JSON string
  timestamp: string;
}

/** A new event to be appended to the event log */
export interface NewEvent {
  sessionId: string;
  type: EventType;
  agentId?: AgentType | null;
  round: number;
  stage?: RoundStage | null;
  content: unknown; // Will be JSON-serialized
}

// =============================================================================
// INFRASTRUCTURE TYPES
// =============================================================================

/** Result of validating a structured output against a Zod schema */
export type ValidationResult<T> =
  | { success: true; data: T }
  | { success: false; errors: string[]; raw: string };

/** Result of executing a single stage */
export type StageResult =
  | { type: "completed"; artifactsCreated: number; artifactsUpdated: number }
  | { type: "clarification-needed"; questions: string[] }
  | { type: "budget-exceeded"; usage: SessionTokenUsage };

/** Result of checking and potentially advancing the stage */
export type StageTransition =
  | { type: "advanced"; from: RoundStage; to: RoundStage }
  | { type: "round-complete"; round: number }
  | { type: "paused-clarification"; questions: string[] }
  | { type: "paused-budget"; status: BudgetStatus };

/** Persisted session snapshot for O(1) state reconstruction */
export interface SessionSnapshot {
  id: string;
  sessionId: string;
  round: number;
  state: SessionState; // The projected state at this point
  createdAt: string;
}

/** Current lock state for a session */
export interface SessionLockState {
  sessionId: string;
  lockedBy: string | null;
  lockedAt: string | null;
  isLocked: boolean;
  isStale: boolean; // true if lockedAt > 5 minutes ago
}

// =============================================================================
// COMPONENT INTERFACES
// =============================================================================

/** Event Store - append-only event log */
export interface EventStore {
  appendEvent(event: NewEvent): Promise<PersistedEvent>;
  getSessionEvents(sessionId: string): Promise<PersistedEvent[]>;
  getRoundEvents(sessionId: string, round: number, stage?: RoundStage): Promise<PersistedEvent[]>;
  getEventsUpTo(sessionId: string, timestamp: Date): Promise<PersistedEvent[]>;
}

/** Artifact Store - mutable artifact management with deduplication */
export interface ArtifactStore {
  createArtifact(artifact: NewArtifact): Promise<ArtifactState>;
  updateArtifact(artifactId: string, update: ArtifactUpdate): Promise<ArtifactState>;
  changeStatus(artifactId: string, status: ArtifactStatus, agentId?: AgentType): Promise<ArtifactState>;
  getSessionArtifacts(sessionId: string): Promise<ArtifactState[]>;
  getArtifactVersions(artifactId: string): Promise<ArtifactVersion[]>;
  getArtifact(artifactId: string): Promise<ArtifactState>;
  findByTitleAndType(sessionId: string, type: ArtifactType, title: string): Promise<ArtifactState | null>;
}

/** New artifact to be created */
export interface NewArtifact {
  sessionId: string;
  type: ArtifactType;
  title: string;
  content: string;
  createdByAgentId?: AgentType;
  sourceEventId: string;
}

/** Update to apply to an existing artifact */
export interface ArtifactUpdate {
  content: string;
  agentId?: AgentType;
  reasoning?: string;
  sourceEventId: string;
}

/** Version record for an artifact */
export interface ArtifactVersion {
  id: string;
  artifactId: string;
  version: number;
  content: string;
  agentId: AgentType | null;
  reasoning: string | null;
  sourceEventId: string; // Links to the event that triggered this version
  timestamp: string;
}

/** Snapshot Manager - O(1) state reconstruction */
export interface SnapshotManager {
  createSnapshot(sessionId: string, round: number, state: SessionState): Promise<void>;
  getLatestSnapshot(sessionId: string): Promise<{ round: number; state: SessionState } | null>;
  projectFromSnapshot(sessionId: string): Promise<SessionState>;
}

/** Session Lock - prevents concurrent round execution */
export interface SessionLock {
  acquire(sessionId: string, lockId: string): Promise<boolean>;
  release(sessionId: string, lockId: string): Promise<void>;
  isLocked(sessionId: string): Promise<boolean>;
  forceRelease(sessionId: string): Promise<void>; // for stale locks > 5 min
}

/** Crash Recovery - resumes interrupted stages */
export interface CrashRecovery {
  recoverIncompleteStage(sessionId: string): Promise<AgentType[]>; // returns agents needing re-execution
  detectIncompleteRound(sessionId: string): Promise<{
    round: number;
    stage: RoundStage;
    completedAgents: AgentType[];
  } | null>;
}

/** Context Assembler - builds workspace context for agent calls */
export interface ContextAssembler {
  assembleContext(sessionId: string, tokenBudget?: number): Promise<WorkspaceContext>;
}

/** Workspace Summary Service */
export interface WorkspaceSummaryService {
  generateSummary(sessionId: string): Promise<string>;
  getSummary(sessionId: string): Promise<string>;
}

/** Round Summary Service */
export interface RoundSummaryService {
  generateRoundSummary(sessionId: string, round: number): Promise<RoundSummary>;
  getRoundSummaries(sessionId: string): Promise<RoundSummary[]>;
}

/** Artifact Summary Service */
export interface ArtifactSummaryService {
  generateArtifactSummary(sessionId: string): Promise<ArtifactState[]>;
}

/** Output Validator - validates agent structured outputs against Zod schemas */
export interface OutputValidator {
  validateProposal(raw: string): ValidationResult<ProposalOutput>;
  validateCritique(raw: string): ValidationResult<CritiqueOutput>;
  validateRevision(raw: string): ValidationResult<RevisionOutput>;
  validateConsensus(raw: string): ValidationResult<ConsensusOutput>;
}

/** Token Budget Manager - tracks and enforces token limits */
export interface TokenBudgetManager {
  trackUsage(sessionId: string, usage: TokenUsageRecord): Promise<void>;
  getSessionUsage(sessionId: string): Promise<SessionTokenUsage>;
  estimateRoundCost(sessionId: string): Promise<CostEstimate>;
  checkBudget(sessionId: string): Promise<BudgetStatus>;
}

/** Round Orchestrator - orchestrates stage execution */
export interface RoundOrchestrator {
  startRound(sessionId: string): Promise<void>;
  executeCurrentStage(sessionId: string): Promise<StageResult>;
  checkAndAdvance(sessionId: string): Promise<StageTransition>;
  handleIntervention(sessionId: string, constraint: Constraint): Promise<void>;
  skipIntervention(sessionId: string): Promise<void>;
}

// =============================================================================
// AGENT CONFIGURATION TYPES
// =============================================================================

/** Configuration for an individual agent */
export interface AgentConfig {
  id: AgentType;
  displayName: string;
  objectiveFunction: string;
  evaluationCriteria: string[];
  conflictingPriorities: string[];
  /** Concrete reasoning patterns the agent uses to evaluate proposals. */
  reasoningPatterns?: string[];
  /** Failure modes this agent should actively guard against. */
  pitfallsToAvoid?: string[];
}

/** Critique routing - opposing pairs for focused cross-discipline tension */
export interface CritiqueRouting {
  [key: string]: AgentType; // Maps agent ID to their critique target
}

// =============================================================================
// LLM PROVIDER TYPES
// =============================================================================

/**
 * A function tool the model can call. Shape is OpenAI-compat; the Bedrock
 * provider maps it to `toolSpec.inputSchema.json` at the boundary.
 */
export interface ToolDefinition {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
}

/** A single tool-call request emitted by the model. */
export interface ToolCallRequest {
  id: string;
  name: string;
  arguments: Record<string, unknown>;
}

/**
 * Extra conversation turns to send alongside the system + user message —
 * used by the tool-call loop to feed prior assistant tool_calls and tool
 * results back to the model. OpenAI-compat shape; Bedrock provider maps
 * these into ConverseCommand `toolUse` / `toolResult` content blocks.
 */
export interface ExtraMessage {
  role: "assistant" | "tool";
  content: string | null;
  tool_calls?: Array<{
    id: string;
    type: "function";
    function: { name: string; arguments: string };
  }>;
  tool_call_id?: string;
  name?: string;
}

/** Request to the LLM provider */
export interface LLMRequest {
  /**
   * Full system prompt. For the OpenAI-compatible path this is what's sent
   * verbatim. For the Bedrock path it's used as a fallback when
   * `systemPromptStable` is not provided.
   */
  systemPrompt: string;
  userMessage: string;
  temperature?: number;
  maxTokens?: number;
  responseFormat?: "json";
  /**
   * Optional structured split: the portion of the system prompt that is
   * identical across all stages for a given agent (identity + objective +
   * criteria + reasoning patterns). When set together with `systemPromptStageSpecific`,
   * the Bedrock provider inserts a cachePoint at the boundary so the per-agent
   * block caches across proposal → critique → revision, not just across
   * within-stage retries. The OpenAI path is unaffected — it just uses
   * `systemPrompt`, which the prompt builder still populates as the concatenation.
   */
  systemPromptStable?: string;
  /**
   * The stage-specific tail of the system prompt (schema description, JSON
   * instruction, stance options for revision, etc.).
   */
  systemPromptStageSpecific?: string;
  /**
   * Function tools the model may invoke. When set, the provider does NOT
   * apply `responseFormat: "json"` — the model needs freedom to emit
   * `tool_calls`. JSON schema enforcement happens on the final non-tool
   * response of the tool-call loop.
   */
  tools?: ToolDefinition[];
  /** Tool-choice hint. `auto` lets the model decide; `none` forces no calls. */
  toolChoice?: "auto" | "none" | { name: string };
  /**
   * Prior assistant tool_calls and tool results to replay back to the model
   * for the next loop turn. Appended after the initial user message.
   */
  extraMessages?: ExtraMessage[];
}

/** Response from the LLM provider */
export interface LLMResponse {
  content: string;
  inputTokens: number;
  outputTokens: number;
  model: string;
  /** Set when the model requests function/tool invocations instead of a text answer. */
  toolCalls?: ToolCallRequest[];
  /** Why the model stopped this turn. */
  finishReason?: "stop" | "tool_calls" | "length" | "other";
}


/** LLM Provider configuration */
export interface LLMProviderConfig {
  apiKey: string;
  baseUrl: string;
  defaultModel: string;
  modelTiers: ModelTierConfig;
  defaultTemperature: number;
  defaultMaxTokens: number;
}

/** Prompt Builder interface */
export interface PromptBuilder {
  buildProposalPrompt(agent: AgentConfig, context: WorkspaceContext): LLMRequest;
  buildCritiquePrompt(agent: AgentConfig, proposals: ProposalOutput[], context: WorkspaceContext): LLMRequest;
  buildRevisionPrompt(agent: AgentConfig, critiques: CritiqueOutput[], context: WorkspaceContext): LLMRequest;
  buildConsensusPrompt(roundEvents: PersistedEvent[], context: WorkspaceContext): LLMRequest;
}

/**
 * Pre-fetched per-round repo context passed to `generateProposalWithTools`.
 * Carries the filtered tree, target ref, and a per-agent shortlist used as
 * a hint in the proposal prompt. Mirrors RepoContext in agent-tool-loop.ts.
 */
export interface ProposalRepoContext {
  owner: string;
  repo: string;
  branch: string;
  entries: Array<{ path: string; size: number }>;
  shortlist: string[];
  rawUrl?: string;
}

/** Tool-call stats from a single tool-grounded proposal attempt. */
export interface ToolLoopStats {
  toolCallCount: number;
  capHit: boolean;
  /** Paths successfully read via read_file, server-tracked in order of first read. */
  filesRead: string[];
}

/** Result of a tool-grounded proposal: the validated output + observability stats. */
export interface ProposalWithToolsResult {
  proposal: ProposalOutput;
  toolStats: ToolLoopStats;
}

/** Agent Executor interface */
export interface AgentExecutor {
  generateProposal(agent: AgentConfig, context: WorkspaceContext): Promise<ProposalOutput>;
  /**
   * Tool-grounded proposal: runs the GitHub tool-call loop before the model
   * commits to its final ProposalOutput. Only used when the session has a
   * `githubRepo` configured. Validation + retry logic mirror generateProposal.
   * Returns the proposal *and* tool-loop stats so the orchestrator can surface
   * toolCallCount / capHit on the stage-progress event.
   */
  generateProposalWithTools(
    agent: AgentConfig,
    context: WorkspaceContext,
    repoContext: ProposalRepoContext
  ): Promise<ProposalWithToolsResult>;
  generateCritique(agent: AgentConfig, proposal: ProposalOutput, context: WorkspaceContext): Promise<CritiqueOutput>;
  generateRevision(agent: AgentConfig, critiques: CritiqueOutput[], context: WorkspaceContext): Promise<RevisionOutput>;
  synthesizeConsensus(roundEvents: PersistedEvent[], context: WorkspaceContext): Promise<ConsensusOutput>;
}

/** LLM Provider interface */
export interface LLMProvider {
  complete(request: LLMRequest, modelOverride?: string): Promise<LLMResponse>;
}
