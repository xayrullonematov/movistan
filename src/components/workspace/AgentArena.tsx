"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import type { AgentState, AgentType, RoundStage } from "@/types/domain";
import AgentAvatar from "./AgentAvatar";
import StanceBadge from "@/components/ui/StanceBadge";
import ConfidenceBadge from "@/components/ui/ConfidenceBadge";

interface AgentArenaProps {
  agents: AgentState[];
  currentStage: RoundStage | null;
  activeAgentId?: string;
}

/**
 * Diamond positions for 4 agents in the SVG viewBox (280x200).
 * top=senior, right=security, bottom=performance, left=product
 */
const agentPositions: Record<AgentType, { cx: number; cy: number }> = {
  "senior-engineer": { cx: 140, cy: 30 },
  "security-engineer": { cx: 250, cy: 100 },
  "performance-engineer": { cx: 140, cy: 170 },
  "product-engineer": { cx: 30, cy: 100 },
};

/** Critique pairs - opposing pairs for animated connection lines */
const critiquePairs: [AgentType, AgentType][] = [
  ["senior-engineer", "performance-engineer"],
  ["security-engineer", "product-engineer"],
];

const agentColors: Record<AgentType, string> = {
  "senior-engineer": "#3b82f6",
  "security-engineer": "#ef4444",
  "performance-engineer": "#f59e0b",
  "product-engineer": "#8b5cf6",
};

const borderColors: Record<AgentType, string> = {
  "senior-engineer": "border-l-blue-500",
  "security-engineer": "border-l-red-500",
  "performance-engineer": "border-l-amber-500",
  "product-engineer": "border-l-violet-500",
};

function getAgentStatus(
  agent: AgentState,
  currentStage: RoundStage | null,
  activeAgentId?: string
): { label: string; className: string } {
  if (!currentStage || currentStage === "awaiting-intervention") {
    return { label: "Idle", className: "text-gray-500" };
  }
  if (activeAgentId === agent.id) {
    return { label: "Thinking...", className: "text-blue-400 animate-pulse" };
  }
  if (agent.hasCompletedCurrentStage) {
    return { label: "Done", className: "text-green-400" };
  }
  return { label: "Waiting", className: "text-gray-500" };
}

