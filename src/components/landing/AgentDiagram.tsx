"use client";

/**
 * AgentDiagram - SVG component showing 4 agent nodes arranged in a diamond pattern
 * with animated dashed lines between critique pairs.
 *
 * Layout: top=senior(blue), right=security(red), bottom=performance(amber), left=product(violet)
 * Critique pairs: senior<->performance, security<->product
 */

import { useState } from "react";

interface AgentNode {
  id: string;
  label: string;
  color: string;
  cx: number;
  cy: number;
}

const agents: AgentNode[] = [
  { id: "senior", label: "Architect", color: "#3b82f6", cx: 200, cy: 60 },
  { id: "security", label: "Guardian", color: "#ef4444", cx: 340, cy: 200 },
  { id: "performance", label: "Optimizer", color: "#f59e0b", cx: 200, cy: 340 },
  { id: "product", label: "Advocate", color: "#8b5cf6", cx: 60, cy: 200 },
];

const critiquePairs: [number, number][] = [
  [0, 2], // senior <-> performance
  [1, 3], // security <-> product
];

export default function AgentDiagram() {
  const [hoveredAgent, setHoveredAgent] = useState<string | null>(null);

  return (
    <div className="w-full max-w-sm mx-auto" aria-label="Agent communication diagram">
      <svg viewBox="0 0 400 400" className="w-full h-auto">
        <defs>
          {agents.map((agent) => (
            <filter key={`glow-${agent.id}`} id={`glow-${agent.id}`}>
              <feGaussianBlur stdDeviation="6" result="blur" />
              <feFlood floodColor={agent.color} floodOpacity="0.6" result="color" />
              <feComposite in="color" in2="blur" operator="in" result="glow" />
              <feMerge>
                <feMergeNode in="glow" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
          ))}
        </defs>

        {/* Animated dashed lines between critique pairs */}
        {critiquePairs.map(([a, b], i) => (
          <line
            key={`line-${i}`}
            x1={agents[a].cx}
            y1={agents[a].cy}
            x2={agents[b].cx}
            y2={agents[b].cy}
            stroke={i === 0 ? "#3b82f6" : "#8b5cf6"}
            strokeWidth="2"
            strokeDasharray="8 6"
            strokeOpacity="0.5"
            className="animate-[flow-dash_2s_linear_infinite]"
          />
        ))}

        {/* Faint connection lines between all agents */}
        {agents.map((agent, i) =>
          agents.slice(i + 1).map((other, j) => {
            const isCritiquePair = critiquePairs.some(
              ([a, b]) =>
                (a === i && b === i + 1 + j) || (b === i && a === i + 1 + j)
            );
            if (isCritiquePair) return null;
            return (
              <line
                key={`faint-${i}-${j}`}
                x1={agent.cx}
                y1={agent.cy}
                x2={other.cx}
                y2={other.cy}
                stroke="#374151"
                strokeWidth="1"
                strokeDasharray="4 4"
                strokeOpacity="0.3"
              />
            );
          })
        )}

        {/* Agent nodes */}
        {agents.map((agent) => {
          const isHovered = hoveredAgent === agent.id;
          return (
            <g
              key={agent.id}
              onMouseEnter={() => setHoveredAgent(agent.id)}
              onMouseLeave={() => setHoveredAgent(null)}
              className="cursor-pointer transition-transform duration-300"
              style={{
                filter: isHovered ? `url(#glow-${agent.id})` : undefined,
              }}
            >
              {/* Outer ring animation */}
              <circle
                cx={agent.cx}
                cy={agent.cy}
                r={isHovered ? 34 : 30}
                fill="none"
                stroke={agent.color}
                strokeWidth="2"
                strokeOpacity={isHovered ? 0.8 : 0.3}
                className="transition-all duration-300"
              />
              {/* Main circle */}
              <circle
                cx={agent.cx}
                cy={agent.cy}
                r={26}
                fill={`${agent.color}20`}
                stroke={agent.color}
                strokeWidth="2.5"
                className="transition-all duration-300"
              />
              {/* Icon placeholder - simple geometric shape */}
              <circle
                cx={agent.cx}
                cy={agent.cy}
                r={8}
                fill={agent.color}
                opacity={0.8}
              />
              {/* Label below */}
              <text
                x={agent.cx}
                y={agent.cy + 50}
                textAnchor="middle"
                fill="#9ca3af"
                fontSize="13"
                fontWeight="500"
              >
                {agent.label}
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}
