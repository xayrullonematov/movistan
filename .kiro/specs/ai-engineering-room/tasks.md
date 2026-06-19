# Implementation Plan: AI Engineering Room

## Overview

This plan implements an event-sourced, outcome-focused web application where four autonomous AI agents collaborate through structured debate rounds to solve engineering design problems. The architecture produces structured engineering artifacts through real LLM API calls with Zod-validated outputs, context compression for scalability, and token budget management for cost control.

Implementation progresses incrementally: project scaffolding → domain types → persistence layer → structured schemas → context services → agent engine → API routes → frontend UI → integration and polish.

### Principal Architect Review — Addressed Weaknesses

1. **Sequential agent execution blocks UX** — Agents now execute in parallel within each stage via Promise.allSettled, reducing round latency by ~4x.
2. **Critique topology is flat** — CritiqueOutput now includes `targetAgentId` routing so each agent critiques a specific proposal rather than generating undirected commentary.
3. **Artifact deduplication missing** — ArtifactStore gains `findByTitleAndType` to prevent duplicate artifacts from multiple agents suggesting the same decision.
4. **Consensus synthesizer lacks grounding** — ConsensusOutput `artifactOperations` require explicit `sourceEventId` references back to the debate, ensuring every decision traces to evidence.
5. **Summary services are LLM-dependent** — WorkspaceSummaryService has a deterministic fallback (template-based summary from structured data) when LLM summary tier is unavailable or budget-constrained.
6. **No agent memory across sessions** — ContextAssembler supports an optional `priorSessionSummary` field allowing users to seed context from exported prior sessions.
7. **Provenance chain incomplete** — Every ArtifactVersion now requires a `sourceEventId` linking back to the exact event (proposal, critique, revision, or consensus) that triggered the artifact change.
8. **Round latency invisible to user** — Frontend shows per-agent progress indicators during stage execution, with streaming state updates as each agent completes.
9. **Consensus quality unverifiable** — ConsensusOutput includes `evidenceChain` arrays per agreement/disagreement that reference specific round events, enabling the user to verify claims.

## Tasks

- [x] 1. Project scaffolding and configuration
  - [x] 1.1 Initialize Next.js project with TypeScript, Tailwind CSS, and Prisma
    - Run `npx create-next-app@latest` with TypeScript and Tailwind CSS enabled
    - Install dependencies: `prisma`, `@prisma/client`, `swr`, `cuid`, `zod`
    - Initialize Prisma with SQLite provider
    - Configure `tsconfig.json` path aliases (`@/`)
    - Create `.env` with DATABASE_URL and placeholder LLM config
    - Verify the dev build compiles without errors
    - _Requirements: 10.1, 10.2, 10.3, 10.5, 10.8_

- [x] 2. Domain types and Prisma schema (all models before any logic)
  - [x] 2.1 Define complete Prisma schema
    - Create `prisma/schema.prisma` with all 6 models: Session, Event, Artifact, ArtifactVersion, TokenUsage, SessionSnapshot
    - Session: id, title, problemDescription, status, currentRound, currentStage, tokenBudget, lockedBy, lockedAt, timestamps
    - Event: id, sessionId, type (all 13 event types including stage-progress), agentId, round, stage, content, timestamp; indexes on [sessionId, timestamp] and [sessionId, round, stage]
    - Artifact: id, sessionId, type (6 types), title, content, status (3 states), createdByAgentId, version, timestamps; indexes on [sessionId, type] and [sessionId, status]; UNIQUE constraint on [sessionId, type, title] to prevent duplicates
    - ArtifactVersion: id, artifactId, version, content, agentId, reasoning, sourceEventId (required — links to the event that caused this version), timestamp; index on [artifactId, version]
    - TokenUsage: id, sessionId, agentId, round, stage, inputTokens, outputTokens, model, timestamp; indexes on [sessionId] and [sessionId, round]
    - SessionSnapshot: id, sessionId, round, state (JSON-serialized SessionState), createdAt; UNIQUE on [sessionId, round]; index on [sessionId]; relation to Session
    - Add relation from Session to SessionSnapshot[]
    - Run `npx prisma db push` and `npx prisma generate`
    - _Requirements: 6.1, 6.2, 6.8, 10.2, 10.9, 12.3, 15.1_

  - [x] 2.2 Create TypeScript domain types
    - Create `src/types/domain.ts` with ALL type definitions from the design document
    - Core enums: AgentType, EventType (13 types including stage-progress), RoundStage, Stance, ArtifactType, ArtifactStatus, Severity, ObjectionSeverity
    - Structured output interfaces: ProposalOutput, CritiqueOutput (with targetAgentId), RevisionOutput, ConsensusOutput (with sourceEventId references in artifactOperations and evidenceChain in agreements/disagreements)
    - State interfaces: SessionState, AgentState, RoundState, Constraint, ArtifactState, RoundSummary
    - Token interfaces: SessionTokenUsage, TokenUsageRecord, CostEstimate, BudgetStatus, ModelTierConfig
    - Context interfaces: WorkspaceContext (with optional priorSessionSummary field), PersistedEvent, NewEvent
    - Supporting types: ValidationResult, StageResult, StageTransition
    - Infrastructure types: SessionSnapshot, SessionLockState
    - Component interfaces: SnapshotManager, SessionLock, CrashRecovery
    - Provenance types: ArtifactVersion must include sourceEventId
    - _Requirements: 10.5, 14.1-14.5, 6.8, 6.9, 3.9, 12.2, 15.1_

