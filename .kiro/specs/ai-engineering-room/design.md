# Design Document: AI Engineering Room

## Overview

The AI Engineering Room is an event-sourced, outcome-focused web application where four autonomous AI agents collaborate through structured debate rounds to solve engineering design problems. The system produces structured engineering artifacts — architecture decisions, identified risks, trade-off analyses, and recommendations — through real LLM API calls with distinct objective functions per agent.

The architecture is designed around four core principles:
1. **Event Sourcing** — All state is derived from an append-only event log; no mutable state except artifacts.
2. **Agent Autonomy** — Each agent reasons independently via real LLM calls with conflicting objective functions.
3. **Structured Outputs** — All agent responses are validated against Zod schemas for reliable parsing and artifact creation.
4. **Outcome Focus** — Artifacts and decisions are the primary outputs; debate is the secondary process that produces them.

Additional architectural concerns:
- **Context Compression** — Agents receive summarized context (not full history) to scale across many rounds.
- **Cost Control** — Token budget management with model tiering for cost optimization.
- **Minimal Infrastructure** — Next.js API routes, Prisma, and SQLite only; no external services.

---

## System Architecture

### High-Level Architecture

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                          Next.js Application                                 │
├─────────────────────────────────────────────────────────────────────────────┤
│  Frontend (React + Tailwind CSS)                                            │
│  ┌────────────────┐ ┌──────────────────┐ ┌──────────────┐ ┌─────────────┐ │
│  │  Artifacts     │ │  Engineering     │ │  Agent       │ │  Debate     │ │
│  │  Panel         │ │  Outcomes Panel  │ │  Panels      │ │  Timeline   │ │
│  │  (PRIMARY)     │ │  (PRIMARY)       │ │ (SECONDARY)  │ │ (TERTIARY)  │ │
│  └───────┬────────┘ └────────┬─────────┘ └──────┬───────┘ └──────┬──────┘ │
│          └────────────────────┴──────────────────┴────────────────┘        │
│                                     │                                       │
│                           React Hooks / SWR                                  │
│                                     │                                       │
├─────────────────────────────────────┼───────────────────────────────────────┤
│  API Layer (Next.js API Routes)                                             │
│  ┌───────────┐ ┌──────────┐ ┌───────────┐ ┌─────────────┐ ┌────────────┐ │
│  │ /sessions │ │ /rounds  │ │ /artifacts│ │ /token-usage│ │ /config    │ │
│  └─────┬─────┘ └────┬─────┘ └─────┬─────┘ └──────┬──────┘ └─────┬──────┘ │
│        └─────────────┴─────────────┴───────────────┴──────────────┘        │
│                                     │                                       │
├─────────────────────────────────────┼───────────────────────────────────────┤
│  Domain Layer                                                               │
│  ┌──────────────┐ ┌──────────────┐ ┌──────────────┐ ┌───────────────────┐ │
│  │   Round      │ │   Agent      │ │  Context     │ │   Output          │ │
│  │ Orchestrator │ │  Executor    │ │  Assembler   │ │   Validator       │ │
│  └──────┬───────┘ └──────┬───────┘ └──────┬───────┘ └────────┬──────────┘ │
│         │                │                 │                   │            │
│  ┌──────┴───────┐ ┌──────┴───────┐ ┌──────┴───────┐ ┌────────┴─────────┐ │
│  │  Artifact    │ │  LLM Provider│ │  Summary     │ │  Token Budget    │ │
│  │  Store       │ │  (w/ Tiers)  │ │  Services    │ │  Manager         │ │
│  └──────┬───────┘ └──────────────┘ └──────┬───────┘ └────────┬─────────┘ │
│         │                                  │                   │            │
│  ┌──────┴──────────────────────────────────┴───────────────────┴─────────┐ │
│  │                         Event Store                                    │ │
│  └────────────────────────────────┬──────────────────────────────────────┘ │
├───────────────────────────────────┼────────────────────────────────────────┤
│  Persistence Layer                │                                         │
│  ┌────────────────────────────────┴──────────────────────────────────────┐ │
│  │                        Prisma ORM                                      │ │
│  │  ┌─────────┐ ┌───────┐ ┌──────────┐ ┌─────────────────┐ ┌──────────┐│ │
│  │  │ Session │ │ Event │ │ Artifact │ │ ArtifactVersion │ │TokenUsage││ │
│  │  └─────────┘ └───────┘ └──────────┘ └─────────────────┘ └──────────┘│ │
│  │  ┌─────────────────┐                                                │ │
│  │  │SessionSnapshot  │                                                │ │
│  │  └─────────────────┘                                                │ │
│  └───────────────────────────────────────────────────────────────────────┘ │
│  ┌───────────────────────────────────────────────────────────────────────┐ │
│  │                        SQLite Database                                 │ │
│  └───────────────────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Component Interaction Flow

