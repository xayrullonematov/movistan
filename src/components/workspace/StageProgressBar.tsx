"use client";

import {
  MessageSquare,
  Search,
  RefreshCw,
  CheckCircle,
  Hand,
} from "lucide-react";
import type { RoundStage } from "@/types/domain";

interface StageProgressBarProps {
  currentStage: RoundStage | null;
  completedStages: RoundStage[];
  currentRound?: number;
}

const stages: {
  id: RoundStage;
  label: string;
  description: string;
  icon: typeof MessageSquare;
}[] = [
  { id: "proposal", label: "Scanning", description: "Agents inspect files and gather initial findings", icon: MessageSquare },
  { id: "critique", label: "Reviewing", description: "Agents challenge risks and verify likely issues", icon: Search },
  { id: "revision", label: "Refining", description: "Agents improve findings and fixes", icon: RefreshCw },
  { id: "consensus", label: "Finalizing", description: "Agents produce the review report", icon: CheckCircle },
];

export default function StageProgressBar({
  currentStage,
  completedStages,
  currentRound = 0,
}: StageProgressBarProps) {
  const showIntervention = currentStage === "awaiting-intervention";

  const getSegmentState = (
    stageId: RoundStage
  ): "completed" | "active" | "pending" => {
    if (completedStages.includes(stageId)) return "completed";
    if (currentStage === stageId) return "active";
    return "pending";
  };

  const stageLabel = currentStage
    ? stages.find((s) => s.id === currentStage)?.label ?? currentStage
    : null;

  const currentLabel = currentStage
    ? currentStage === "awaiting-intervention"
      ? `Round ${currentRound}: review needed`
      : `Round ${currentRound}: ${stageLabel} in progress`
    : currentRound === 0
      ? "Ready to start first round"
      : `Round ${currentRound}: waiting for next action`;

  return (
    <div className="w-full border-b border-[#34362f] bg-[#151712] px-3 py-2 sm:px-4 sm:py-3">
      <div className="flex items-center justify-between gap-3 sm:hidden">
        <div className="flex min-w-0 items-center gap-2">
          {showIntervention ? (
            <Hand size={17} className="shrink-0 text-yellow-300" />
          ) : currentStage ? (
            <RefreshCw size={17} className="shrink-0 text-violet-300" />
          ) : (
            <MessageSquare size={17} className="shrink-0 text-gray-300" />
          )}
          <span className="truncate text-sm font-medium text-gray-100">{currentLabel}</span>
        </div>
        <span className="shrink-0 rounded-full border border-gray-700 bg-gray-950/50 px-2 py-0.5 text-xs text-gray-300">
          {completedStages.length}/4
        </span>
      </div>
      <div className="hidden items-center gap-1 sm:flex">
        {stages.map((stage, idx) => {
          const state = getSegmentState(stage.id);
          const Icon = stage.icon;

          return (
            <div key={stage.id} className="flex items-center flex-1">
              <div
                className={`
                  relative flex items-center gap-2 px-3 py-2 rounded-lg flex-1 transition-all duration-300
                  ${
                    state === "completed"
                      ? "bg-green-500/15 border border-green-600/50"
                      : state === "active"
                        ? "bg-violet-500/10 border border-violet-500/50"
                        : "bg-gray-800/50 border border-gray-700"
                  }
                `}
                title={stage.description}
              >
                {/* Active segment fill */}
                {state === "active" && (
                  <div className="absolute inset-0 rounded-lg overflow-hidden">
                    <div className="absolute inset-0 bg-violet-500/5" />
                  </div>
                )}

                <div className="relative flex items-center gap-2">
                  {state === "completed" ? (
                    <CheckCircle size={16} className="text-green-400 shrink-0" />
                  ) : (
                    <Icon
                      size={16}
                      className={`shrink-0 ${
                        state === "active"
                          ? "text-violet-300 animate-pulse"
                          : "text-gray-500"
                      }`}
                    />
                  )}
                  <span
                    className={`text-xs font-medium whitespace-nowrap ${
                      state === "completed"
                        ? "text-green-400"
                        : state === "active"
                          ? "text-violet-300"
                          : "text-gray-500"
                    }`}
                  >
                    {stage.label}
                  </span>
                </div>
              </div>

              {/* Connector arrow between segments */}
              {idx < stages.length - 1 && (
                <div className="mx-1 text-gray-600 shrink-0">
                  <svg width="12" height="12" viewBox="0 0 12 12">
                    <path
                      d="M2 6h8M7 3l3 3-3 3"
                      stroke="currentColor"
                      strokeWidth="1.5"
                      fill="none"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                </div>
              )}
            </div>
          );
        })}

        {/* Intervention segment */}
        {showIntervention && (
          <>
            <div className="mx-1 text-gray-600 shrink-0">
              <svg width="12" height="12" viewBox="0 0 12 12">
                <path
                  d="M2 6h8M7 3l3 3-3 3"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  fill="none"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </div>
            <div className="relative flex items-center gap-2 px-3 py-2 rounded-lg bg-yellow-500/15 border border-yellow-500/50 animate-pulse">
              <Hand size={16} className="text-yellow-400 shrink-0" />
              <span className="text-xs font-medium text-yellow-300 whitespace-nowrap">
                Your Turn
              </span>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
