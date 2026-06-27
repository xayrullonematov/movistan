"use client";

import { useState, useMemo, useEffect, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import {
  ArrowLeft,
  Loader2,
  ArrowRight,
  Play,
  History,
  Filter,
  ChevronDown,
} from "lucide-react";
import type { SessionState, RoundStage, ArtifactType, ArtifactStatus } from "@/types/domain";
import WorkspaceTabs from "./WorkspaceTabs";
import MobileTabBar from "./MobileTabBar";
import ArtifactCard from "./ArtifactCard";
import FindingCard from "./FindingCard";
import InterventionPanel from "./InterventionPanel";
import NotificationBanner from "@/components/ui/NotificationBanner";
import EmptyState from "@/components/ui/EmptyState";
import StageTransitionToast from "./StageTransitionToast";
import ClarificationPanel from "./ClarificationPanel";
import BudgetEditDialog from "./BudgetEditDialog";
import ExportMenu, { type ExportMenuHandle } from "./ExportMenu";
import ReviewOverview from "./ReviewOverview";
import TechnicalActivityPanel from "./TechnicalActivityPanel";
import { useEventStream } from "@/hooks/useEventStream";
import { useKeyboardShortcuts } from "@/hooks/useKeyboardShortcuts";
import { toast } from "@/hooks/useToast";
import { FileText } from "lucide-react";
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

export default function WorkspaceLayout({ session, mutate }: WorkspaceLayoutProps) {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState("overview");
  const [isStartingRound, setIsStartingRound] = useState(false);
  const [artifactTypeFilter, setArtifactTypeFilter] = useState<ArtifactType | "all">("all");
  const [artifactStatusFilter, setArtifactStatusFilter] = useState<ArtifactStatus | "all">("all");
  const [showBudgetDialog, setShowBudgetDialog] = useState(false);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const exportMenuRef = useRef<ExportMenuHandle>(null);
  const autoStartAttemptedRef = useRef(false);
  const recoveryKey = session.recoveredAt ?? null;
  const recoveryShownRef = useRef<string | null>(null);

  useEffect(() => {
    if (!session.wasRecovered || !recoveryKey) return;
    if (recoveryShownRef.current === recoveryKey) return;
    recoveryShownRef.current = recoveryKey;
    toast.info({
      message: "Review recovered",
      description: "We restored this review after an interruption. You can continue from where it left off.",
    });
  }, [session.wasRecovered, recoveryKey]);

  const { events, stageTransitions, lastEventByAgent } = useEventStream(session.id);

  const isEmptyState = session.currentRound === 0 && session.artifacts.length === 0 && !session.currentStage;
  const isActiveRound = session.currentStage !== null && session.currentStage !== "awaiting-intervention";
  const isAwaitingIntervention = session.currentStage === "awaiting-intervention";

  const completedStages = useMemo(() => getCompletedStages(session.currentStage), [session.currentStage]);

  const totalTokens = (session.tokenUsage.totalInputTokens || 0) + (session.tokenUsage.totalOutputTokens || 0);
  const budgetCeiling = session.tokenBudget ?? DEFAULT_TOKEN_BUDGET;

  const hasPendingClarification = useMemo(() => {
    for (let i = events.length - 1; i >= 0; i--) {
      const e = events[i];
      if (e.type === "user-intervention" && e.round === session.currentRound) return false;
      if (e.type === "clarification-request" && e.round === session.currentRound) return true;
    }
    return false;
  }, [events, session.currentRound]);

  const filteredArtifacts = useMemo(() => {
    const filtered = session.artifacts.filter((a) => {
      if (artifactTypeFilter !== "all" && a.type !== artifactTypeFilter) return false;
      if (artifactStatusFilter !== "all" && a.status !== artifactStatusFilter) return false;
      return true;
    });
    const statusPriority: Record<ArtifactStatus, number> = { accepted: 0, draft: 1, rejected: 2 };
    return filtered.sort((a, b) => statusPriority[a.status] - statusPriority[b.status]);
  }, [session.artifacts, artifactTypeFilter, artifactStatusFilter]);

  const artifactStatusCounts = useMemo(() => ({
    all: session.artifacts.length,
    accepted: session.artifacts.filter((a) => a.status === "accepted").length,
    draft: session.artifacts.filter((a) => a.status === "draft").length,
    rejected: session.artifacts.filter((a) => a.status === "rejected").length,
  }), [session.artifacts]);

  const tabs = useMemo(() => [
    { id: "overview", label: "Overview" },
    { id: "findings", label: "Findings", badge: session.artifacts.length || undefined },
    { id: "technical", label: "Technical activity" },
  ], [session.artifacts.length]);

  const handleStartRound = useCallback(async () => {
    setIsStartingRound(true);
    try {
      const res = await fetch(`/api/sessions/${session.id}/rounds`, { method: "POST" });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        toast.error({ message: "Couldn't start analysis", description: body.error ?? "Something went wrong. Please try again." });
        return;
      }
      mutate?.();
    } catch (err) {
      toast.error({
        message: "Couldn't start analysis",
        description: err instanceof Error && err.message.includes("fetch")
          ? "Couldn't reach the server. Check your connection."
          : "A network error occurred. Please try again.",
      });
    } finally {
      setIsStartingRound(false);
    }
  }, [mutate, session.id]);

  const handleEndSession = async () => {
    if (!window.confirm("End this review? This cannot be undone.")) return;
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
    a.download = `review-${session.id}.md`;
    a.click();
    URL.revokeObjectURL(url);
  };

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

  useKeyboardShortcuts({
    "start-round": () => {
      if (!startRoundDisabled) handleStartRound();
    },
    export: () => exportMenuRef.current?.open(),
  });

  return (
    <div className="min-h-screen h-screen flex flex-col bg-[var(--background)]">
      {/* Header */}
      <header className="relative border-b border-[var(--border)] bg-[var(--background)] px-3 py-2 shrink-0 sm:px-4 sm:py-3">
        {isActiveRound && (
          <div className="absolute bottom-0 left-0 right-0 h-px bg-[var(--brand-violet)]/70" />
        )}
        <div className="flex items-center justify-between">
          <div className="flex min-w-0 items-center gap-2 sm:gap-3">
            <button
              onClick={() => router.push("/sessions")}
              className="flex min-h-10 items-center gap-1 text-[var(--text-muted)] hover:text-[var(--text-primary)] text-sm shrink-0 transition-colors"
              aria-label="Back to reviews"
            >
              <ArrowLeft size={14} />
            </button>
            <h1 className="max-w-[180px] truncate text-sm font-medium text-[var(--text-primary)] sm:max-w-sm lg:max-w-lg">
              {session.problemDescription.slice(0, 60)}
            </h1>
            {isActiveRound && (
              <span className="hidden sm:inline-flex items-center gap-1.5 text-xs text-violet-300">
                <span className="h-1.5 w-1.5 rounded-full bg-violet-400 animate-pulse" />
                Analyzing
              </span>
            )}
          </div>
          <div className="flex items-center gap-2 sm:gap-3">
            {session.status === "completed" && (
              <Link
                href={`/sessions/${session.id}/replay`}
                className="hidden sm:inline-flex items-center gap-1.5 px-3 py-1.5 text-xs border border-[var(--border)] rounded-lg text-[var(--text-secondary)] hover:bg-[var(--surface-elevated)] hover:text-[var(--text-primary)] transition-colors"
                title="Activity log"
              >
                <History size={12} />
                <span>Activity</span>
              </Link>
            )}
            {session.consensus && <ExportMenu ref={exportMenuRef} sessionId={session.id} session={session} />}
            {activeTab === "technical" && !isEmptyState && session.status !== "completed" && (
              <button
                onClick={handleEndSession}
                className="min-h-10 px-3 py-1.5 text-xs text-[var(--text-muted)] hover:text-red-400 transition-colors"
              >
                End
              </button>
            )}
          </div>
        </div>
      </header>

      <StageTransitionToast transitions={stageTransitions} />

      <AnimatePresence>
        {isAwaitingIntervention && !hasPendingClarification && activeTab === "overview" && (
          <div className="px-4 pt-3 shrink-0">
            <NotificationBanner
              type="warning"
              message="Report ready. You can add instructions to refine the analysis, or export the results."
              action={{ label: "Refine", onClick: handleStartRound }}
              dismissible
            />
          </div>
        )}
      </AnimatePresence>

      <BudgetEditDialog
        open={showBudgetDialog}
        sessionId={session.id}
        currentBudget={session.tokenBudget ?? null}
        currentUsed={totalTokens}
        onClose={() => setShowBudgetDialog(false)}
        onSaved={() => mutate?.()}
      />

      {/* Main Body */}
      <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
        {/* Empty State */}
        {isEmptyState ? (
          <div className="flex-1 flex items-center justify-center p-8">
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.4 }}
              className="text-center max-w-md"
            >
              <h2 className="text-lg font-semibold text-[var(--text-primary)] mb-2">
                Ready to analyze
              </h2>
              <p className="text-sm text-[var(--text-secondary)] mb-1 leading-relaxed">
                {session.problemDescription}
              </p>
              {session.constraints.length > 0 && (
                <p className="text-xs text-[var(--text-muted)] mb-6">
                  {session.constraints.length} instruction{session.constraints.length > 1 ? "s" : ""} set
                </p>
              )}
              {!session.constraints.length && <div className="mb-6" />}
              <button
                onClick={handleStartRound}
                disabled={startRoundDisabled}
                className="inline-flex items-center gap-2 rounded-lg bg-[var(--brand-violet)] px-6 py-3 font-semibold text-white transition-colors hover:bg-[var(--violet-hover)] disabled:opacity-50 focus:outline-none focus:ring-2 focus:ring-[var(--violet-glow)]"
              >
                Analyze repo
                <ArrowRight size={16} />
              </button>
            </motion.div>
          </div>
        ) : (
          <>
            {/* Desktop Tabs */}
            {session.currentRound > 0 && (
              <div className="hidden md:block shrink-0">
                <WorkspaceTabs
                  activeTab={activeTab}
                  onTabChange={setActiveTab}
                  tabs={tabs}
                />
              </div>
            )}

            {/* Tab Content */}
            <div className="flex-1 min-h-0 overflow-hidden">
              {activeTab === "overview" && (
                <ReviewOverview
                  session={session}
                  onExport={handleExportFromResults}
                  onRerun={handleStartRound}
                  rerunDisabled={startRoundDisabled}
                  onSwitchToFindings={() => setActiveTab("findings")}
                  onSwitchToTechnical={() => setActiveTab("technical")}
                />
              )}

              {activeTab === "findings" && (
                <div className="h-full overflow-y-auto px-3 py-3 sm:px-4 sm:py-4">
                  {hasPendingClarification && (
                    <div className="mb-4">
                      <ClarificationPanel
                        sessionId={session.id}
                        events={events}
                        currentRound={session.currentRound}
                      />
                    </div>
                  )}

                  {/* Findings count header */}
                  <div className="mb-3 flex items-center justify-between sm:mb-4">
                    <span className="text-sm font-medium text-[var(--text-primary)]">
                      {filteredArtifacts.length} finding{filteredArtifacts.length !== 1 ? "s" : ""}
                      {(artifactTypeFilter !== "all" || artifactStatusFilter !== "all") && (
                        <span className="ml-1 text-[var(--text-muted)]">
                          (filtered from {session.artifacts.length})
                        </span>
                      )}
                    </span>
                    <button
                      type="button"
                      onClick={() => setFiltersOpen(!filtersOpen)}
                      className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-1.5 text-xs text-[var(--text-secondary)] hover:bg-[var(--surface-elevated)] transition-colors"
                      aria-expanded={filtersOpen}
                    >
                      <Filter size={12} />
                      Filter findings
                      <ChevronDown
                        size={11}
                        className={`transition-transform ${filtersOpen ? "rotate-180" : ""}`}
                      />
                    </button>
                  </div>

                  {/* Collapsed filter panel */}
                  {filtersOpen && (
                    <div className="mb-4 rounded-lg border border-[var(--border)] bg-[var(--surface)] p-3 sm:p-4">
                      <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap sm:items-center sm:gap-3">
                        <select
                          value={artifactTypeFilter}
                          onChange={(e) => setArtifactTypeFilter(e.target.value as ArtifactType | "all")}
                          className="min-h-10 min-w-0 px-3 py-2 text-sm bg-[var(--surface-elevated)] border border-[var(--border)] rounded-lg text-[var(--text-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--violet-glow)]"
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
                          className="min-h-10 min-w-0 px-3 py-2 text-sm bg-[var(--surface-elevated)] border border-[var(--border)] rounded-lg text-[var(--text-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--violet-glow)]"
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
                            className="min-h-10 px-3 py-2 text-sm bg-[var(--violet-soft-bg)] border border-[var(--brand-violet)]/40 rounded-lg text-violet-200 hover:bg-[var(--brand-violet)]/20 transition-colors"
                          >
                            Clear filters
                          </button>
                        )}
                      </div>
                    </div>
                  )}

                  {/* Findings vertical list */}
                  {filteredArtifacts.length > 0 ? (
                    <div className="space-y-3">
                      {filteredArtifacts.map((artifact) => (
                        <FindingCard
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
                      description="Findings will appear here as the analysis progresses."
                    />
                  )}
                </div>
              )}

              {activeTab === "technical" && (
                <TechnicalActivityPanel
                  session={session}
                  events={events}
                  lastEventByAgent={lastEventByAgent}
                  completedStages={completedStages}
                  totalTokens={totalTokens}
                  budgetCeiling={budgetCeiling}
                  onEditBudget={() => setShowBudgetDialog(true)}
                />
              )}
            </div>
          </>
        )}
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
    </div>
  );
}