```
User Input → API Route → Round Orchestrator
                              │
                              ├── Context Assembler (summaries + current events)
                              │        │
                              │        ├── WorkspaceSummaryService
                              │        ├── RoundSummaryService
                              │        └── ArtifactSummaryService
                              │
                              ├── Agent Executor (per agent)
                              │        │
                              │        ├── PromptBuilder (includes schema definition)
                              │        ├── LLM Provider (model tier selection)
                              │        ├── Output Validator (Zod schema check)
                              │        └── Token Budget Manager (track usage)
                              │
                              ├── Artifact Store (create/update from outputs)
                              │
                              └── Event Store (persist all events)
                                       │
                                       ▼
                              State Projection → Frontend Update
```

---

## Data Models

### Prisma Schema

```prisma
datasource db {
  provider = "sqlite"
  url      = "file:./dev.db"
}

generator client {
  provider = "prisma-client-js"
}

model Session {
  id                 String    @id @default(cuid())
  title              String?
  problemDescription String
  status             String    @default("active")
  currentRound       Int       @default(0)
  currentStage       String?
  tokenBudget        Int?
  lockedBy           String?
  lockedAt           DateTime?
  createdAt          DateTime  @default(now())
  updatedAt          DateTime  @updatedAt
  events             Event[]
  artifacts          Artifact[]
  tokenUsages        TokenUsage[]
  snapshots          SessionSnapshot[]
}

model Event {
  id        String   @id @default(cuid())
  sessionId String
  session   Session  @relation(fields: [sessionId], references: [id])
  type      String
  agentId   String?
  round     Int
  stage     String?
  content   String
  timestamp DateTime @default(now())

  @@index([sessionId, timestamp])
  @@index([sessionId, round, stage])
}

model Artifact {
  id               String            @id @default(cuid())
  sessionId        String
  session          Session           @relation(fields: [sessionId], references: [id])
  type             String
  title            String
  content          String
  status           String            @default("draft")
  createdByAgentId String?
  version          Int               @default(1)
  createdAt        DateTime          @default(now())
  updatedAt        DateTime          @updatedAt
  versions         ArtifactVersion[]

  @@index([sessionId, type])
  @@index([sessionId, status])
}

model ArtifactVersion {
  id         String   @id @default(cuid())
  artifactId String
  artifact   Artifact @relation(fields: [artifactId], references: [id])
  version    Int
  content    String
  agentId    String?
  reasoning  String?
  timestamp  DateTime @default(now())

  @@index([artifactId, version])
}

model TokenUsage {
  id           String   @id @default(cuid())
  sessionId    String
  session      Session  @relation(fields: [sessionId], references: [id])
  agentId      String?
  round        Int
  stage        String?
  inputTokens  Int
  outputTokens Int
  model        String
  timestamp    DateTime @default(now())

  @@index([sessionId])
  @@index([sessionId, round])
}

model SessionSnapshot {
  id        String   @id @default(cuid())
  sessionId String
  session   Session  @relation(fields: [sessionId], references: [id])
  round     Int
  state     String   // JSON-serialized SessionState
  createdAt DateTime @default(now())

  @@unique([sessionId, round])
  @@index([sessionId])
}
```

### TypeScript Domain Types

