"use client";

import { useState, useRef, useEffect } from "react";
import type { SessionTokenUsage } from "@/types/domain";

interface TokenUsageBadgeProps {
  usage: SessionTokenUsage;
}

export default function TokenUsageBadge({ usage }: TokenUsageBadgeProps) {
  const [showDetail, setShowDetail] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!showDetail) return;
    const handleClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setShowDetail(false);
      }
    };
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [showDetail]);

  if (usage.estimatedCostUsd === 0 && usage.totalInputTokens === 0) {
    return null;
  }

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setShowDetail(!showDetail)}
        className="px-2 py-1 text-xs bg-gray-800 border border-gray-700 rounded text-gray-300 hover:bg-gray-700 font-mono"
      >
        ${usage.estimatedCostUsd.toFixed(4)}
      </button>

      {showDetail && (
        <div className="absolute top-full right-0 mt-1 w-56 p-3 bg-gray-800 border border-gray-700 rounded-lg shadow-xl z-50">
          <h4 className="text-xs font-medium text-gray-300 mb-2">Token Usage</h4>
          <div className="space-y-1 text-xs">
            <div className="flex justify-between text-gray-400">
              <span>Input tokens:</span>
              <span className="text-gray-200 font-mono">
                {usage.totalInputTokens.toLocaleString()}
              </span>
            </div>
            <div className="flex justify-between text-gray-400">
              <span>Output tokens:</span>
              <span className="text-gray-200 font-mono">
                {usage.totalOutputTokens.toLocaleString()}
              </span>
            </div>
            <div className="flex justify-between text-gray-400 pt-1 border-t border-gray-700">
              <span>Estimated cost:</span>
              <span className="text-gray-200 font-mono">
                ${usage.estimatedCostUsd.toFixed(4)}
              </span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