- [x] 3. Structured output Zod schemas
  - [x] 3.1 Define ProposalOutput Zod schema
    - Create `src/schemas/proposal-output.ts`
    - Define schema with: summary, recommendations[], risks[] (description, severity, mitigation?), assumptions[], confidence (0-1), artifactSuggestions[] (type, title, content), references[] (agentId?, artifactId?, description), needsClarification, clarificationQuestions?[]
    - Export both schema and inferred TypeScript type
    - _Requirements: 14.1, 14.2_

  - [x] 3.2 Define CritiqueOutput Zod schema
    - Create `src/schemas/critique-output.ts`
    - Define schema with: summary, targetAgentId (REQUIRED — which agent's proposal is being critiqued), objections[] (point, reasoning, severity), acknowledgedStrengths[], confidence, riskAssessments[], artifactSuggestions[], references[], needsClarification, clarificationQuestions?[]
    - Validate targetAgentId is a valid AgentType and is not the critiquing agent's own ID
    - _Requirements: 14.1, 14.3_

  - [x] 3.3 Define RevisionOutput Zod schema
    - Create `src/schemas/revision-output.ts`
    - Define schema with: summary, stance, concededPoints[] (point, reasoning), maintainedPoints[] (point, reasoning), newArguments[], confidence, artifactSuggestions[], needsClarification, clarificationQuestions?[]
    - Validate: when stance is "partially-concede", concededPoints must be non-empty
    - _Requirements: 14.1, 14.4_

  - [x] 3.4 Define ConsensusOutput Zod schema
    - Create `src/schemas/consensus-output.ts`
    - Define schema with: agreements[] (point, supportingAgents, reasoning, evidenceChain: string[]), disagreements[] (point, positions[], evidenceChain: string[]), recommendedDecisions[] (title, description, confidence), identifiedRisks[] (description, severity, raisedBy[]), openQuestions[], overallConfidence, artifactOperations[] (operation, artifactId?, type?, title, content, sourceEventId?)
    - evidenceChain: array of event IDs that support the agreement/disagreement claim — enables user verification
    - _Requirements: 14.1, 14.5_

  - [x]* 3.5 Write property test — Structured Output Schema Conformance
    - **Property 17: Structured Output Schema Conformance**
    - Generate random valid and invalid outputs, verify schema correctly accepts/rejects
    - Verify retry logic triggers on invalid outputs
    - Verify CritiqueOutput rejects self-targeting (targetAgentId === critiquing agent)
    - **Validates: Requirements 14.6, 14.7**

- [x] 4. Event Store and State Projector
  - [x] 4.1 Implement the Event Store
    - Create `src/lib/event-store.ts` implementing EventStore interface
    - appendEvent: persist via Prisma, serialize content to JSON, auto-generate id/timestamp
    - getSessionEvents: return all events ordered by timestamp
    - getRoundEvents: filter by sessionId, round, optional stage
    - getEventsUpTo: filter events before a given timestamp
    - _Requirements: 6.1, 6.2, 6.3, 6.4_

  - [x]* 4.2 Write property test — Event Structural Integrity
    - **Property 2: Event Structural Integrity**
    - Verify all persisted events have valid type, timestamp, round ≥ 0, non-empty content
    - Verify agent events have non-null agentId from allowed set
    - **Validates: Requirements 6.2, 6.3**

  - [x] 4.3 Implement the State Projector
    - Create `src/lib/state-projector.ts` implementing StateProjector interface
    - projectSessionState: fold events into SessionState (handle all 12 event types including artifact events)
    - projectStateAtIndex: project first N events for replay
    - Handle artifact events: artifact-created adds to artifacts[], artifact-updated modifies content/version, artifact-status-changed updates status
    - _Requirements: 6.4, 6.6, 9.2, 12.8, 12.9_

  - [x]* 4.4 Write property test — Event Sourcing Round-Trip
    - **Property 1: Event Sourcing Round-Trip**
    - Verify projecting same events always produces identical SessionState
    - **Validates: Requirements 6.4, 6.6, 9.2**

  - [x]* 4.5 Write property test — Session Agent Invariant
    - **Property 8: Session Agent Invariant**
    - Verify any projected state always has exactly 4 agents
    - **Validates: Requirements 1.2**

  - [x] 4.6 Implement SnapshotManager
    - Create `src/lib/snapshot-manager.ts`
    - createSnapshot: serialize SessionState to JSON, persist as SessionSnapshot after each round
    - getLatestSnapshot: find most recent snapshot for session
    - projectFromSnapshot: load latest snapshot, then replay only events SINCE that snapshot's round
    - Used by session detail API to avoid O(n) full projection on every request
    - _Requirements: 6.8_

  - [x]* 4.7 Write property test — Snapshot Consistency
    - **Property 22**
    - Full event projection equals snapshot + incremental events
    - **Validates: Requirements 6.8**

- [x] 5. Artifact Store (with deduplication and provenance)
  - [x] 5.1 Implement the Artifact Store
    - Create `src/lib/artifact-store.ts` implementing ArtifactStore interface
    - createArtifact: create Artifact + first ArtifactVersion (with sourceEventId), persist artifact-created event; BEFORE creating, check for existing artifact with same sessionId+type+title — if found, update instead of creating duplicate
    - updateArtifact: update content, increment version, create ArtifactVersion (with sourceEventId and reasoning), persist artifact-updated event
    - changeStatus: validate transition (draft→accepted, draft→rejected, accepted→draft), update status, persist artifact-status-changed event
    - findByTitleAndType: lookup existing artifact by sessionId, type, and normalized title (case-insensitive match) — used for deduplication
    - getSessionArtifacts: return all artifacts for session
    - getArtifactVersions: return version history with provenance (sourceEventId, agentId, reasoning per version)
    - _Requirements: 12.1-12.10_

  - [x]* 5.2 Write property test — Artifact Lifecycle Integrity
    - **Property 16: Artifact Lifecycle Integrity**
    - Verify valid type, non-empty title, valid status, monotonically increasing version
    - Verify only valid status transitions
    - Verify no duplicate artifacts with same sessionId+type+title
    - Verify every ArtifactVersion has non-null sourceEventId
    - **Validates: Requirements 12.3, 12.5, 12.6**

  - [x] 5.3 Implement SessionLock
    - Create `src/lib/session-lock.ts`
    - acquire: atomically set lockedBy + lockedAt on Session WHERE lockedBy IS NULL (or lockedAt > 5 min ago for stale lock recovery)
    - release: clear lockedBy + lockedAt WHERE lockedBy = lockId
    - isLocked: check lockedBy is not null and lockedAt is within 5 minutes
    - forceRelease: unconditionally clear lock (for admin/recovery)
    - _Requirements: 3.9_

- [x] 6. Checkpoint — Domain layer tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 7. Token Budget Manager
  - [x] 7.1 Implement TokenBudgetManager
    - Create `src/lib/token-budget-manager.ts` implementing TokenBudgetManager interface
    - trackUsage: persist TokenUsage record via Prisma
    - getSessionUsage: aggregate usage by round, by agent, calculate estimated cost
    - estimateRoundCost: estimate upcoming round cost based on current context size and model pricing; account for parallel execution (4 agents × context size)
    - checkBudget: compare cumulative usage against session tokenBudget, return BudgetStatus with warning at 80% threshold
    - Support configurable pricing per model (input/output token rates)
    - _Requirements: 15.1-15.8_

  - [x]* 7.2 Write property test — Token Budget Enforcement
    - **Property 18: Token Budget Enforcement**
    - Verify usage tracked for every call, budget exceeded triggers pause
    - **Validates: Requirements 15.1, 15.4**

- [x] 8. LLM Provider and Agent Configuration
  - [x] 8.1 Implement LLM Provider with model tier support
    - Create `src/lib/llm-provider.ts` implementing LLMProvider interface
    - Support configurable API endpoint, model, API key via environment variables
    - Accept modelOverride parameter for tier-based model selection
    - Implement retry logic (3 retries, exponential backoff: 1s, 2s, 4s)
    - Handle rate-limit (respect Retry-After header), timeout (30s default), invalid-response, api-error
    - Track and return token usage in response
    - Support request cancellation via AbortController for budget-exceeded scenarios
    - _Requirements: 2.1, 2.8, 10.7, 15.6_

  - [x] 8.2 Create agent configurations
    - Create `src/lib/agent-configs.ts` with AGENT_CONFIGS constant
    - Define 4 agents with distinct objective functions, evaluation criteria, conflicting priorities
    - Define critique routing: opposing pairs (Senior↔Performance, Security↔Product). Each agent critiques exactly ONE other agent's proposal (4 critiques total per round, not 12). This reduces cost by 66% while maintaining focused cross-discipline tension.
    - Export ModelTierConfig defaults and helper to get config by AgentType
    - _Requirements: 2.2-2.5, 11.4_

  - [x]* 8.3 Write property test — Agent Prompt Includes Objective Function
    - **Property 3: Agent Prompt Includes Objective Function**
    - Verify each agent has unique, non-empty objective function
    - **Validates: Requirements 2.2-2.5, 2.7**

- [ ] 9. Context Compression Services (with deterministic fallback)
  - [~] 9.1 Implement WorkspaceSummaryService
    - Create `src/lib/workspace-summary-service.ts`
    - generateSummary: use LLM (summary tier) to produce compressed workspace summary; ON FAILURE OR BUDGET CONSTRAINT: fall back to deterministic template-based summary built from structured data (artifact titles + statuses, constraint list, round count, last consensus points)
    - getSummary: return cached summary (regenerated after each round)
    - Deterministic fallback format: "Session: {title}. Problem: {first 200 chars}. Rounds completed: {N}. Artifacts: {count} ({accepted} accepted). Constraints: {list}. Last consensus: {points}."
    - _Requirements: 13.1, 13.6_

  - [~] 9.2 Implement RoundSummaryService
    - Create `src/lib/round-summary-service.ts`
    - generateRoundSummary: after round completion, use LLM to produce condensed summary; ON FAILURE: fall back to deterministic extraction from structured outputs (proposal summaries, objection counts, stance changes, consensus agreements)
    - getRoundSummaries: return all round summaries for session
    - _Requirements: 13.2, 13.6_

  - [~] 9.3 Implement ArtifactSummaryService
    - Create `src/lib/artifact-summary-service.ts`
    - generateArtifactSummary: produce current artifact state (titles, types, statuses, key content excerpts — first 150 chars of content per artifact)
    - This service is ALWAYS deterministic (no LLM call needed — artifacts are already structured)
    - _Requirements: 13.3_

  - [x] 9.4 Implement ContextAssembler
    - Create `src/lib/context-assembler.ts` implementing ContextAssembler interface
    - assembleContext: combine workspace summary + artifact summaries + round summaries + current round events + constraints + optional priorSessionSummary
    - Apply Context_Window_Budget: prioritize current round events > artifacts > constraints > workspace summary > round summaries > prior session context (truncate lowest priority first)
    - Token estimation using tiktoken-compatible counting (or character-based heuristic: chars/4)
    - priorSessionSummary: optional field populated when user seeds a session from an exported prior session
    - _Requirements: 13.4, 13.5, 13.7, 13.8, 15.7_

  - [x]* 9.5 Write property test — Context Uses Summaries Not Full History
    - **Property 4: Context Uses Summaries Not Full History**
    - Verify agents receive round summaries (not full events) for prior rounds
    - Verify context window budget is respected
    - Verify deterministic fallback produces valid summary when LLM unavailable
    - **Validates: Requirements 2.6, 2.9, 13.4, 13.5**

  - [x]* 9.6 Write property test — Context Window Budget Respected
    - **Property 20: Context Window Budget Respected**
    - Verify total context tokens don't exceed budget, truncation follows priority order
    - **Validates: Requirements 13.8, 15.7**

- [ ] 10. Output Validator and Prompt Builder
  - [~] 10.1 Implement OutputValidator
    - Create `src/lib/output-validator.ts` implementing OutputValidator interface
    - validateProposal: parse JSON, validate against ProposalOutput Zod schema
    - validateCritique: parse JSON, validate against CritiqueOutput Zod schema; additionally verify targetAgentId is not the critiquing agent's own ID
    - validateRevision: parse JSON, validate against RevisionOutput Zod schema; verify partially-concede has non-empty concededPoints
    - validateConsensus: parse JSON, validate against ConsensusOutput Zod schema
    - Return ValidationResult<T> (success with data, or failure with errors + raw)
    - On validation failure: construct re-prompt message including the specific Zod errors
    - _Requirements: 14.6, 14.7_

  - [~] 10.2 Implement PromptBuilder
    - Create `src/lib/prompt-builder.ts` implementing PromptBuilder interface
    - buildProposalPrompt: system prompt (agent identity + objective + schema definition) + user message (workspace context + task)
    - buildCritiquePrompt: include all proposals + critique schema definition; EXPLICITLY instruct agent to set targetAgentId to the specific proposal being critiqued; generate one critique call PER target proposal (not a single critique of all proposals)
    - buildRevisionPrompt: include only critiques received BY this agent + revision schema definition
    - buildConsensusPrompt: include full round history + consensus schema + instruction to include evidenceChain event IDs
    - All prompts include the expected JSON output schema in the system prompt
    - Include explicit instruction: "Return ONLY valid JSON matching the schema. No markdown, no preamble."
    - _Requirements: 2.6, 2.7, 14.9_

  - [x]* 10.3 Write property test — Workspace Context Completeness
    - Verify all prompts include problem, constraints, artifact state
    - Verify schema definition is included in every prompt
    - Verify critique prompts route to specific target agents
    - **Validates: Requirements 2.6, 14.9**

- [x] 11. Agent Executor and Round Orchestrator (with parallel execution)
  - [~] 11.1 Implement Agent Executor
    - Create `src/lib/agent-executor.ts` implementing AgentExecutor interface
    - generateProposal: assemble context → build prompt → select model tier → call LLM → validate output (retry 2x) → track tokens → process artifacts (with dedup check) → return
    - generateCritique: for the ASSIGNED target proposal (one per agent, based on opposing-pair routing) → build critique prompt → call LLM → validate → track; produces 1 critique per agent, 4 total per round
    - generateRevision: filter critiques received by this agent → build revision prompt → call LLM → validate → track → process artifacts → return
    - synthesizeConsensus: build consensus prompt with full round events → call LLM → validate → track → return
    - On final validation failure: persist raw with validation-failure event, use degraded output (extract summary from raw text as fallback)
    - _Requirements: 2.1, 3.2-3.6, 14.6, 14.7_

  - [~] 11.2 Implement Round Orchestrator (parallel execution per stage)
    - Create `src/lib/round-orchestrator.ts` implementing RoundOrchestrator interface
    - startRound: persist round-started event, set stage to proposal
    - BEFORE starting stage: acquire SessionLock (fail with 409 Conflict if locked)
    - executeCurrentStage: execute ALL 4 agents IN PARALLEL using Promise.allSettled; collect results; persist events for successful agents; handle individual failures gracefully (one agent failing doesn't block others)
    - AS EACH agent completes: persist stage-progress event immediately (not batched) so frontend can show real-time progress
    - AFTER stage completes: batch-write all agent result events in single transaction
    - Per-agent progress: emit intermediate state updates as each agent completes (for frontend streaming)
    - checkAndAdvance: verify all agents completed (or failed with fallback) → check needsClarification → advance or pause
    - Clarification protocol: if ANY output has needsClarification=true → aggregate questions → persist clarification-request → pause
    - handleIntervention: persist user-intervention, add constraint
    - skipIntervention: advance to next round
    - After consensus: execute artifact operations (create/update/accept/reject) with deduplication via findByTitleAndType
    - AFTER round completes: create SessionSnapshot via SnapshotManager; release SessionLock
    - ALL writes within a stage use a single prisma.$transaction to prevent SQLite write contention
    - After round complete: trigger summary generation (round + workspace + artifact)
    - _Requirements: 3.1, 3.7, 3.8, 3.9, 3.10, 1.5, 1.6, 5.1, 5.4, 6.8, 10.9, 12.7_

  - [x]* 11.3 Write property test — Round Stage Ordering Invariant
    - **Property 5: Round Stage Ordering Invariant**
    - Events appear in strict stage order within a round
    - **Validates: Requirements 3.1, 3.7**

  - [x]* 11.4 Write property test — Clarification Pauses Round
    - **Property 12: Clarification Pauses Round**
    - needsClarification=true in any output pauses round
    - **Validates: Requirements 1.5, 1.6**

  - [x]* 11.5 Write property test — Auto-Advance After Completion
    - **Property 11: Auto-Advance After Stage Completion**
    - Stages advance when all agents complete with valid outputs
    - Verify parallel execution: all 4 agents invoked concurrently (not sequentially)
    - **Validates: Requirements 3.7, 3.8**

  - [x]* 11.6 Write property test — Artifact Operations From Consensus
    - **Property 19: Artifact Operations From Consensus**
    - Consensus artifactOperations produce corresponding artifact events
    - Verify deduplication: identical title+type does not create duplicate artifact
    - **Validates: Requirements 12.7, 14.5**

  - [x]* 11.7 Write property test — Provenance Chain Completeness
    - **Property 21: Provenance Chain Completeness**
    - Every ArtifactVersion has a non-null sourceEventId that references a valid event in the session
    - Every consensus agreement/disagreement has non-empty evidenceChain referencing valid event IDs
    - **Validates: Requirements 12.4, 12.5**

  - [~] 11.8 Implement CrashRecovery
    - Create `src/lib/crash-recovery.ts`
    - detectIncompleteRound: query Session for active round, check events to find which agents have stage-progress events for current stage
    - recoverIncompleteStage: return list of agents that did NOT complete; orchestrator re-executes only those
    - Called on application startup for any session with status='active' and a locked state
    - _Requirements: 6.9_

  - [x]* 11.9 Write property test — Crash Recovery Correctness
    - **Property 23**
    - After simulated mid-stage crash, recovery detects exactly missing agents
    - **Validates: Requirements 6.9**

- [x] 12. Checkpoint — Engine tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [ ] 13. API Routes — Session and Event Management
  - [~] 13.1 Implement session creation and listing
    - Create `src/app/api/sessions/route.ts` (GET list, POST create)
    - POST: accept problemDescription, optional constraints, optional tokenBudget, optional priorSessionSummary (for seeding from exported sessions); create Session; persist session-created event; return session with agents
    - GET: return all sessions with basic info
    - _Requirements: 1.1, 1.3, 9.1_

  - [~] 13.2 Implement session detail
    - Create `src/app/api/sessions/[sessionId]/route.ts` (GET)
    - Use SnapshotManager.projectFromSnapshot() instead of full event replay for O(1) state reconstruction on every request
    - Return full SessionState including artifacts and token usage
    - _Requirements: 6.4, 6.8, 9.2_

  - [~] 13.3 Implement event log
    - Create `src/app/api/sessions/[sessionId]/events/route.ts` (GET)
    - Return events ordered by timestamp with total count
    - _Requirements: 6.2, 6.3_

  - [ ]* 13.4 Write property test — Problem Description Acceptance
    - **Property 15**
    - **Validates: Requirements 1.3, 8.3**

  - [ ]* 13.5 Write property test — Constraint Persistence Round-Trip
    - **Property 7**
    - **Validates: Requirements 1.4, 5.2**

- [ ] 14. API Routes — Rounds, Intervention, Artifacts
  - [~] 14.1 Implement round start
    - Create `src/app/api/sessions/[sessionId]/rounds/route.ts` (POST)
    - Acquire SessionLock before starting. If locked, return 409 Conflict.
    - Validate session state, check budget (warn at 80%, block at 100%), start round, trigger parallel execution
    - Include cost estimate in response. Show per-agent progress via polling stage-progress events.
    - Return immediately with round number; execution happens asynchronously
    - _Requirements: 3.1, 3.2, 3.9, 15.3_

  - [~] 14.2 Implement round detail
    - Create `src/app/api/sessions/[sessionId]/rounds/[roundNumber]/route.ts` (GET)
    - Return round-specific events, per-agent completion status, and projected round state
    - _Requirements: 3.1_

  - [~] 14.3 Implement intervention
    - Create `src/app/api/sessions/[sessionId]/intervene/route.ts` (POST)
    - Accept constraint text + optional category, persist event
    - _Requirements: 5.1, 5.2, 5.6_

  - [~] 14.4 Implement advance (skip intervention)
    - Create `src/app/api/sessions/[sessionId]/advance/route.ts` (POST)
    - _Requirements: 5.4_

  - [~] 14.5 Implement artifact CRUD
    - Create `src/app/api/sessions/[sessionId]/artifacts/route.ts` (GET list, POST create)
    - Create `src/app/api/sessions/[sessionId]/artifacts/[artifactId]/route.ts` (GET detail with version history + provenance, PATCH update, PUT status change)
    - GET detail: include full version history with sourceEventId per version enabling UI to show "this change was triggered by [event link]"
    - _Requirements: 12.1-12.10_

  - [~] 14.6 Implement token usage endpoint
    - Create `src/app/api/sessions/[sessionId]/token-usage/route.ts` (GET)
    - Return SessionTokenUsage aggregated by round and agent, include cost estimate and budget status
    - _Requirements: 15.1, 15.5_

- [ ] 15. API Routes — Export, Replay, Config
  - [~] 15.1 Implement session export
    - Create `src/app/api/sessions/[sessionId]/export/route.ts` (GET)
    - Create `src/lib/export.ts` with markdown generation
    - Include: problem, constraints, artifacts (with full provenance: who contributed what and why), debate summary, agent positions, consensus with evidence chains, cost summary
    - Export format should be importable as `priorSessionSummary` for follow-up sessions
    - _Requirements: 9.4, 9.5, 15.8_

  - [ ]* 15.2 Write property test — Export Completeness
    - **Property 10**
    - **Validates: Requirements 9.4, 9.5**

  - [~] 15.3 Implement replay
    - Create `src/app/api/sessions/[sessionId]/replay/route.ts` (GET)
    - Return events in timestamp order, support step-to-index
    - _Requirements: 9.3_

  - [ ]* 15.4 Write property test — Event Replay Ordering
    - **Property 14**
    - **Validates: Requirements 9.3**

  - [~] 15.5 Implement config endpoint
    - Create `src/app/api/config/route.ts` (GET/PUT)
    - LLM config + model tier config + token budget defaults + context window budget
    - Never expose API key in GET response
    - _Requirements: 10.7, 15.6_

- [~] 16. Checkpoint — API tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [ ] 17. Frontend — Layout and Session Management
  - [~] 17.1 Create root layout and global styles
    - Create `src/app/layout.tsx` with Tailwind, dark-mode color scheme
    - _Requirements: 10.3, 7.1_

  - [~] 17.2 Implement home page with session list and new session form
    - Create `src/app/page.tsx`
    - Create `src/components/session/SessionList.tsx`
    - Create `src/components/session/NewSessionForm.tsx` (free-form text + optional constraints + optional token budget + optional prior session import)
    - Create `src/components/session/ConstraintInput.tsx`
    - Wire to sessions API
    - _Requirements: 1.1, 1.3, 8.1-8.6, 9.1_

- [ ] 18. Frontend — Primary Panel (Artifacts + Outcomes)
  - [~] 18.1 Create workspace layout (outcome-focused)
    - Create `src/app/sessions/[sessionId]/page.tsx`
    - Create `src/components/workspace/WorkspaceLayout.tsx` with CSS Grid: Primary (60%) + Secondary (30% collapsible) + Tertiary (10% collapsible)
    - Header: session title, status, round indicator, token usage badge
    - Footer: action buttons (new round, end, export) + budget indicator
    - _Requirements: 7.1, 7.8, 16.1_

  - [~] 18.2 Implement ArtifactsPanel (with provenance)
    - Create `src/components/workspace/ArtifactsPanel.tsx`
    - Create `src/components/workspace/ArtifactCard.tsx` (type icon, title, status badge, contributors, version count)
    - Create `src/components/workspace/ArtifactDetail.tsx` (expandable content, version history with per-version provenance: "v2 by Security Engineer — triggered by critique of Senior Engineer's proposal")
    - Display artifacts prominently as primary view
    - _Requirements: 12.10, 16.2, 7.3_

  - [~] 18.3 Implement EngineeringOutcomesPanel
    - Create `src/components/workspace/EngineeringOutcomesPanel.tsx`
    - Create `src/components/workspace/DecisionLog.tsx` (accepted decisions + provenance + evidence chain links)
    - Create `src/components/workspace/RiskRegister.tsx` (risks + severity + which agents raised them)
    - Create `src/components/workspace/OpenQuestions.tsx`
    - _Requirements: 7.4, 16.3, 16.4, 16.8_

  - [~] 18.4 Implement SharedWorkspace and InterventionPanel
    - Create `src/components/workspace/SharedWorkspace.tsx` (problem, constraints)
    - Create `src/components/workspace/InterventionPanel.tsx` (constraint input + skip/submit)
    - _Requirements: 5.1, 5.5, 7.7, 16.1_

- [ ] 19. Frontend — Secondary and Tertiary Panels
  - [~] 19.1 Implement Agent Panels (collapsible secondary) with progress streaming
    - Create `src/components/workspace/AgentPanel.tsx` (name, stance badge, confidence %, current position, artifact contributions)
    - Show per-agent progress indicator during stage execution: "thinking..." → "complete" as each agent finishes (since agents run in parallel, they complete at different times)
    - Create `src/components/ui/StanceBadge.tsx`
    - Create `src/components/ui/ConfidenceBadge.tsx`
    - _Requirements: 7.6, 16.5_

  - [~] 19.2 Implement ConsensusDashboard (with evidence verification)
    - Create `src/components/workspace/ConsensusDashboard.tsx` (agreements, disagreements, recommendations)
    - Each agreement/disagreement shows clickable evidence chain: links to specific events in the timeline that support the claim
    - _Requirements: 4.4, 4.5_

  - [~] 19.3 Implement DebateTimeline (collapsible tertiary/audit trail)
    - Create `src/components/workspace/DebateTimeline.tsx`
    - Create `src/components/ui/TimelineEvent.tsx`
    - Create `src/components/workspace/RoundProgressIndicator.tsx` (shows which agents have completed current stage in real-time)
    - Support deep-linking: evidence chain links from ConsensusDashboard scroll to specific events
    - _Requirements: 7.5, 16.6_

  - [~] 19.4 Implement UI utilities
    - Create `src/components/ui/MarkdownRenderer.tsx`
    - Create `src/components/ui/TokenUsageBadge.tsx`
    - _Requirements: 7.9, 7.10, 15.5_

- [ ] 20. Frontend — Data Fetching Hooks
  - [~] 20.1 Implement SWR hooks
    - Create `src/hooks/useSession.ts` (2s polling during active rounds, 500ms during active stage for per-agent progress)
    - Create `src/hooks/useEventStream.ts` (1s polling during active rounds)
    - Create `src/hooks/useArtifacts.ts` (artifact state)
    - Create `src/hooks/useTokenUsage.ts` (token stats)
    - Create `src/hooks/useRoundProgress.ts` (per-agent completion status during parallel execution)
    - _Requirements: 7.8, 15.5_

- [~] 21. Checkpoint — Frontend renders correctly
  - Ensure all tests pass, ask the user if questions arise.

- [ ] 22. Integration — Wire Frontend to Backend
  - [~] 22.1 Wire round execution flow
    - Connect "Start Round" to POST /rounds (returns immediately; UI polls for progress)
    - Connect intervention submit to POST /intervene
    - Connect skip to POST /advance
    - Show per-agent progress indicators during parallel execution
    - Handle budget exceeded state (show warning, require approval)
    - _Requirements: 3.1, 5.1, 5.4, 15.3, 15.4_

  - [~] 22.2 Wire artifact interactions
    - Display artifacts from session state
    - Allow manual artifact creation via POST /artifacts
    - Allow status changes via PUT /artifacts/[id]
    - Show provenance (version history with source event links)
    - Update UI reactively on artifact changes
    - _Requirements: 12.1-12.10_

  - [~] 22.3 Wire export and replay
    - Export button triggers markdown download
    - Replay controls step through events chronologically
    - Import prior session summary when creating new session
    - _Requirements: 9.3, 9.4_

  - [~] 22.4 Wire clarification flow
    - Detect clarification-needed state from session
    - Display aggregated questions from all agents
    - User response creates constraint event and resumes round
    - _Requirements: 1.5-1.8_

  - [ ]* 22.5 Write property test — Session List Completeness
    - **Property 13**
    - **Validates: Requirements 9.1, 9.2**

- [ ] 23. Polish — Error Handling and Session Resume
  - [~] 23.1 Implement error handling
    - Create `src/lib/error-handling.ts` with retry policies and error types
    - LLM failures: retry with backoff, on final failure persist error event; since agents run in parallel, one agent failing does not block others — mark failed agent as "unavailable" for this stage and continue
    - Validation failures: re-prompt (max 2), then persist raw with metadata and extract degraded output
    - Budget exceeded: pause and require user approval
    - Partially-completed work preserved in event log
    - _Requirements: 14.7, 15.4_

  - [~] 23.2 Implement session resume
    - Verify active sessions reconstructed from event log on restart
    - Handle in-progress rounds: check which agents completed (events exist) and which didn't; re-execute only incomplete agents
    - _Requirements: 6.6, 9.6_

  - [ ]* 23.3 Write property test — Consensus Derives From Debate
    - **Property 9**
    - Verify consensus evidenceChain references are valid event IDs from the current round
    - **Validates: Requirements 4.1, 4.3**

- [~] 24. Final checkpoint — All tests pass
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Tasks marked with `*` are property-based tests (optional for faster MVP but recommended)
- ALL domain models and schemas are defined BEFORE any LLM integration (Tasks 2-3 before Tasks 8-11)
- Structured output schemas use Zod for runtime validation
- Context compression services ensure scalability across many rounds with deterministic fallbacks
- Token budget management provides cost visibility and control
- The UI is outcome-focused: artifacts and decisions are primary, debate is secondary
- No text-based heuristic detection for clarification — agents use structured needsClarification field
- Model tiering allows cost optimization (use cheaper models for critiques/revisions)
- Event sourcing preserves full history for replay/audit while agents receive compressed context
- PARALLEL EXECUTION: all 4 agents run concurrently within each stage (Promise.allSettled)
- CRITIQUE ROUTING: each critique targets a specific agent's proposal (not undirected)
- ARTIFACT DEDUPLICATION: same title+type within a session updates existing artifact rather than creating duplicates
- PROVENANCE: every artifact version links to the source event that triggered it
- EVIDENCE CHAINS: consensus agreements/disagreements reference specific event IDs for verifiability
- DETERMINISTIC FALLBACK: summary services produce template-based summaries when LLM is unavailable
- PRIOR SESSION SEEDING: new sessions can import context from exported prior sessions

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1"] },
    { "id": 1, "tasks": ["2.1", "2.2"] },
    { "id": 2, "tasks": ["3.1", "3.2", "3.3", "3.4"] },
    { "id": 3, "tasks": ["3.5", "4.1"] },
    { "id": 4, "tasks": ["4.2", "4.3"] },
    { "id": 5, "tasks": ["4.4", "4.5", "4.6", "5.1"] },
    { "id": 6, "tasks": ["4.7", "5.2", "5.3", "7.1"] },
    { "id": 7, "tasks": ["7.2", "8.1", "8.2"] },
    { "id": 8, "tasks": ["8.3", "9.1", "9.2", "9.3"] },
    { "id": 9, "tasks": ["9.4", "9.5", "9.6"] },
    { "id": 10, "tasks": ["10.1", "10.2"] },
    { "id": 11, "tasks": ["10.3", "11.1"] },
    { "id": 12, "tasks": ["11.2"] },
    { "id": 13, "tasks": ["11.3", "11.4", "11.5", "11.6", "11.7", "11.8", "11.9"] },
    { "id": 14, "tasks": ["13.1", "13.2", "13.3"] },
    { "id": 15, "tasks": ["13.4", "13.5", "14.1", "14.2", "14.3", "14.4"] },
    { "id": 16, "tasks": ["14.5", "14.6", "15.1"] },
    { "id": 17, "tasks": ["15.2", "15.3", "15.5"] },
    { "id": 18, "tasks": ["15.4", "17.1"] },
    { "id": 19, "tasks": ["17.2", "18.1"] },
    { "id": 20, "tasks": ["18.2", "18.3", "18.4"] },
    { "id": 21, "tasks": ["19.1", "19.2", "19.3", "19.4"] },
    { "id": 22, "tasks": ["20.1"] },
    { "id": 23, "tasks": ["22.1", "22.2", "22.3", "22.4"] },
    { "id": 24, "tasks": ["22.5", "23.1", "23.2"] },
    { "id": 25, "tasks": ["23.3"] }
  ]
}
```