```typescript
// src/types/domain.ts

export type AgentType =
  | "senior-engineer"
  | "security-engineer"
  | "performance-engineer"
  | "product-engineer";

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

export type RoundStage =
  | "proposal"
  | "critique"
  | "revision"
  | "consensus"
  | "awaiting-intervention";

export type Stance = "agree" | "disagree" | "partially-concede" | "strengthen";

export type ArtifactType =
  | "decision"
  | "risk"
  | "assumption"
  | "tradeoff"
  | "open-question"
  | "recommendation";

export type ArtifactStatus = "draft" | "accepted" | "rejected";

export type Severity = "high" | "medium" | "low";
export type ObjectionSeverity = "critical" | "major" | "minor";

// --- Structured Output Schemas ---

export interface ProposalOutput {
  summary: string;
  recommendations: string[];
  risks: { description: string; severity: Severity; mitigation?: string }[];
  assumptions: string[];
  confidence: number;
  artifactSuggestions: { type: ArtifactType; title: string; content: string }[];
  references: { agentId?: AgentType; artifactId?: string; description: string }[];
  needsClarification: boolean;
  clarificationQuestions?: string[];
}

export interface CritiqueOutput {
  summary: string;
  targetAgentId: AgentType;
  objections: { point: string; reasoning: string; severity: ObjectionSeverity }[];
  acknowledgedStrengths: string[];
  confidence: number;
  riskAssessments: { description: string; severity: Severity }[];
  artifactSuggestions: { type: ArtifactType; title: string; content: string }[];
  references: { agentId?: AgentType; artifactId?: string; description: string }[];
  needsClarification: boolean;
  clarificationQuestions?: string[];
}

export interface RevisionOutput {
  summary: string;
  stance: Stance;
  concededPoints: { point: string; reasoning: string }[];
  maintainedPoints: { point: string; reasoning: string }[];
  newArguments: string[];
  confidence: number;
  artifactSuggestions: { type: ArtifactType; title: string; content: string }[];
  needsClarification: boolean;
  clarificationQuestions?: string[];
}

export interface ConsensusOutput {
  agreements: { point: string; supportingAgents: AgentType[]; reasoning: string }[];
  disagreements: { point: string; positions: { agentId: AgentType; stance: string; reasoning: string }[] }[];
  recommendedDecisions: { title: string; description: string; confidence: number }[];
  identifiedRisks: { description: string; severity: Severity; raisedBy: AgentType[] }[];
  openQuestions: string[];
  overallConfidence: number;
  artifactOperations: { operation: "create" | "update" | "accept" | "reject"; artifactId?: string; type?: ArtifactType; title: string; content: string }[];
}

// --- State Types ---

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

export interface Constraint {
  id: string;
  text: string;
  category: string;
  createdAt: string;
}

export interface AgentState {
  id: AgentType;
  displayName: string;
  objectiveFunction: string;
  currentPosition: string | null;
  currentStance: Stance | null;
  confidence: number | null;
  hasCompletedCurrentStage: boolean;
}

export interface RoundState {
  number: number;
  proposals: ProposalOutput[];
  critiques: CritiqueOutput[];
  revisions: RevisionOutput[];
  consensus: ConsensusOutput | null;
  summary: RoundSummary | null;
}

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

export interface RoundSummary {
  roundNumber: number;
  keyProposals: string[];
  majorCritiques: string[];
  revisionOutcomes: string[];
  consensusPoints: string[];
  artifactsCreated: number;
  artifactsUpdated: number;
}

export interface SessionTokenUsage {
  totalInputTokens: number;
  totalOutputTokens: number;
  byRound: Record<number, { input: number; output: number }>;
  byAgent: Record<AgentType, { input: number; output: number }>;
  estimatedCostUsd: number;
}

export interface WorkspaceContext {
  problemDescription: string;
  constraints: Constraint[];
  workspaceSummary: string;
  artifactSummaries: ArtifactState[];
  roundSummaries: RoundSummary[];
  currentRoundEvents: PersistedEvent[];
  unresolvedDisagreements: ConsensusOutput["disagreements"];
}

export interface ModelTierConfig {
  proposal: string;
  critique: string;
  revision: string;
  consensus: string;
  summary: string;
}

export interface CostEstimate {
  estimatedInputTokens: number;
  estimatedOutputTokens: number;
  estimatedCostUsd: number;
  model: string;
}

export interface BudgetStatus {
  used: number;
  budget: number | null;
  remaining: number | null;
  isOverBudget: boolean;
  warningThreshold: boolean;
}
```

---

## Component Design

### Event Store

```typescript
export interface EventStore {
  appendEvent(event: NewEvent): Promise<PersistedEvent>;
  getSessionEvents(sessionId: string): Promise<PersistedEvent[]>;
  getRoundEvents(sessionId: string, round: number, stage?: RoundStage): Promise<PersistedEvent[]>;
  getEventsUpTo(sessionId: string, timestamp: Date): Promise<PersistedEvent[]>;
}
```

