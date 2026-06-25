"use client";

import { useEffect, useMemo, useState } from "react";
import { Clock } from "lucide-react";
import type { PersistedEvent, RoundStage } from "@/types/domain";

interface RoundEtaIndicatorProps {
  events: PersistedEvent[];
  currentRound: number;
  currentStage: RoundStage | null;
}

const STAGE_WEIGHTS: Record<RoundStage, number> = {
  proposal: 0.30,
  critique: 0.30,
  revision: 0.25,
  consensus: 0.15,
  "awaiting-intervention": 0,
};

function fmt(ms: number): string {
  if (!Number.isFinite(ms) || ms <= 0) return "<10s";
  const s = Math.round(ms / 1000);
  if (s < 60) return `~${s}s`;
  const m = Math.round(s / 60);
  return `~${m}m`;
}

function deriveRoundDurations(events: PersistedEvent[]): number[] {
  const startsByRound = new Map<number, number>();
  const endsByRound = new Map<number, number>();
  for (const event of events) {
    if (event.type === "round-started") {
      startsByRound.set(event.round, new Date(event.timestamp).getTime());
    } else if (event.type === "round-completed") {
      endsByRound.set(event.round, new Date(event.timestamp).getTime());
    }
  }
  const durations: number[] = [];
  for (const [round, start] of startsByRound) {
    const end = endsByRound.get(round);
    if (end && end > start) durations.push(end - start);
  }
  return durations;
}

function fractionComplete(currentStage: RoundStage | null): number {
  if (!currentStage || currentStage === "awaiting-intervention") return 1;
  const order: RoundStage[] = ["proposal", "critique", "revision", "consensus"];
  const idx = order.indexOf(currentStage);
  if (idx < 0) return 0;
  let done = 0;
  for (let i = 0; i < idx; i++) done += STAGE_WEIGHTS[order[i]];
  return done; // exclude the current stage itself (we don't know how far through it is)
}

export default function RoundEtaIndicator({
  events,
  currentRound,
  currentStage,
}: RoundEtaIndicatorProps) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 3000);
    return () => window.clearInterval(id);
  }, []);

  const { etaMs, confidence } = useMemo(() => {
    const durations = deriveRoundDurations(events);
    if (durations.length === 0) {
      return { etaMs: null, confidence: "low" as const };
    }
    const avg = durations.reduce((a, b) => a + b, 0) / durations.length;
    const fraction = fractionComplete(currentStage);
    const remainingFraction = Math.max(0, 1 - fraction);

    // Use start of current round as anchor to refine estimate
    let elapsed = 0;
    for (const e of events) {
      if (e.type === "round-started" && e.round === currentRound) {
        elapsed = Math.max(0, now - new Date(e.timestamp).getTime());
        break;
      }
    }
    // If we have elapsed time, blend it with the historical average.
    const naive = avg * remainingFraction;
    const elapsedBased = fraction > 0.05 ? (elapsed / fraction) * remainingFraction : naive;
    const blended = (naive + elapsedBased) / 2;

    const conf = durations.length >= 2 ? "high" : "medium";
    return { etaMs: blended, confidence: conf };
  }, [events, currentRound, currentStage, now]);

  if (!currentStage || currentStage === "awaiting-intervention") return null;

  const confColor = {
    high: "text-blue-300",
    medium: "text-gray-300",
    low: "text-gray-400",
  }[confidence];

  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-md border border-gray-700 bg-gray-900/70 px-2 py-0.5 text-xs"
      title={
        etaMs === null
          ? "No prior rounds — estimate will appear after the first completes"
          : `Based on ${confidence === "high" ? "average of past rounds" : "one past round"}`
      }
    >
      <Clock size={11} className="text-gray-400" />
      <span className="text-gray-400">ETA</span>
      <span className={confColor}>{etaMs === null ? "—" : fmt(etaMs)}</span>
    </span>
  );
}
