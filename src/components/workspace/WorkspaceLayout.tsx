"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { SessionState } from "@/types/domain";
import ArtifactsPanel from "./ArtifactsPanel";
import EngineeringOutcomesPanel from "./EngineeringOutcomesPanel";
import SharedWorkspace from "./SharedWorkspace";
import InterventionPanel from "./InterventionPanel";
import AgentPanel from "./AgentPanel";
import ConsensusDashboard from "./ConsensusDashboard";
import DebateTimeline from "./DebateTimeline";
import TokenUsageBadge from "@/components/ui/TokenUsageBadge";

interface WorkspaceLayoutProps {
  session: SessionState;
  mutate?: () => void;
}

export default function WorkspaceLayout({ session, mutate }: WorkspaceLayoutProps) {
  const router = useRouter();
  const [secondaryOpen, setSecondaryOpen] = useState(true);
  const [tertiaryOpen, setTertiaryOpen] = useState(true);
  const [isStartingRound, setIsStartingRound] = useState(false);
  const [isExporting, setIsExporting] = useState(false);

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

  return (
    <div className="min-h-screen flex flex-col">
      {/* Header */}
      <header className="border-b border-gray-800 px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <button
            onClick={() => router.push("/")}
            className="text-gray-400 hover:text-gray-200 text-sm"
          >
            ← Back
          </button>
          <h1 className="text-lg font-semibold text-gray-100 truncate max-w-md">
            {session.problemDescription.slice(0, 60)}
            {session.problemDescription.length > 60 ? "..." : ""}
          </h1>
          <SessionStatusBadge status={session.status} />
          <span className="text-xs text-gray-500">Round {session.currentRound}</span>
        </div>
        <div className="flex items-center gap-3">
          <TokenUsageBadge usage={session.tokenUsage} />
          <button
            onClick={() => setSecondaryOpen(!secondaryOpen)}
            className="px-2 py-1 text-xs bg-gray-800 border border-gray-700 rounded text-gray-300 hover:bg-gray-700"
          >
            {secondaryOpen ? "Hide Agents" : "Show Agents"}
          </button>
          <button
            onClick={() => setTertiaryOpen(!tertiaryOpen)}
            className="px-2 py-1 text-xs bg-gray-800 border border-gray-700 rounded text-gray-300 hover:bg-gray-700"
          >
            {tertiaryOpen ? "Hide Timeline" : "Show Timeline"}
          </button>
        </div>
      </header>

      {/* Main Grid */}
      <div className="flex-1 grid gap-0 overflow-hidden" style={{
        gridTemplateColumns: `1fr ${secondaryOpen ? "minmax(280px, 30%)" : ""} ${tertiaryOpen ? "minmax(200px, 15%)" : ""}`,
      }}>
        {/* Primary Panel (60%) */}
        <div className="overflow-y-auto border-r border-gray-800 p-4 space-y-6">
          {/* Round in progress banner */}
          {session.currentStage && session.currentStage !== "awaiting-intervention" && (
            <div className="p-4 border border-blue-700/50 rounded-lg bg-blue-900/10 flex items-center gap-3">
              <div className="w-3 h-3 rounded-full bg-blue-400 animate-pulse" />
              <div>
                <p className="text-sm font-medium text-blue-200">Round {session.currentRound} in progress</p>
                <p className="text-xs text-blue-400 capitalize">Stage: {session.currentStage}</p>
              </div>
            </div>
          )}

          {/* Empty state for fresh sessions */}
          {session.currentRound === 0 && session.artifacts.length === 0 && !session.currentStage && (
            <div className="p-6 border border-dashed border-gray-600 rounded-lg text-center">
              <p className="text-gray-300 font-medium mb-1">Ready to start</p>
              <p className="text-sm text-gray-500 mb-4">
                Click &quot;Start Round&quot; below to begin the multi-agent debate. Four AI engineers will analyze your problem and produce artifacts.
              </p>
            </div>
          )}

          <SharedWorkspace session={session} />
          {session.currentStage === "awaiting-intervention" && (
            <InterventionPanel sessionId={session.id} />
          )}
          <ArtifactsPanel artifacts={session.artifacts} sessionId={session.id} onStatusChange={mutate} />
          <EngineeringOutcomesPanel artifacts={session.artifacts} />
          <ConsensusDashboard consensus={session.consensus} />
        </div>

        {/* Secondary Panel - Agents (30%) */}
        {secondaryOpen && (
          <div className="overflow-y-auto border-r border-gray-800 p-4 space-y-4">
            <h2 className="text-sm font-semibold text-gray-300 uppercase tracking-wide">Agents</h2>
            {session.agents.map((agent) => (
              <AgentPanel key={agent.id} agent={agent} isRoundActive={!!session.currentStage && session.currentStage !== "awaiting-intervention"} />
            ))}
          </div>
        )}

        {/* Tertiary Panel - Timeline (10-15%) */}
        {tertiaryOpen && (
          <div className="overflow-y-auto p-3">
            <DebateTimeline sessionId={session.id} currentRound={session.currentRound} currentStage={session.currentStage} />
          </div>
        )}
      </div>

      {/* Footer */}
      <footer className="border-t border-gray-800 px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button
            onClick={handleStartRound}
            disabled={isStartingRound || session.status !== "active" || (session.currentStage !== null && session.currentStage !== "awaiting-intervention")}
            className="px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-700 disabled:text-gray-500 text-white text-sm font-medium rounded-lg transition-colors"
          >
            {isStartingRound ? "Starting..." : "Start Round"}
          </button>
          <button
            onClick={handleEndSession}
            disabled={session.status === "completed"}
            className="px-4 py-2 bg-gray-700 hover:bg-gray-600 disabled:opacity-50 text-gray-200 text-sm rounded-lg transition-colors"
          >
            End Session
          </button>
          <button
            onClick={handleExport}
            disabled={isExporting}
            className="px-4 py-2 bg-gray-700 hover:bg-gray-600 disabled:opacity-50 text-gray-200 text-sm rounded-lg transition-colors"
          >
            {isExporting ? "Exporting..." : "Export"}
          </button>
          {session.currentRound > 0 && (
            <button
              onClick={() => router.push(`/sessions/${session.id}/results`)}
              className="px-4 py-2 bg-gray-700 hover:bg-gray-600 text-gray-200 text-sm rounded-lg transition-colors"
            >
              View Results
            </button>
          )}
        </div>
        <div className="text-xs text-gray-500">
          {session.tokenUsage.estimatedCostUsd > 0 && (
            <span>Budget: ${session.tokenUsage.estimatedCostUsd.toFixed(4)} spent</span>
          )}
        </div>
      </footer>
    </div>
  );
}

function SessionStatusBadge({ status }: { status: "active" | "paused" | "completed" }) {
  const colors = {
    active: "bg-green-900/50 text-green-400 border-green-700",
    paused: "bg-yellow-900/50 text-yellow-400 border-yellow-700",
    completed: "bg-blue-900/50 text-blue-400 border-blue-700",
  };

  return (
    <span className={`px-2 py-0.5 text-xs rounded-full border ${colors[status]}`}>
      {status}
    </span>
  );
}