### Artifact Store

```typescript
export interface ArtifactStore {
  createArtifact(artifact: NewArtifact): Promise<ArtifactState>;
  updateArtifact(artifactId: string, update: ArtifactUpdate): Promise<ArtifactState>;
  changeStatus(artifactId: string, status: ArtifactStatus, agentId?: AgentType): Promise<ArtifactState>;
  getSessionArtifacts(sessionId: string): Promise<ArtifactState[]>;
  getArtifactVersions(artifactId: string): Promise<ArtifactVersion[]>;
  getArtifact(artifactId: string): Promise<ArtifactState>;
}

export interface NewArtifact {
  sessionId: string;
  type: ArtifactType;
  title: string;
  content: string;
  createdByAgentId?: AgentType;
}

export interface ArtifactUpdate {
  content: string;
  agentId?: AgentType;
  reasoning?: string;
}
```

### Context Assembler

```typescript
export interface ContextAssembler {
  assembleContext(sessionId: string, tokenBudget?: number): Promise<WorkspaceContext>;
}
```

The Context Assembler prioritizes content in this order when approaching the token budget:
1. Current round events (full, never truncated)
2. Current artifact state
3. Active constraints
4. Workspace summary
5. Round summaries (oldest truncated first)

### Summary Services

```typescript
export interface WorkspaceSummaryService {
  generateSummary(sessionId: string): Promise<string>;
  getSummary(sessionId: string): Promise<string>;
}

export interface RoundSummaryService {
  generateRoundSummary(sessionId: string, round: number): Promise<RoundSummary>;
  getRoundSummaries(sessionId: string): Promise<RoundSummary[]>;
}

export interface ArtifactSummaryService {
  generateArtifactSummary(sessionId: string): Promise<ArtifactState[]>;
}
```

### Output Validator

```typescript
export interface OutputValidator {
  validateProposal(raw: string): ValidationResult<ProposalOutput>;
  validateCritique(raw: string): ValidationResult<CritiqueOutput>;
  validateRevision(raw: string): ValidationResult<RevisionOutput>;
  validateConsensus(raw: string): ValidationResult<ConsensusOutput>;
}

export type ValidationResult<T> =
  | { success: true; data: T }
  | { success: false; errors: string[]; raw: string };
```

On validation failure: re-prompt agent with error message (max 2 retries). On final failure: persist raw output with validation-failure metadata.

**JSON-extraction tolerance:** before `JSON.parse`, `tryParseJson` strips a single surrounding ```` ```json ... ``` ```` (or unlabelled triple-backtick) fence if present. Some models — Bedrock Anthropic Haiku 4.5 in particular — consistently wrap structured output in markdown fences regardless of system-prompt instructions, and re-prompting does not reliably change that. The fence stripper keeps validation deterministic without weakening the underlying Zod schema check.

**Terminal-failure observability:** `callWithRetry` in `agent-executor.ts` logs the final validation error (errors + first 400 chars of the last response) via `console.error` before throwing, so per-agent failures surface in the dev log even though the orchestrator's `Promise.allSettled` swallows the rejection.

### Token Budget Manager

```typescript
export interface TokenBudgetManager {
  trackUsage(sessionId: string, usage: TokenUsageRecord): Promise<void>;
  getSessionUsage(sessionId: string): Promise<SessionTokenUsage>;
  estimateRoundCost(sessionId: string): Promise<CostEstimate>;
  checkBudget(sessionId: string): Promise<BudgetStatus>;
}

export interface TokenUsageRecord {
  agentId: AgentType | null;
  round: number;
  stage: RoundStage;
  inputTokens: number;
  outputTokens: number;
  model: string;
}
```

### Session Snapshot Manager

```typescript
export interface SnapshotManager {
  createSnapshot(sessionId: string, round: number, state: SessionState): Promise<void>;
  getLatestSnapshot(sessionId: string): Promise<{ round: number; state: SessionState } | null>;
  projectFromSnapshot(sessionId: string): Promise<SessionState>;
}
```

### Session Lock

```typescript
export interface SessionLock {
  acquire(sessionId: string, lockId: string): Promise<boolean>;
  release(sessionId: string, lockId: string): Promise<void>;
  isLocked(sessionId: string): Promise<boolean>;
  forceRelease(sessionId: string): Promise<void>; // for stale locks > 5 min
}
```

