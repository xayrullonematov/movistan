"use client";

import { useState, useMemo, useEffect, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import {
  ArrowLeft,
  Loader2,
  CheckCircle,
  Pause,
  ArrowRight,
  Play,
} from "lucide-react";
import type { SessionState, RoundStage, ArtifactType, ArtifactStatus } from "@/types/domain";
import StageProgressBar from "./StageProgressBar";
import AgentArena from "./AgentArena";
import AgentStrip from "./AgentStrip";
import DebateChat from "./DebateChat";
import WorkspaceTabs from "./WorkspaceTabs";
import MobileTabBar from "./MobileTabBar";
import ResultsDashboard from "./ResultsDashboard";
import TokenBudgetBar from "./TokenBudgetBar";
import ArtifactCard from "./ArtifactCard";
import InterventionPanel from "./InterventionPanel";
import NotificationBanner from "@/components/ui/NotificationBanner";
import EmptyState from "@/components/ui/EmptyState";
import StageTransitionToast from "./StageTransitionToast";
import RoundEtaIndicator from "./RoundEtaIndicator";
import ClarificationPanel from "./ClarificationPanel";
import GitHubGroundingIndicator from "./GitHubGroundingIndicator";
import BudgetEditDialog from "./BudgetEditDialog";
import ExportMenu, { type ExportMenuHandle } from "./ExportMenu";
import { useEventStream } from "@/hooks/useEventStream";
import { useKeyboardShortcuts } from "@/hooks/useKeyboardShortcuts";
import { toast } from "@/hooks/useToast";
import { FileText, History, PanelLeftClose, PanelLeftOpen } from "lucide-react";
import Link from "next/link";
import type { SessionConfig } from "@/types/domain";

interface WorkspaceLayoutProps {
  session: SessionState & {
    tokenBudget?: number | null;
    config?: SessionConfig;
    wasRecovered?: boolean;
    recoveredAt?: string | null;
  };
  mutate?: () => void;
}

// SessionState type does not expose a tokenBudget field, so we use a
// sensible default as the denominator for the token budget progress bar.
const DEFAULT_TOKEN_BUDGET = 100000;

const stageOrder: RoundStage[] = ["proposal", "critique", "revision", "consensus"];

function getCompletedStages(currentStage: RoundStage | null): RoundStage[] {
  if (!currentStage) return [];
  if (currentStage === "awaiting-intervention") {
    return ["proposal", "critique", "revision", "consensus"];
  }
  const idx = stageOrder.indexOf(currentStage);
  if (idx <= 0) return [];
  return stageOrder.slice(0, idx);
}

function SessionStatusBadge({ status }: { status: "active" | "paused" | "completed" }) {
  const config = {
    active: {
      icon: Loader2,
      label: "Active",
      className: "bg-green-900/50 text-green-400 border-green-700",
      iconClass: "animate-spin",
    },
    paused: {
      icon: Pause,
      label: "Paused",
      className: "bg-yellow-900/50 text-yellow-400 border-yellow-700",
      iconClass: "",
    },
    completed: {
      icon: CheckCircle,
      label: "Completed",
      className: "bg-blue-900/50 text-blue-400 border-blue-700",
      iconClass: "",
    },
  };

  const { icon: Icon, label, className, iconClass } = config[status];

  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium rounded-full border ${className}`}>
      <Icon size={12} className={iconClass} />
      {label}
    </span>
  );
}

function WorkspaceSummaryBar({
  session,
  isActiveRound,
  isAwaitingIntervention,
  startRoundDisabled,
  isStartingRound,
  onStartRound,
}: {
  session: WorkspaceLayoutProps["session"];
  isActiveRound: boolean;
  isAwaitingIntervention: boolean;
  startRoundDisabled: boolean;
  isStartingRound: boolean;
  onStartRound: () => void;
}) {
  const topDecision = session.consensus?.recommendedDecisions?.[0];
  const acceptedCount = session.artifacts.filter((a) => a.status === "accepted").length;
  const draftCount = session.artifacts.filter((a) => a.status === "draft").length;
  const riskCount = session.artifacts.filter((a) => a.type === "risk").length;
  const statusText = isActiveRound
    ? "Analyzing repo..."
    : isAwaitingIntervention
      ? "Report ready — review below"
      : session.status === "completed"
        ? "Review complete"
        : session.currentRound === 0
          ? "Ready"
          : "Report ready";
  const outputsText = topDecision
    ? topDecision.title
    : session.artifacts.length > 0
      ? `${acceptedCount} accepted, ${draftCount} draft, ${riskCount} risks`
      : "Findings will appear after analysis completes";

  return (
    <section className="border-b border-gray-800 bg-gray-950/70 px-3 py-2 sm:px-4 sm:py-2.5">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium text-gray-100">{statusText}</p>
          <p className="mt-0.5 truncate text-xs text-gray-400">{outputsText}</p>
        </div>
        {!startRoundDisabled && (
          <button
            onClick={onStartRound}
            className="inline-flex min-h-10 shrink-0 items-center gap-1.5 rounded-md bg-[var(--brand-violet)] px-4 text-sm font-semibold text-white transition-colors hover:bg-[var(--violet-hover)] disabled:opacity-60"
            disabled={isStartingRound}
          >
            {isStartingRound ? <Loader2 size={14} className="animate-spin" /> : <Play size={14} />}
            {isStartingRound ? "Working..." : session.currentRound > 0 ? "Refine" : "Start"}
          </button>
        )}
      </div>
    </section>
  );
}

export default function WorkspaceLayout({ session, mutate }: WorkspaceLayoutProps) {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState("results");
  const [isStartingRound, setIsStartingRound] = useState(false);
  const [artifactTypeFilter, setArtifactTypeFilter] = useState<ArtifactType | "all">("all");
  const [artifactStatusFilter, setArtifactStatusFilter] = useState<ArtifactStatus | "all">("all");
  const [showBudgetDialog, setShowBudgetDialog] = useState(false);
  const [agentArenaExpanded, setAgentArenaExpanded] = useState(false);
  const exportMenuRef = useRef<ExportMenuHandle>(null);
  const autoStartAttemptedRef = useRef(false);
  // Fire a one-time toast if this session was crash-recovered. Use the
  // recoveredAt timestamp as the dedupe key so navigating back later doesn't
  // re-fire — and so a *new* recovery does.
  const recoveryKey = session.recoveredAt ?? null;
  const recoveryShownRef = useRef<string | null>(null);
  useEffect(() => {
    if (!session.wasRecovered || !recoveryKey) return;
    if (recoveryShownRef.current === recoveryKey) return;
    recoveryShownRef.current = recoveryKey;
    toast.info({
      message: "Session recovered",
      description: "We restored this session after an interrupted round. You can continue from where it left off.",
    });
  }, [session.wasRecovered, recoveryKey]);

  // Subscribe to the raw event stream once at this level — children read derived
  // selectors via props so we don't fire 5 separate SWR pollers.
  const { events, stageTransitions, lastEventByAgent } = useEventStream(session.id);

  // Compute workspace state
  const isEmptyState = session.currentRound === 0 && session.artifacts.length === 0 && !session.currentStage;
  const isActiveRound = session.currentStage !== null && session.currentStage !== "awaiting-intervention";
  const isAwaitingIntervention = session.currentStage === "awaiting-intervention";

  const completedStages = useMemo(() => getCompletedStages(session.currentStage), [session.currentStage]);

  const totalTokens = (session.tokenUsage.totalInputTokens || 0) + (session.tokenUsage.totalOutputTokens || 0);
  const budgetCeiling = session.tokenBudget ?? DEFAULT_TOKEN_BUDGET;
  const githubRepo = session.config?.githubRepo;

  // Show the clarification panel only when the latest interaction is a still-
  // unanswered clarification request. A `user-intervention` event after the
  // clarification means the user already replied.
  const hasPendingClarification = useMemo(() => {
    for (let i = events.length - 1; i >= 0; i--) {
      const e = events[i];
      if (e.type === "user-intervention" && e.round === session.currentRound) return false;
      if (e.type === "clarification-request" && e.round === session.currentRound) return true;
    }
    return false;
  }, [events, session.currentRound]);


  // Filter artifacts
  const filteredArtifacts = useMemo(() => {
    const filtered = session.artifacts.filter((a) => {
      if (artifactTypeFilter !== "all" && a.type !== artifactTypeFilter) return false;
      if (artifactStatusFilter !== "all" && a.status !== artifactStatusFilter) return false;
      return true;
    });
    // Sort: accepted first, then draft, then rejected
    const statusOrder: Record<ArtifactStatus, number> = { accepted: 0, draft: 1, rejected: 2 };
    return filtered.sort((a, b) => statusOrder[a.status] - statusOrder[b.status]);
  }, [session.artifacts, artifactTypeFilter, artifactStatusFilter]);

  const artifactStatusCounts = useMemo(() => ({
    all: session.artifacts.length,
    accepted: session.artifacts.filter((a) => a.status === "accepted").length,
    draft: session.artifacts.filter((a) => a.status === "draft").length,
    rejected: session.artifacts.filter((a) => a.status === "rejected").length,
  }), [session.artifacts]);

  // Tab configuration
  const tabs = useMemo(() => [
    { id: "results", label: "Report" },
    { id: "artifacts", label: "Findings", badge: session.artifacts.length || undefined },
    { id: "debate", label: "Agent Debate" },
  ], [session.artifacts.length]);

  const handleStartRound = useCallback(async () => {
    setIsStartingRound(true);
    try {
      const res = await fetch(`/api/sessions/${session.id}/rounds`, { method: "POST" });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        toast.error({ message: "Couldn't start round", description: body.error ?? "Something went wrong. Please try again." });
        return;
      }
      mutate?.();
    } catch (err) {
      toast.error({
        message: "Couldn't start round",
        description: err instanceof Error && err.message.includes("fetch")
          ? "Couldn't reach the server. Check your connection."
          : "A network error occurred. Please try again.",
      });
    } finally {
      setIsStartingRound(false);
    }
  }, [mutate, session.id]);

  const handleEndSession = async () => {
    if (!window.confirm("End this session? This cannot be undone.")) return;
    await fetch(`/api/sessions/${session.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "completed" }),
    });
  };

  const handleExportFromResults = async () => {
    const res = await fetch(`/api/sessions/${session.id}/export`);
    if (!res.ok) {
      toast.error({ message: "Export failed", description: "Couldn't generate the export. Please try again." });
      return;
    }
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `session-${session.id}.md`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // Determine if start round button should be disabled
  const startRoundDisabled =
    isStartingRound ||
    session.status !== "active" ||
    (session.currentStage !== null && session.currentStage !== "awaiting-intervention");

  useEffect(() => {
    const autoStartRequested = new URLSearchParams(window.location.search).get("start") === "1";
    if (!autoStartRequested || autoStartAttemptedRef.current || !isEmptyState || startRoundDisabled) return;
    autoStartAttemptedRef.current = true;
    router.replace(`/sessions/${session.id}`, { scroll: false });
    void handleStartRound();
  }, [handleStartRound, isEmptyState, router, session.id, startRoundDisabled]);

  // Workspace-scoped shortcuts. `?` and the `g _` chords are wired globally
  // from the root layout / AppHeader.
  useKeyboardShortcuts({
    "start-round": () => {
      if (!startRoundDisabled) handleStartRound();
    },
    export: () => exportMenuRef.current?.open(),
  });

  return (
    <div className="min-h-screen h-screen flex flex-col bg-[#0b0d0c]">
      {/* Header */}
      <header
        className={`
          relative border-b border-gray-800 px-3 py-2 shrink-0 sm:px-4 sm:py-3
          ${isActiveRound ? "border-b-transparent" : ""}
        `}
      >
        {/* Active round animated gradient border */}
        {isActiveRound && (
          <div className="absolute bottom-0 left-0 right-0 h-px bg-violet-500/70" />
        )}

        <div className="flex items-center justify-between">
          {/* Left: Breadcrumb + Title */}
          <div className="flex min-w-0 items-center gap-2 sm:gap-3">
            <button
              onClick={() => router.push("/sessions")}
              className="flex min-h-10 items-center gap-1 text-gray-400 hover:text-gray-100 text-sm shrink-0 transition-colors"
            >
              <ArrowLeft size={14} />
            </button>
            <h1 className="max-w-[180px] truncate text-sm font-medium text-gray-200 sm:max-w-sm lg:max-w-lg">
              {session.problemDescription.slice(0, 60)}
            </h1>
            {isActiveRound && (
              <span className="hidden sm:inline-flex items-center gap-1.5 text-xs text-violet-300">
                <span className="h-1.5 w-1.5 rounded-full bg-violet-400 animate-pulse" />
                Analyzing
              </span>
            )}
          </div>

          {/* Right: actions */}
          <div className="flex items-center gap-2 sm:gap-3">
            {session.status === "completed" && (
              <Link
                href={`/sessions/${session.id}/replay`}
                className="hidden sm:inline-flex items-center gap-1.5 px-3 py-1.5 text-xs bg-gray-800 border border-gray-700 rounded-lg text-gray-300 hover:bg-gray-700 hover:text-white transition-colors"
                title="View history"
              >
                <History size={12} />
                <span>History</span>
              </Link>
            )}
            {!isEmptyState && <ExportMenu ref={exportMenuRef} sessionId={session.id} session={session} />}
            {!isEmptyState && session.status !== "completed" && (
              <button
                onClick={handleEndSession}
                className="min-h-10 px-3 py-1.5 text-xs text-gray-500 hover:text-red-400 transition-colors"
              >
                End
              </button>
            )}
          </div>
        </div>
      </header>

      {/* Live event subscriptions — toasts fire on each stage transition. */}
      <StageTransitionToast transitions={stageTransitions} />

      {/* Stage Progress Bar — only visible during active round execution */}
      {isActiveRound && (
        <div className="relative">
          <StageProgressBar
            currentStage={session.currentStage}
            completedStages={completedStages}
            currentRound={session.currentRound}
          />
          {isActiveRound && (
            <div className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2">
              <RoundEtaIndicator
                events={events}
                currentRound={session.currentRound}
                currentStage={session.currentStage}
              />
            </div>
          )}
        </div>
      )}


      {/* Notification Banner for Awaiting Intervention */}
      <AnimatePresence>
        {isAwaitingIntervention && !hasPendingClarification && (
          <div className="px-4 pt-3 shrink-0">
            <NotificationBanner
              type="warning"
              message="Analysis complete. You can refine the report by adding constraints, or run another review pass."
              action={{ label: "Run Another Pass", onClick: handleStartRound }}
              dismissible
            />
          </div>
        )}
      </AnimatePresence>

      {/* Budget edit dialog */}
      <BudgetEditDialog
        open={showBudgetDialog}
        sessionId={session.id}
        currentBudget={session.tokenBudget ?? null}
        currentUsed={totalTokens}
        onClose={() => setShowBudgetDialog(false)}
        onSaved={() => mutate?.()}
      />

      {/* Main Body: responsive — desktop 2-col, mobile single column */}
      <div className="flex-1 flex min-h-0 overflow-hidden">
        {/* Left Column: Agent Arena — only visible in Reasoning tab */}
        {!isEmptyState && activeTab === "debate" && (
          <aside
            className={`hidden shrink-0 flex-col overflow-hidden border-r border-gray-800 transition-all duration-200 md:flex ${
              agentArenaExpanded ? "md:w-72 lg:w-80 xl:w-[22rem]" : "md:w-56 lg:w-56 xl:w-56"
            }`}
          >
            <div className="flex min-h-12 items-center justify-between border-b border-gray-800 px-3">
              <p className="truncate text-sm font-semibold text-gray-200">Agents</p>
              <button
                type="button"
                onClick={() => setAgentArenaExpanded((expanded) => !expanded)}
                className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-gray-800 bg-gray-900 text-gray-400 transition-colors hover:border-gray-700 hover:bg-gray-800 hover:text-gray-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500/70"
                aria-label={agentArenaExpanded ? "Collapse agent arena" : "Expand agent arena"}
                title={agentArenaExpanded ? "Collapse agent arena" : "Expand agent arena"}
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
        )}

        {/* Right Column: Main Content */}
        <main className="flex-1 flex flex-col min-w-0 overflow-hidden">
          {/* Mobile-only horizontal agent strip */}
          {!isEmptyState && activeTab === "debate" && (
            <div className="md:hidden">
              <AgentStrip
                agents={session.agents}
                currentStage={session.currentStage}
                activeAgentId={undefined}
                lastEventByAgent={lastEventByAgent}
              />
            </div>
          )}

          {/* Empty State */}
          {isEmptyState ? (
            <div className="flex-1 flex items-center justify-center p-8">
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.4 }}
                className="text-center max-w-md"
              >
                <h2 className="text-lg font-semibold text-gray-100 mb-2">
                  Ready to analyze
                </h2>
                <p className="text-sm text-gray-400 mb-1 leading-relaxed">
                  {session.problemDescription}
                </p>
                {session.constraints.length > 0 && (
                  <p className="text-xs text-gray-500 mb-6">
                    {session.constraints.length} constraint{session.constraints.length > 1 ? "s" : ""} set
                  </p>
                )}
                {!session.constraints.length && <div className="mb-6" />}
                <button
                  onClick={handleStartRound}
                  disabled={startRoundDisabled}
                  className="inline-flex items-center gap-2 rounded-lg bg-[var(--brand-violet)] px-6 py-3 font-semibold text-white transition-colors hover:bg-[var(--violet-hover)] disabled:opacity-50"
                >
                  Generate report
                  <ArrowRight size={16} />
                </button>
              </motion.div>
            </div>
          ) : (
            <>
              <WorkspaceSummaryBar
                session={session}
                isActiveRound={isActiveRound}
                isAwaitingIntervention={isAwaitingIntervention}
                startRoundDisabled={startRoundDisabled}
                isStartingRound={isStartingRound}
                onStartRound={handleStartRound}
              />

              {/* Tabs — only after there's content to navigate between */}
              {session.currentRound > 0 && (
                <div className="hidden md:block">
                  <WorkspaceTabs
                    activeTab={activeTab}
                    onTabChange={setActiveTab}
                    tabs={tabs}
                  />
                </div>
              )}

              {/* Tab Content */}
              <div className="flex-1 min-h-0 overflow-hidden">
                {activeTab === "debate" && (
                  <DebateChat
                    sessionId={session.id}
                    currentRound={session.currentRound}
                    currentStage={session.currentStage}
                  />
                )}

                {activeTab === "artifacts" && (
                  <div className="h-full overflow-y-auto px-3 py-3 sm:px-4 sm:py-4">
                    {/* Clarification panel takes priority when an agent is blocked on a question. */}
                    {hasPendingClarification && (
                      <div className="mb-4">
                        <ClarificationPanel
                          sessionId={session.id}
                          events={events}
                          currentRound={session.currentRound}
                        />
                      </div>
                    )}
                    {/* Intervention Panel appears here when awaiting */}
                    {isAwaitingIntervention && !hasPendingClarification && (
                      <div className="mb-4">
                        <InterventionPanel sessionId={session.id} />
                      </div>
                    )}

                    {/* Filter Bar */}
                    <div className="mb-3 grid grid-cols-2 gap-2 sm:mb-4 sm:flex sm:flex-wrap sm:items-center">
                      <select
                        value={artifactTypeFilter}
                        onChange={(e) => setArtifactTypeFilter(e.target.value as ArtifactType | "all")}
                        className="min-h-10 min-w-0 px-3 py-2 text-sm bg-gray-800 border border-gray-700 rounded-lg text-gray-200 focus:outline-none focus:ring-2 focus:ring-violet-500/50"
                      >
                        <option value="all">All findings</option>
                        <option value="decision">Finding</option>
                        <option value="risk">Risk</option>
                        <option value="assumption">Assumption</option>
                        <option value="tradeoff">Tradeoff</option>
                        <option value="open-question">Question</option>
                        <option value="recommendation">Fix</option>
                      </select>
                      <select
                        value={artifactStatusFilter}
                        onChange={(e) => setArtifactStatusFilter(e.target.value as ArtifactStatus | "all")}
                        className="min-h-10 min-w-0 px-3 py-2 text-sm bg-gray-800 border border-gray-700 rounded-lg text-gray-200 focus:outline-none focus:ring-2 focus:ring-violet-500/50"
                      >
                        <option value="all">All Status ({artifactStatusCounts.all})</option>
                        <option value="accepted">Accepted ({artifactStatusCounts.accepted})</option>
                        <option value="draft">Draft ({artifactStatusCounts.draft})</option>
                        <option value="rejected">Rejected ({artifactStatusCounts.rejected})</option>
                      </select>
                      {(artifactTypeFilter !== "all" || artifactStatusFilter !== "all") && (
                        <button
                          onClick={() => {
                            setArtifactTypeFilter("all");
                            setArtifactStatusFilter("all");
                          }}
                          className="min-h-10 px-3 py-2 text-sm bg-violet-500/10 border border-violet-500/40 rounded-lg text-violet-200 hover:bg-violet-500/15 hover:text-violet-100 transition-colors"
                        >
                          Show All
                        </button>
                      )}
                      <span className="self-center text-right text-sm text-gray-400 sm:ml-auto">
                        {filteredArtifacts.length} finding{filteredArtifacts.length !== 1 ? "s" : ""}
                      </span>
                    </div>

                    {/* Artifact Grid */}
                    {filteredArtifacts.length > 0 ? (
                      <div className="grid grid-cols-1 gap-2 sm:gap-3 lg:grid-cols-2">
                        {filteredArtifacts.map((artifact) => (
                          <ArtifactCard
                            key={artifact.id}
                            artifact={artifact}
                            sessionId={session.id}
                            onStatusChange={mutate}
                          />
                        ))}
                      </div>
                    ) : (
                      <EmptyState
                        icon={FileText}
                        title="No findings yet"
                        description="Findings, risks, and recommendations will appear here as the analysis progresses."
                      />
                    )}
                  </div>
                )}

                {activeTab === "results" && (
                  <ResultsDashboard
                    session={session}
                    config={session.config}
                    onExport={handleExportFromResults}
                  />
                )}
              </div>
            </>
          )}
        </main>
      </div>

      {/* Mobile bottom tab bar */}
      {!isEmptyState && (
        <div className="md:hidden shrink-0">
          <MobileTabBar
            tabs={tabs}
            activeTab={activeTab}
            onTabChange={setActiveTab}
          />
        </div>
      )}

      {/* Footer — desktop only: round indicators */}
      {!isEmptyState && session.currentRound > 0 && (
        <footer className="hidden md:flex items-center justify-center gap-1.5 border-t border-gray-800 px-4 py-2 shrink-0">
          {Array.from({ length: session.currentRound }, (_, i) => (
            <div
              key={i}
              className="w-2 h-2 rounded-full bg-violet-500"
              title={`Round ${i + 1}`}
            />
          ))}
          {session.status === "active" && (
            <div className="w-2 h-2 rounded-full border border-gray-600" title="Next round" />
          )}
        </footer>
      )}
    </div>
  );
}
