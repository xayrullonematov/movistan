"use client";

import { useState } from "react";
import type { AgentState, AgentType, PersistedEvent, RoundStage } from "@/types/domain";
import AgentCard, { agentColors } from "./AgentCard";
import AgentStatusStream from "./AgentStatusStream";

interface AgentArenaProps {
  agents: AgentState[];
  currentStage: RoundStage | null;
  activeAgentId?: string;
  lastEventByAgent?: Partial<Record<AgentType, PersistedEvent>>;
  compact?: boolean;
  onRequestExpand?: () => void;
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

export default function AgentArena({
  agents,
  currentStage,
  activeAgentId,
  lastEventByAgent = {},
  compact = false,
  onRequestExpand,
}: AgentArenaProps) {
  const [expandedAgent, setExpandedAgent] = useState<AgentType | null>(null);
  const isActive = currentStage !== null && currentStage !== "awaiting-intervention";

  const handleAgentToggle = (agentId: AgentType) => {
    if (compact) {
      setExpandedAgent(agentId);
      onRequestExpand?.();
      return;
    }
    setExpandedAgent(expandedAgent === agentId ? null : agentId);
  };

  return (
    <div className="flex flex-col h-full">
      <div className={compact ? "relative px-3 py-2" : "relative p-4"}>
        <svg
          viewBox="0 0 280 200"
          className={compact ? "h-auto max-h-[128px] w-full" : "h-auto max-h-[200px] w-full"}
          role="img"
          aria-label="Agent communication visualization showing four AI engineers arranged in a diamond pattern with connection lines between critique pairs"
        >
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

          {agents.map((agent) => {
            const pos = agentPositions[agent.id];
            const isAgentActive = activeAgentId === agent.id;
            const isSpeaking = isAgentActive && isActive;

            return (
              <g key={agent.id} role="img" aria-label={`${agent.displayName} agent node${isSpeaking ? ", currently speaking" : ""}`}>
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

                {!compact && (
                  <text
                    x={pos.cx}
                    y={pos.cy + 32}
                    textAnchor="middle"
                    className="fill-gray-400 text-[10px]"
                    style={{ fontSize: "10px" }}
                  >
                    {agent.displayName.split(" ").pop()}
                  </text>
                )}
              </g>
            );
          })}
        </svg>
      </div>

      <div className={compact ? "flex-1 space-y-2 overflow-y-auto px-2 pb-3" : "flex-1 space-y-2 overflow-y-auto px-3 pb-3"}>
        {agents.map((agent) => (
          <div key={agent.id} className="space-y-1">
            <AgentCard
              agent={agent}
              currentStage={currentStage}
              activeAgentId={activeAgentId}
              lastEvent={lastEventByAgent[agent.id]}
              expanded={!compact && expandedAgent === agent.id}
              compact={compact}
              onToggle={() => handleAgentToggle(agent.id)}
            />
            {isActive && !compact && expandedAgent !== agent.id && (
              <div className="px-1">
                <AgentStatusStream
                  agent={agent.id}
                  lastEvent={lastEventByAgent[agent.id]}
                  currentStage={currentStage}
                />
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