### Crash Recovery

```typescript
export interface CrashRecovery {
  recoverIncompleteStage(sessionId: string): Promise<AgentType[]>; // returns agents that need re-execution
  detectIncompleteRound(sessionId: string): Promise<{ round: number; stage: RoundStage; completedAgents: AgentType[] } | null>;
}
```

### Round Orchestrator

```typescript
export interface RoundOrchestrator {
  startRound(sessionId: string): Promise<void>;
  executeCurrentStage(sessionId: string): Promise<StageResult>;
  checkAndAdvance(sessionId: string): Promise<StageTransition>;
  handleIntervention(sessionId: string, constraint: Constraint): Promise<void>;
  skipIntervention(sessionId: string): Promise<void>;
}
```

export type StageResult =
  | { type: "completed"; artifactsCreated: number; artifactsUpdated: number }
  | { type: "clarification-needed"; questions: string[] }
  | { type: "budget-exceeded"; usage: SessionTokenUsage };

export type StageTransition =
  | { type: "advanced"; from: RoundStage; to: RoundStage }
  | { type: "round-complete"; round: number }
  | { type: "paused-clarification"; questions: string[] }
  | { type: "paused-budget"; status: BudgetStatus };
```

### Agent Executor

```typescript
export interface AgentExecutor {
  generateProposal(agent: AgentConfig, context: WorkspaceContext): Promise<ProposalOutput>;
  generateCritique(agent: AgentConfig, proposals: ProposalOutput[], context: WorkspaceContext): Promise<CritiqueOutput>;
  generateRevision(agent: AgentConfig, critiques: CritiqueOutput[], context: WorkspaceContext): Promise<RevisionOutput>;
  synthesizeConsensus(roundEvents: PersistedEvent[], context: WorkspaceContext): Promise<ConsensusOutput>;
}
```

Each method: build prompt → select model tier → call LLM → validate output → track tokens → return structured result.

### LLM Provider

```typescript
export interface LLMProvider {
  complete(request: LLMRequest, modelOverride?: string): Promise<LLMResponse>;
}

