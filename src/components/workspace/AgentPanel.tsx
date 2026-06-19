"use client";

import { useState } from "react";
import type { AgentState } from "@/types/domain";
import StanceBadge from "@/components/ui/StanceBadge";
import ConfidenceBadge from "@/components/ui/ConfidenceBadge";
import MarkdownRenderer from "@/components/ui/MarkdownRenderer";

interface AgentPanelProps {
  agent: AgentState;
  isRoundActive?: boolean;
}

export default function AgentPanel({ agent, isRoundActive }: AgentPanelProps) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="border border-gray-700 rounded-lg bg-gray-900/50 overflow-hidden">
      {/* Agent Header */}
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full text-left px-3 py-2.5 hover:bg-gray-800/50 transition-colors"
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium text-gray-200">{agent.displayName}</span>
            <StanceBadge stance={agent.currentStance} />
          </div>
          <div className="flex items-center gap-2">
            <ConfidenceBadge confidence={agent.confidence} />
            {agent.hasCompletedCurrentStage ? (
              <span className="text-xs text-green-400">Complete ✓</span>
            ) : isRoundActive ? (
              <span className="text-xs text-yellow-400 animate-pulse">Thinking...</span>
            ) : null}
          </div>
        </div>
      </button>

      {/* Expanded Detail */}
      {expanded && (
        <div className="px-3 pb-3 border-t border-gray-700/50">
          <p className="text-xs text-gray-500 mt-2 mb-2">{agent.objectiveFunction}</p>
          {agent.currentPosition && (
            <div className="mt-2 p-2 bg-gray-800/50 rounded text-xs">
              <MarkdownRenderer content={agent.currentPosition} />
            </div>
          )}
        </div>
      )}
    </div>
  );
}
