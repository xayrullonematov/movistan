"use client";

import type { RoundStage } from "@/types/domain";

interface RoundProgressIndicatorProps {
  currentStage: RoundStage | null;
}

const STAGES: RoundStage[] = ["proposal", "critique", "revision", "consensus"];

export default function RoundProgressIndicator({ currentStage }: RoundProgressIndicatorProps) {
  const currentIndex = currentStage ? STAGES.indexOf(currentStage) : -1;

  return (
    <div className="p-2 border border-gray-700 rounded-lg bg-gray-900/30">
      {currentStage ? (
        <div className="flex items-center gap-2">
            {STAGES.map((stage, i) => {
              const isComplete = i < currentIndex;
              const isCurrent = i === currentIndex;
              const isPending = i > currentIndex;

              return (
                <div key={stage} className="flex items-center gap-1">
                  <div
                    className={`w-2.5 h-2.5 rounded-full ${
                      isComplete
                        ? "bg-green-400"
                        : isCurrent
                        ? "bg-blue-400 animate-pulse"
                        : isPending
                        ? "border border-gray-600"
                        : "border border-gray-600"
                    }`}
                  />
                  <span className={`text-xs ${isCurrent ? "text-gray-300" : "text-gray-600"}`}>
                    {stage.slice(0, 4)}
                  </span>
                </div>
              );
            })}
          </div>
      ) : (
        <p className="text-xs text-gray-500 text-center">Idle — no active stage</p>
      )}
    </div>
  );
}