export interface LLMProviderConfig {
  apiKey: string;
  baseUrl: string;
  defaultModel: string;
  modelTiers: ModelTierConfig;
  defaultTemperature: number;
  defaultMaxTokens: number;
}
```

### Prompt Builder

```typescript
export interface PromptBuilder {
  buildProposalPrompt(agent: AgentConfig, context: WorkspaceContext): LLMRequest;
  buildCritiquePrompt(agent: AgentConfig, proposals: ProposalOutput[], context: WorkspaceContext): LLMRequest;
  buildRevisionPrompt(agent: AgentConfig, critiques: CritiqueOutput[], context: WorkspaceContext): LLMRequest;
  buildConsensusPrompt(roundEvents: PersistedEvent[], context: WorkspaceContext): LLMRequest;
}
```

All prompts include the expected output JSON schema definition so agents produce conforming responses.

---

## Agent Configurations

```typescript
export const AGENT_CONFIGS: Record<AgentType, AgentConfig> = {
  "senior-engineer": {
    id: "senior-engineer",
    displayName: "Senior Engineer",
    objectiveFunction: "Maximize architectural quality, code maintainability, and long-term system design integrity.",
    evaluationCriteria: ["Separation of concerns", "Maintainability", "Code clarity", "Abstraction levels", "Technical debt"],
    conflictingPriorities: ["May oppose shipping velocity", "May resist perf optimizations that obscure design"]
  },
  "security-engineer": {
    id: "security-engineer",
    displayName: "Security Engineer",
    objectiveFunction: "Minimize attack surface, prevent vulnerabilities, enforce security best practices.",
    evaluationCriteria: ["Threat modeling", "Input validation", "Auth correctness", "Data protection", "Secure defaults"],
    conflictingPriorities: ["May oppose UX shortcuts", "May demand additional complexity for defense-in-depth"]
  },
  "performance-engineer": {
    id: "performance-engineer",
    displayName: "Performance Engineer",
    objectiveFunction: "Minimize latency, maximize throughput, ensure efficient resource utilization.",
    evaluationCriteria: ["Latency budgets", "Throughput", "Memory/CPU efficiency", "Scalability", "Resource utilization"],
    conflictingPriorities: ["May oppose abstraction layers", "May push for caching that complicates consistency"]
  },
  "product-engineer": {
    id: "product-engineer",
    displayName: "Product Engineer",
    objectiveFunction: "Maximize user value delivery, feature completeness, and shipping velocity.",
    evaluationCriteria: ["UX quality", "Feature completeness", "Delivery speed", "Business value", "Pragmatic tradeoffs"],
    conflictingPriorities: ["May oppose architectural purity", "May favor speed over optimization"]
  }
};
```

---

## API Layer

```
src/app/api/
├── sessions/
│   ├── route.ts                          // GET list, POST create
│   └── [sessionId]/
│       ├── route.ts                      // GET detail
│       ├── events/route.ts               // GET event log
│       ├── rounds/
│       │   ├── route.ts                  // POST start round
│       │   └── [roundNumber]/route.ts    // GET round state
│       ├── artifacts/
│       │   ├── route.ts                  // GET list, POST create
│       │   └── [artifactId]/route.ts     // GET, PATCH, PUT status
│       ├── intervene/route.ts            // POST add constraint
│       ├── advance/route.ts              // POST skip intervention
│       ├── token-usage/route.ts          // GET usage stats
│       ├── export/route.ts              // GET markdown
│       └── replay/route.ts              // GET replay data
└── config/route.ts                       // GET/PUT LLM config + tiers
```

---

## Frontend Layer

### Outcome-Focused Component Hierarchy

```
WorkspaceLayout
├── Header
│   ├── SessionTitle + Status Badge
│   ├── RoundIndicator
│   └── TokenUsageBadge (cost so far)
├── MainGrid (outcome-focused layout)
│   ├── PrimaryPanel (60% width - largest area)
│   │   ├── ArtifactsPanel
│   │   │   ├── ArtifactCard (type icon, title, status, contributors)
│   │   │   └── ArtifactDetail (content, version history, reasoning)
│   │   ├── EngineeringOutcomesPanel
│   │   │   ├── DecisionLog (accepted decisions + provenance)
│   │   │   ├── RiskRegister (identified risks + severity)
│   │   │   └── OpenQuestions (remaining questions)
│   │   └── SharedWorkspace
│   │       ├── ProblemDescription
│   │       ├── ConstraintsList
│   │       └── InterventionPanel (between rounds)
│   ├── SecondaryPanel (30% width - collapsible)
│   │   ├── AgentPanels (×4 stacked)
│   │   │   ├── AgentHeader (name, stance badge, confidence %)
│   │   │   ├── CurrentPosition (markdown)
│   │   │   └── ArtifactContributions
│   │   └── ConsensusDashboard
│   │       ├── AgreementSection
│   │       └── DisagreementSection
│   └── TertiaryPanel (10% width - collapsible audit)
│       ├── DebateTimeline (chronological events)
│       └── RoundProgressIndicator
└── Footer
    ├── ActionButtons (new round, end, export)
    └── BudgetIndicator (remaining budget)
```

---

## Round Execution Flow

### Updated State Machine

```
Session Created → Awaiting First Round
                       │
                       ▼
                ┌──────────────┐
         ┌──────│ Proposal Stage│
         │      └──────┬───────┘
         │             │ validate outputs → create artifacts → check clarification
         │             │
         │      ┌──────▼────────┐
         │      │Clarification? │──yes──→ Pause (aggregate questions → user responds)
         │      └──────┬────────┘                                      │
         │             │ no                                             │
         │             ▼                                             resume
         │      ┌──────────────┐                                       │
         │      │ Critique Stage│◄─────────────────────────────────────┘
         │      └──────┬───────┘
         │             │ validate → artifacts → check clarification
         │             │ each agent critiques exactly ONE other agent's
         │             │ proposal based on maximum objective conflict (4 total)
         │             │ Critique routing: Senior↔Performance, Security↔Product
         │             ▼
         │      ┌──────────────┐
         │      │ Revision Stage│
         │      └──────┬───────┘
         │             │ validate → artifacts → check clarification
         │             ▼
         │      ┌────────────────────┐
         │      │ Consensus Synthesis│
         │      └──────┬─────────────┘
         │             │ validate → artifact operations (create/accept/reject)
         │             ▼
         │      ┌────────────────────┐
         │      │ Generate Summaries │ (round + workspace + artifact)
         │      └──────┬─────────────┘
         │             ▼
         │      ┌────────────────────┐
         └──────│Awaiting Intervention│──→ next round (loop back)
                └────────────────────┘