export default function AgentArena({
  agents,
  currentStage,
  activeAgentId,
}: AgentArenaProps) {
  const [expandedAgent, setExpandedAgent] = useState<AgentType | null>(null);
  const isActive = currentStage !== null && currentStage !== "awaiting-intervention";

  return (
    <div className="flex flex-col h-full">
      {/* Top half: SVG diamond layout */}
      <div className="relative p-4">
        <svg
          viewBox="0 0 280 200"
          className="w-full h-auto max-h-[200px]"
          role="img"
          aria-label="Agent communication visualization showing four AI engineers arranged in a diamond pattern with connection lines between critique pairs"
        >
          {/* Connection lines between critique pairs */}
          {critiquePairs.map(([a, b]) => {
            const posA = agentPositions[a];
            const posB = agentPositions[b];
            return (
              <line
                key={`${a}-${b}`}
                x1={posA.cx}
                y1={posA.cy}
                x2={posB.cx}
                y2={posB.cy}
                stroke={isActive ? agentColors[a] : "#374151"}
                strokeWidth={isActive ? 1.5 : 1}
                strokeDasharray="6 4"
                opacity={isActive ? 0.6 : 0.3}
                className={isActive ? "animate-[flow-dash_2s_linear_infinite]" : ""}
              />
            );
          })}

          {/* All four connecting lines (full mesh outline, faded) */}
          {agents.map((agent, i) =>
            agents.slice(i + 1).map((other) => {
              const isPair = critiquePairs.some(
                ([a, b]) =>
                  (a === agent.id && b === other.id) ||
                  (b === agent.id && a === other.id)
              );
              if (isPair) return null;
              const posA = agentPositions[agent.id];
              const posB = agentPositions[other.id];
              return (
                <line
                  key={`${agent.id}-${other.id}`}
                  x1={posA.cx}
                  y1={posA.cy}
                  x2={posB.cx}
                  y2={posB.cy}
                  stroke="#374151"
                  strokeWidth={0.5}
                  strokeDasharray="4 6"
                  opacity={0.2}
                />
              );
            })
          )}

          {/* Agent nodes */}
          {agents.map((agent) => {
            const pos = agentPositions[agent.id];
            const isAgentActive = activeAgentId === agent.id;
            const isSpeaking = isAgentActive && isActive;

            return (
              <g key={agent.id} role="img" aria-label={`${agent.displayName} agent node${isSpeaking ? ", currently speaking" : ""}`}>
                {/* Pulse ring when active */}
                {isSpeaking && (
                  <circle
                    cx={pos.cx}
                    cy={pos.cy}
                    r={22}
                    fill="none"
                    stroke={agentColors[agent.id]}
                    strokeWidth={1}
                    opacity={0.4}
                    className="animate-ping"
                  />
                )}

                {/* Agent circle background */}
                <circle
                  cx={pos.cx}
                  cy={pos.cy}
                  r={18}
                  fill={`${agentColors[agent.id]}20`}
                  stroke={agentColors[agent.id]}
                  strokeWidth={isSpeaking ? 2.5 : 1.5}
                  className={
                    !isActive ? "animate-[breathe_3s_ease-in-out_infinite]" : ""
                  }
                  style={{
                    transformOrigin: `${pos.cx}px ${pos.cy}px`,
                  }}
                />

                {/* Agent label */}
                <text
                  x={pos.cx}
                  y={pos.cy + 32}
                  textAnchor="middle"
                  className="fill-gray-400 text-[9px]"
                  style={{ fontSize: "9px" }}
                >
                  {agent.displayName.split(" ").pop()}
                </text>
              </g>
            );
          })}
        </svg>
      </div>

      {/* Bottom half: Agent detail cards */}
      <div className="flex-1 overflow-y-auto px-3 pb-3 space-y-2">
        {agents.map((agent) => {
          const status = getAgentStatus(agent, currentStage, activeAgentId);
          const isExpanded = expandedAgent === agent.id;

          return (
            <div
              key={agent.id}
              role="button"
              tabIndex={0}
              aria-expanded={isExpanded}
              aria-label={`${agent.displayName} - ${status.label}. Click to ${isExpanded ? "collapse" : "expand"} details.`}
              className={`
                border-l-2 rounded-lg bg-gray-800/50 border border-gray-700
                transition-all duration-200 cursor-pointer hover:bg-gray-800
                focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/70 focus-visible:ring-offset-1 focus-visible:ring-offset-gray-950
                ${borderColors[agent.id]}
              `}
              onClick={() =>
                setExpandedAgent(isExpanded ? null : agent.id)
              }
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  setExpandedAgent(isExpanded ? null : agent.id);
                }
              }}
            >
              <div className="flex items-center justify-between px-3 py-2">
                {/* Left: dot + name */}
                <div className="flex items-center gap-2 min-w-0">
                  <div
                    className="w-2.5 h-2.5 rounded-full shrink-0"
                    style={{ backgroundColor: agentColors[agent.id] }}
                  />
                  <span className="text-sm text-gray-200 truncate font-medium">
                    {agent.displayName}
                  </span>
                </div>

                {/* Center: stance + confidence */}
                <div className="flex items-center gap-2 mx-2">
                  <StanceBadge stance={agent.currentStance} />
                  <ConfidenceBadge confidence={agent.confidence} />
                </div>

                {/* Right: status */}
                <span className={`text-xs whitespace-nowrap ${status.className}`}>
                  {status.label}
                </span>
              </div>

              {/* Expanded: current position */}
              <AnimatePresence>
                {isExpanded && agent.currentPosition && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: "auto", opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    transition={{ duration: 0.2 }}
                    className="overflow-hidden"
                  >
                    <div className="px-3 pb-2 pt-1 border-t border-gray-700">
                      <p className="text-xs text-gray-400 leading-relaxed">
                        {agent.currentPosition}
                      </p>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          );
        })}
      </div>
    </div>
  );
}
