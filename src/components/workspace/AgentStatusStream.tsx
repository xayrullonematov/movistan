"use client";

import { useEffect, useState } from "react";
import type { AgentType, PersistedEvent, RoundStage } from "@/types/domain";

interface AgentStatusStreamProps {
  agent: AgentType;
  /** Last persisted event for this agent (from useEventStream.lastEventByAgent). */
  lastEvent?: PersistedEvent;
  /** Current round stage from the projected session. */
  currentStage: RoundStage | null;
  /** Compact = one-line pill suitable for cards; full = with timestamp. */
  variant?: "compact" | "full";
}

const stageVerb: Record<RoundStage, string> = {
  proposal: "drafting proposal",
  critique: "writing critique",
  revision: "revising",
  consensus: "synthesising consensus",
  "awaiting-intervention": "waiting on you",
};

function deriveLabel(
  lastEvent: PersistedEvent | undefined,
  currentStage: RoundStage | null,
): { label: string; tone: "active" | "complete" | "idle" } {
  if (!currentStage || currentStage === "awaiting-intervention") {
    return { label: "Idle", tone: "idle" };
  }
  if (!lastEvent) {
    return { label: `Thinking · ${stageVerb[currentStage]}`, tone: "active" };
  }
  if (lastEvent.type === "stage-progress" && lastEvent.stage === currentStage) {
    try {
      const data = JSON.parse(lastEvent.content) as { status?: string };
      if (data.status === "completed") {
        return { label: `Finished ${currentStage}`, tone: "complete" };
      }
    } catch {
      // fall through
    }
  }
  if (lastEvent.stage === currentStage) {
    return { label: `Working · ${stageVerb[currentStage]}`, tone: "active" };
  }
  return { label: `Thinking · ${stageVerb[currentStage]}`, tone: "active" };
}

function timeAgo(timestamp: string, now: number): string {
  const t = new Date(timestamp).getTime();
  if (!Number.isFinite(t)) return "";
  const seconds = Math.max(0, Math.floor((now - t) / 1000));
  if (seconds < 5) return "just now";
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  return `${hours}h ago`;
}

export default function AgentStatusStream({
  agent,
  lastEvent,
  currentStage,
  variant = "compact",
}: AgentStatusStreamProps) {
  // Re-render every 5s so the timestamp stays fresh without spamming work.
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (variant !== "full") return;
    const id = window.setInterval(() => setNow(Date.now()), 5000);
    return () => window.clearInterval(id);
  }, [variant]);

  const { label, tone } = deriveLabel(lastEvent, currentStage);

  const toneClass = {
    active: "bg-emerald-500/10 text-emerald-300 border-emerald-500/40",
    complete: "bg-green-500/15 text-green-300 border-green-500/40",
    idle: "bg-gray-800/60 text-gray-400 border-gray-700",
  }[tone];

  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-xs font-medium ${toneClass}`}
      aria-label={`${agent} status: ${label}`}
    >
      <span
        className={`h-1.5 w-1.5 rounded-full ${
          tone === "active" ? "animate-pulse bg-emerald-400" : tone === "complete" ? "bg-green-400" : "bg-gray-500"
        }`}
      />
      <span>{label}</span>
      {variant === "full" && lastEvent && (
        <span className="text-gray-500"> · {timeAgo(lastEvent.timestamp, now)}</span>
      )}
    </span>
  );
}