```

### Single Stage Execution Sequence

0. **Acquire Lock**: SessionLock.acquire(sessionId) — fail with 409 if already locked
1. **Assemble Context**: ContextAssembler builds WorkspaceContext from summaries
2. **Check Budget**: TokenBudgetManager verifies budget allows execution
3. **Build Prompts**: PromptBuilder creates stage-specific prompts with schema definition
4. **Execute LLM Calls**: 4 parallel calls (or 1 for consensus), model tier selected per stage
5. **Track Tokens**: TokenBudgetManager records usage per call
5a. **Persist Progress**: For each completed agent, persist stage-progress event immediately
6. **Validate Outputs**: OutputValidator checks against Zod schema (retry up to 2x on failure)
7. **Process Artifacts**: Create/update artifacts from artifactSuggestions in outputs
8. **Check Clarification**: If any agent set needsClarification=true, pause round
9. **Persist Events**: Store validated outputs as events in EventStore
10. **Auto-Advance**: Transition to next stage
11. **Release Lock**: SessionLock.release(sessionId)

---

## File Structure

```
src/
├── app/
│   ├── api/
│   │   ├── sessions/
│   │   │   ├── route.ts
│   │   │   └── [sessionId]/
│   │   │       ├── route.ts
│   │   │       ├── events/route.ts
│   │   │       ├── rounds/route.ts
│   │   │       ├── rounds/[roundNumber]/route.ts
│   │   │       ├── artifacts/route.ts
│   │   │       ├── artifacts/[artifactId]/route.ts
│   │   │       ├── intervene/route.ts
│   │   │       ├── advance/route.ts
│   │   │       ├── token-usage/route.ts
│   │   │       ├── export/route.ts
│   │   │       └── replay/route.ts
│   │   └── config/route.ts
│   ├── page.tsx
│   ├── sessions/[sessionId]/page.tsx
│   └── layout.tsx
├── components/
│   ├── workspace/
│   │   ├── WorkspaceLayout.tsx
│   │   ├── ArtifactsPanel.tsx
│   │   ├── ArtifactCard.tsx
│   │   ├── ArtifactDetail.tsx
│   │   ├── EngineeringOutcomesPanel.tsx
│   │   ├── DecisionLog.tsx
│   │   ├── RiskRegister.tsx
│   │   ├── OpenQuestions.tsx
│   │   ├── AgentPanel.tsx
│   │   ├── ConsensusDashboard.tsx
│   │   ├── SharedWorkspace.tsx
│   │   ├── InterventionPanel.tsx
│   │   ├── DebateTimeline.tsx
│   │   └── RoundProgressIndicator.tsx
│   ├── session/
│   │   ├── SessionList.tsx
│   │   ├── NewSessionForm.tsx
│   │   └── ConstraintInput.tsx
│   └── ui/
│       ├── MarkdownRenderer.tsx
│       ├── StanceBadge.tsx
│       ├── ConfidenceBadge.tsx
│       ├── TokenUsageBadge.tsx
│       └── TimelineEvent.tsx
├── hooks/
│   ├── useSession.ts
│   ├── useEventStream.ts
│   ├── useArtifacts.ts
│   ├── useTokenUsage.ts
│   └── useRoundProgress.ts
├── lib/
│   ├── event-store.ts
│   ├── state-projector.ts
│   ├── artifact-store.ts
│   ├── round-orchestrator.ts
│   ├── agent-executor.ts
│   ├── context-assembler.ts
│   ├── output-validator.ts
│   ├── token-budget-manager.ts
│   ├── workspace-summary-service.ts
│   ├── round-summary-service.ts
│   ├── artifact-summary-service.ts
│   ├── prompt-builder.ts
│   ├── llm-provider.ts
│   ├── agent-configs.ts
│   ├── error-handling.ts
│   ├── export.ts
│   ├── snapshot-manager.ts
│   ├── session-lock.ts
│   └── crash-recovery.ts
├── schemas/
│   ├── proposal-output.ts
│   ├── critique-output.ts
│   ├── revision-output.ts
│   └── consensus-output.ts
├── types/
│   └── domain.ts
└── prisma/
    └── schema.prisma
