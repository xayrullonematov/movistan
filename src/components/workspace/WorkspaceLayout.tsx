"use client";

import { useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import {
  ArrowLeft,
  Download,
  Loader2,
  CheckCircle,
  Pause,
  ArrowRight,
  Play,
} from "lucide-react";
import type { SessionState, RoundStage, ArtifactType, ArtifactStatus } from "@/types/domain";
import StageProgressBar from "./StageProgressBar";
import AgentArena from "./AgentArena";
import DebateChat from "./DebateChat";
import WorkspaceTabs from "./WorkspaceTabs";
import ResultsDashboard from "./ResultsDashboard";
import TokenBudgetBar from "./TokenBudgetBar";
import ArtifactCard from "./ArtifactCard";
import InterventionPanel from "./InterventionPanel";
import NotificationBanner from "@/components/ui/NotificationBanner";

interface WorkspaceLayoutProps {
  session: SessionState;
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

export default function WorkspaceLayout({ session, mutate }: WorkspaceLayoutProps) {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState("debate");
  const [isStartingRound, setIsStartingRound] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [artifactTypeFilter, setArtifactTypeFilter] = useState<ArtifactType | "all">("all");
  const [artifactStatusFilter, setArtifactStatusFilter] = useState<ArtifactStatus | "all">("accepted");

  // Compute workspace state
  const isEmptyState = session.currentRound === 0 && session.artifacts.length === 0 && !session.currentStage;
  const isActiveRound = session.currentStage !== null && session.currentStage !== "awaiting-intervention";
  const isAwaitingIntervention = session.currentStage === "awaiting-intervention";

  const completedStages = useMemo(() => getCompletedStages(session.currentStage), [session.currentStage]);

  const totalTokens = (session.tokenUsage.totalInputTokens || 0) + (session.tokenUsage.totalOutputTokens || 0);

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

  // Tab configuration
  const tabs = useMemo(() => [
    { id: "debate", label: "Debate" },
    { id: "artifacts", label: "Artifacts", badge: session.artifacts.length || undefined },
    { id: "results", label: "Results" },
  ], [session.artifacts.length]);

  const handleStartRound = async () => {
    setIsStartingRound(true);
    try {
      await fetch(`/api/sessions/${session.id}/rounds`, { method: "POST" });
    } finally {
      setIsStartingRound(false);
    }
  };

  const handleEndSession = async () => {
    if (!window.confirm("End this session? This cannot be undone.")) return;
    await fetch(`/api/sessions/${session.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "completed" }),
    });
  };

  const handleExport = async () => {
    setIsExporting(true);
    try {
      const res = await fetch(`/api/sessions/${session.id}/export`);
      if (res.ok) {
        const blob = await res.blob();
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `session-${session.id}.md`;
        a.click();
        URL.revokeObjectURL(url);
      }
    } finally {
      setIsExporting(false);
    }
  };

  // Determine if start round button should be disabled
  const startRoundDisabled =
    isStartingRound ||
    session.status !== "active" ||
    (session.currentStage !== null && session.currentStage !== "awaiting-intervention");

  return (
    <div className="min-h-screen h-screen flex flex-col bg-gray-950">
      {/* Header */}
      <header
        className={`
          relative border-b border-gray-800 px-4 py-3 shrink-0
          ${isActiveRound ? "border-b-transparent" : ""}
        `}
      >
        {/* Active round animated gradient border */}
        {isActiveRound && (
          <div className="absolute bottom-0 left-0 right-0 h-px bg-gradient-to-r from-blue-500 via-violet-500 to-blue-500 bg-[length:200%_100%] animate-[gradient-shift_3s_ease_infinite]" />
        )}

        <div className="flex items-center justify-between">
          {/* Left: Breadcrumb + Title */}
          <div className="flex items-center gap-3 min-w-0">
            <button
              onClick={() => router.push("/")}
              className="flex items-center gap-1 text-gray-400 hover:text-gray-200 text-sm shrink-0 transition-colors"
            >
              <ArrowLeft size={14} />
              <span className="hidden sm:inline">All Sessions</span>
            </button>
            <div className="w-px h-5 bg-gray-700" />
            <h1 className="text-sm font-medium text-gray-200 truncate max-w-xs lg:max-w-md">
              {session.problemDescription.slice(0, 80)}
              {session.problemDescription.length > 80 ? "..." : ""}
            </h1>
          </div>

          {/* Center: Status Badge */}
          <div className="hidden md:flex items-center gap-3">
            <SessionStatusBadge status={session.status} />
            {session.currentRound > 0 && (
              <span className="text-xs text-gray-500 font-mono">
                Round {session.currentRound}
              </span>
            )}
          </div>

          {/* Right: Token mini bar + actions */}
          <div className="flex items-center gap-3">
            <div className="hidden lg:block w-32">
              <TokenBudgetBar
                used={totalTokens}
                total={DEFAULT_TOKEN_BUDGET}
                estimatedCost={session.tokenUsage.estimatedCostUsd}
              />
            </div>
            <button
              onClick={handleExport}
              disabled={isExporting}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs bg-gray-800 border border-gray-700 rounded-lg text-gray-300 hover:bg-gray-700 hover:text-white transition-colors disabled:opacity-50"
            >
              <Download size={12} />
              <span className="hidden sm:inline">{isExporting ? "..." : "Export"}</span>
            </button>
            <button
              onClick={handleEndSession}
              disabled={session.status === "completed"}
              className="px-3 py-1.5 text-xs bg-red-950/50 border border-red-800/50 rounded-lg text-red-400 hover:bg-red-900/50 hover:text-red-300 transition-colors disabled:opacity-50"
            >
              End Session
            </button>
          </div>
        </div>
      </header>

      {/* Stage Progress Bar */}
      <StageProgressBar
        currentStage={session.currentStage}
        completedStages={completedStages}
      />

      {/* Notification Banner for Awaiting Intervention */}
      <AnimatePresence>
        {isAwaitingIntervention && (
          <div className="px-4 pt-3 shrink-0">
            <NotificationBanner
              type="warning"
              message="Round complete! Review the artifacts and start the next round, or add constraints."
              action={{ label: "Start Next Round", onClick: handleStartRound }}
              dismissible
            />
          </div>
        )}
      </AnimatePresence>

      {/* Main Body: 2-column layout */}
      <div className="flex-1 flex overflow-hidden">
        {/* Left Column: Agent Arena (35%) */}
        <aside className="w-[35%] border-r border-gray-800 overflow-hidden flex flex-col shrink-0">
          <AgentArena
            agents={session.agents}
            currentStage={session.currentStage}
            activeAgentId={undefined}
          />
        </aside>

        {/* Right Column: Main Content (65%) */}
        <main className="flex-1 flex flex-col overflow-hidden">
          {/* Empty State */}
          {isEmptyState ? (
            <div className="flex-1 flex items-center justify-center p-8">
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.4 }}
                className="text-center max-w-md"
              >
                <div className="w-16 h-16 rounded-2xl bg-blue-500/10 border border-blue-500/30 flex items-center justify-center mx-auto mb-6">
                  <Play size={28} className="text-blue-400 ml-1" />
                </div>
                <h2 className="text-xl font-semibold text-gray-100 mb-2">
                  Your AI engineering team is ready
                </h2>
                <p className="text-sm text-gray-400 mb-2 leading-relaxed">
                  {session.problemDescription}
                </p>
                <p className="text-xs text-gray-500 mb-6">
                  Click &quot;Start First Round&quot; to begin the structured debate. Each round goes through 4 stages: Proposal, Critique, Revision, and Consensus.
                </p>
                <button
                  onClick={handleStartRound}
                  disabled={startRoundDisabled}
                  className="inline-flex items-center gap-2 px-6 py-3 bg-gradient-to-r from-blue-600 to-violet-600 hover:from-blue-500 hover:to-violet-500 text-white font-medium rounded-lg transition-all disabled:opacity-50 shadow-lg shadow-blue-500/20"
                >
                  Start First Round
                  <ArrowRight size={16} />
                </button>
              </motion.div>
            </div>
          ) : (
            <>
              {/* Tabs */}
              <WorkspaceTabs
                activeTab={activeTab}
                onTabChange={setActiveTab}
                tabs={tabs}
              />

              {/* Tab Content */}
              <div className="flex-1 overflow-hidden">
                {activeTab === "debate" && (
                  <DebateChat
                    sessionId={session.id}
                    currentRound={session.currentRound}
                    currentStage={session.currentStage}
                  />
                )}

                {activeTab === "artifacts" && (
                  <div className="h-full overflow-y-auto px-4 py-4">
                    {/* Intervention Panel appears here when awaiting */}
                    {isAwaitingIntervention && (
                      <div className="mb-4">
                        <InterventionPanel sessionId={session.id} />
                      </div>
                    )}

                    {/* Filter Bar */}
                    <div className="flex items-center gap-2 mb-4">
                      <select
                        value={artifactTypeFilter}
                        onChange={(e) => setArtifactTypeFilter(e.target.value as ArtifactType | "all")}
                        className="px-2.5 py-1.5 text-xs bg-gray-800 border border-gray-700 rounded-lg text-gray-300 focus:outline-none focus:ring-2 focus:ring-blue-500/50"
                      >
                        <option value="all">All Types</option>
                        <option value="decision">Decision</option>
                        <option value="risk">Risk</option>
                        <option value="assumption">Assumption</option>
                        <option value="tradeoff">Tradeoff</option>
                        <option value="open-question">Open Question</option>
                        <option value="recommendation">Recommendation</option>
                      </select>
                      <select
                        value={artifactStatusFilter}
                        onChange={(e) => setArtifactStatusFilter(e.target.value as ArtifactStatus | "all")}
                        className="px-2.5 py-1.5 text-xs bg-gray-800 border border-gray-700 rounded-lg text-gray-300 focus:outline-none focus:ring-2 focus:ring-blue-500/50"
                      >
                        <option value="all">All Status</option>
                        <option value="draft">Draft</option>
                        <option value="accepted">Accepted</option>
                        <option value="rejected">Rejected</option>
                      </select>
                      {(artifactTypeFilter !== "all" || artifactStatusFilter !== "all") && (
                        <button
                          onClick={() => {
                            setArtifactTypeFilter("all");
                            setArtifactStatusFilter("all");
                          }}
                          className="px-2.5 py-1.5 text-xs bg-blue-900/40 border border-blue-700/50 rounded-lg text-blue-300 hover:bg-blue-900/60 hover:text-blue-200 transition-colors"
                        >
                          Show All
                        </button>
                      )}
                      <span className="ml-auto text-xs text-gray-500">
                        {filteredArtifacts.length} artifact{filteredArtifacts.length !== 1 ? "s" : ""}
                      </span>
                    </div>

                    {/* Artifact Grid */}
                    {filteredArtifacts.length > 0 ? (
                      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
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
                      <div className="flex items-center justify-center h-48">
                        <p className="text-sm text-gray-500">
                          No artifacts yet. Artifacts will appear as agents produce them during debate.
                        </p>
                      </div>
                    )}
                  </div>
                )}

                {activeTab === "results" && (
                  <ResultsDashboard
                    session={session}
                    onExport={handleExport}
                  />
                )}
              </div>
            </>
          )}
        </main>
      </div>

      {/* Footer */}
      <footer className="border-t border-gray-800 px-4 py-3 shrink-0">
        <div className="flex items-center justify-between">
          {/* Left: Action buttons */}
          <div className="flex items-center gap-3">
            <button
              onClick={handleStartRound}
              disabled={startRoundDisabled}
              className={`
                inline-flex items-center gap-2 px-5 py-2.5 text-sm font-medium rounded-lg transition-all
                ${isActiveRound
                  ? "bg-gray-700 text-gray-500 cursor-not-allowed"
                  : isAwaitingIntervention && !startRoundDisabled
                    ? "bg-gradient-to-r from-blue-600 to-violet-600 hover:from-blue-500 hover:to-violet-500 text-white shadow-lg shadow-blue-500/20 animate-pulse"
                    : "bg-gradient-to-r from-blue-600 to-violet-600 hover:from-blue-500 hover:to-violet-500 text-white shadow-lg shadow-blue-500/20"
                }
                disabled:opacity-50 disabled:shadow-none
              `}
            >
              {isStartingRound ? (
                <>
                  <Loader2 size={14} className="animate-spin" />
                  Starting...
                </>
              ) : isActiveRound ? (
                "Round in progress..."
              ) : (
                <>
                  <Play size={14} />
                  Start Next Round
                </>
              )}
            </button>
          </div>

          {/* Center: Round counter mini circles */}
          {session.currentRound > 0 && (
            <div className="hidden md:flex items-center gap-1.5">
              {Array.from({ length: session.currentRound }, (_, i) => (
                <div
                  key={i}
                  className="w-2 h-2 rounded-full bg-blue-500"
                  title={`Round ${i + 1}`}
                />
              ))}
              {session.status === "active" && (
                <div className="w-2 h-2 rounded-full border border-gray-600" title="Next round" />
              )}
            </div>
          )}

          {/* Right: Token Budget */}
          <div className="w-40 hidden md:block">
            <TokenBudgetBar
              used={totalTokens}
              total={DEFAULT_TOKEN_BUDGET}
              estimatedCost={session.tokenUsage.estimatedCostUsd}
            />
          </div>
        </div>
      </footer>
    </div>
  );
}
