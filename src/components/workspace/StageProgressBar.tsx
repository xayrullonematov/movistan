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
}

const stages: {
  id: RoundStage;
  label: string;
  icon: typeof MessageSquare;
}[] = [
  { id: "proposal", label: "Proposal", icon: MessageSquare },
  { id: "critique", label: "Critique", icon: Search },
  { id: "revision", label: "Revision", icon: RefreshCw },
  { id: "consensus", label: "Consensus", icon: CheckCircle },
];

export default function StageProgressBar({
  currentStage,
  completedStages,
}: StageProgressBarProps) {
  const showIntervention = currentStage === "awaiting-intervention";

  const getSegmentState = (
    stageId: RoundStage
  ): "completed" | "active" | "pending" => {
    if (completedStages.includes(stageId)) return "completed";
    if (currentStage === stageId) return "active";
    return "pending";
  };

  return (
    <div className="w-full px-4 py-3 bg-gray-900 border-b border-gray-700">
      <div className="flex items-center gap-1">
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
                        ? "bg-blue-500/15 border border-blue-500/50"
                        : "bg-gray-800/50 border border-gray-700"
                  }
                `}
              >
                {/* Active segment animated gradient fill */}
                {state === "active" && (
                  <div className="absolute inset-0 rounded-lg overflow-hidden">
                    <div className="absolute inset-0 bg-gradient-to-r from-blue-500/20 via-violet-500/20 to-blue-500/20 animate-[gradient-shift_3s_ease_infinite] bg-[length:200%_100%]" />
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
                          ? "text-blue-400 animate-pulse"
                          : "text-gray-500"
                      }`}
                    />
                  )}
                  <span
                    className={`text-xs font-medium whitespace-nowrap ${
                      state === "completed"
                        ? "text-green-400"
                        : state === "active"
                          ? "text-blue-300"
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