```

---

## Correctness Properties

### Property 1: Event Sourcing Round-Trip
For any sequence of events, projecting through StateProjector SHALL produce identical SessionState regardless of when executed.
**Validates: Requirements 6.4, 6.6, 9.2**

### Property 2: Event Structural Integrity
Every persisted event SHALL have valid type, non-null timestamp, valid round ≥ 0, and non-empty content.
**Validates: Requirements 6.2, 6.3**

### Property 3: Agent Prompt Includes Objective Function
Every constructed prompt SHALL include the agent's distinct objective function.
**Validates: Requirements 2.2-2.5, 2.7**

### Property 4: Context Uses Summaries Not Full History
For rounds N > 1, the context provided to agents SHALL contain round summaries (not full event history) for prior rounds.
**Validates: Requirements 2.6, 2.9, 13.4, 13.5**

### Property 5: Round Stage Ordering Invariant
Events SHALL appear in strict stage order within a round.
**Validates: Requirements 3.1, 3.7**

### Property 6: Revision Stance Validity
Every RevisionOutput SHALL have valid stance and non-empty concededPoints when stance is partially-concede.
**Validates: Requirements 3.5, 11.2**

### Property 7: Constraint Persistence Round-Trip
Constraints submitted by user SHALL appear in projected state with original text preserved.
**Validates: Requirements 1.4, 5.2**

### Property 8: Session Agent Invariant
Every session SHALL have exactly 4 agents with correct IDs.
**Validates: Requirements 1.2**

### Property 9: Consensus Derives From Debate
Consensus LLM call SHALL receive current round events and produce non-empty agreements or disagreements.
**Validates: Requirements 4.1, 4.3**

### Property 10: Export Completeness
Export SHALL contain problem, constraints, artifacts, agent positions, and consensus.
**Validates: Requirements 9.4, 9.5**

### Property 11: Auto-Advance After Completion
Stages SHALL advance automatically when all agents complete with valid outputs.
**Validates: Requirements 3.7, 3.8**

### Property 12: Clarification Pauses Round
When needsClarification=true in any output, round SHALL pause until user responds.
**Validates: Requirements 1.5, 1.6**

### Property 13: Session List Completeness
All created sessions SHALL appear in session list.
**Validates: Requirements 9.1, 9.2**

### Property 14: Event Replay Ordering
Replay SHALL produce events in strictly ascending timestamp order.
**Validates: Requirements 9.3**

### Property 15: Problem Description Acceptance
Any non-empty string SHALL create a session.
**Validates: Requirements 1.3, 8.3**

### Property 16: Artifact Lifecycle Integrity
Every artifact SHALL have valid type, non-empty title, valid status, and monotonically increasing version. Status transitions SHALL only follow: draft→accepted, draft→rejected, accepted→draft.
**Validates: Requirements 12.3, 12.5, 12.6**

### Property 17: Structured Output Schema Conformance
Every processed agent output SHALL conform to the corresponding Zod schema. On validation failure, retry SHALL occur (max 2) before recording failure.
**Validates: Requirements 14.6, 14.7**

### Property 18: Token Budget Enforcement
Cumulative token usage SHALL be tracked for every LLM call. When budget exceeded, execution SHALL pause and require user approval.
**Validates: Requirements 15.1, 15.4**

### Property 19: Artifact Operations From Consensus
Consensus artifactOperations SHALL only reference valid operations (create/update/accept/reject) and SHALL produce corresponding artifact events. Operations whose `artifactId` does not match a real artifact in the session SHALL be skipped (logged via `console.warn`) rather than aborting the consensus stage — a single hallucinated ID from the consensus LLM must not be able to invalidate a successful round.
**Validates: Requirements 12.7, 14.5**

### Property 20: Context Window Budget Respected
The total tokens in agent context SHALL not exceed the configured Context_Window_Budget, with truncation applied in priority order.
**Validates: Requirements 13.8, 15.7**

### Property 22: Snapshot Consistency
State projected from full event log SHALL equal state loaded from latest snapshot + events since snapshot.
**Validates: Requirements 6.8**

### Property 23: Crash Recovery Correctness
After simulated mid-stage crash, recovery SHALL detect exactly the missing agents and re-execute only those agents.
**Validates: Requirements 6.9**
