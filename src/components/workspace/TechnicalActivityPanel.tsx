"use client";

import { useState } from "react";
import { PanelLeftClose, PanelLeftOpen } from "lucide-react";
import type { SessionState, RoundStage, PersistedEvent, AgentType } from "@/types/domain";
import type { StageTransition } from "@/hooks/useEventStream";
import StageProgressBar from "./StageProgressBar";
import AgentArena from "./AgentArena";
import AgentStrip from "./AgentStrip";
import DebateChat from "./DebateChat";
import TokenBudgetBar from "./TokenBudgetBar";
import RoundEtaIndicator from "./RoundEtaIndicator";
import StageTransitionToast from "./StageTransitionToast";

interface TechnicalActivityPanelProps {
  session: SessionState & { tokenBudget?: number | null };
  events: PersistedEvent[];
  lastEventByAgent: Partial<Record<AgentType, PersistedEvent>>;
  completedStages: RoundStage[];
  totalTokens: number;
  budgetCeiling: number;
  onEditBudget: () => void;
  stageTransitions: StageTransition[];
}

const stageOrder: RoundStage[] = ["proposal", "critique", "revision", "consensus"];

export default function TechnicalActivityPanel({
  session,
  events,
  lastEventByAgent,
  completedStages,
  totalTokens,
  budgetCeiling,
  onEditBudget,
  stageTransitions,
}: TechnicalActivityPanelProps) {
  const [agentArenaExpanded, setAgentArenaExpanded] = useState(false);
  const isActiveRound =
    session.currentStage !== null && session.currentStage !== "awaiting-intervention";

  return (
    <div className="flex h-full min-h-0 overflow-hidden">
      <StageTransitionToast transitions={stageTransitions} />
      {/* Left Column: Agent Arena */}
      <aside
        className={`hidden shrink-0 flex-col overflow-hidden border-r border-[var(--border)] transition-all duration-200 md:flex ${
          agentArenaExpanded
            ? "md:w-72 lg:w-80 xl:w-[22rem]"
            : "md:w-56 lg:w-56 xl:w-56"
        }`}
      >
        <div className="flex min-h-12 items-center justify-between border-b border-[var(--border)] px-3">
          <p className="truncate text-sm font-semibold text-[var(--text-primary)]">AI Reviewers</p>
          <button
            type="button"
            onClick={() => setAgentArenaExpanded((e) => !e)}
            className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-[var(--border)] bg-[var(--surface)] text-[var(--text-muted)] transition-colors hover:border-[var(--text-muted)] hover:bg-[var(--surface-elevated)] hover:text-[var(--text-primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--violet-glow)]"
            aria-label={agentArenaExpanded ? "Collapse panel" : "Expand panel"}
          >
            {agentArenaExpanded ? <PanelLeftClose size={16} /> : <PanelLeftOpen size={16} />}
          </button>
        </div>
        <AgentArena
          agents={session.agents}
          currentStage={session.currentStage}
          activeAgentId={undefined}
          lastEventByAgent={lastEventByAgent}
          compact={!agentArenaExpanded}
          onRequestExpand={() => setAgentArenaExpanded(true)}
        />
      </aside>

      {/* Main content */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {/* Stage progress + ETA */}
        {isActiveRound && (
          <div className="relative shrink-0">
            <StageProgressBar
              currentStage={session.currentStage}
              completedStages={completedStages}
              currentRound={session.currentRound}
            />
            <div className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2">
              <RoundEtaIndicator
                events={events}
                currentRound={session.currentRound}
                currentStage={session.currentStage}
              />
            </div>
          </div>
        )}

        {/* Mobile agent strip */}
        <div className="md:hidden">
          <AgentStrip
            agents={session.agents}
            currentStage={session.currentStage}
            activeAgentId={undefined}
            lastEventByAgent={lastEventByAgent}
          />
        </div>

        {/* Token budget bar */}
        <div className="shrink-0 px-3 py-2 border-b border-[var(--border)]">
          <TokenBudgetBar
            used={totalTokens}
            total={budgetCeiling}
            estimatedCost={session.tokenUsage.estimatedCostUsd}
            onEditBudget={onEditBudget}
          />
        </div>

        {/* Debate chat (scrollable) */}
        <div className="flex-1 min-h-0 overflow-hidden">
          <DebateChat
            sessionId={session.id}
            currentRound={session.currentRound}
            currentStage={session.currentStage}
          />
        </div>

        {/* Round dots */}
        {session.currentRound > 0 && (
          <div className="hidden md:flex items-center justify-center gap-1.5 border-t border-[var(--border)] px-4 py-2 shrink-0">
            {Array.from({ length: session.currentRound }, (_, i) => (
              <div
                key={i}
                className="w-2 h-2 rounded-full bg-[var(--brand-violet)]"
                title={`Pass ${i + 1}`}
              />
            ))}
            {session.status === "active" && (
              <div className="w-2 h-2 rounded-full border border-[var(--border)]" title="Next pass" />
            )}
          </div>
        )}
      </div>
    </div>
  );
}
