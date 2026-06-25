"use client";

/**
 * AgentDiagram - SVG component showing 4 review roles arranged in a diamond pattern
 * with muted connection lines between critique pairs.
 *
 * Layout: top=architect(teal), right=security(red), bottom=performance(amber), left=product(cyan)
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
  { id: "senior", label: "Architect", color: "#14b8a6", cx: 200, cy: 60 },
  { id: "security", label: "Guardian", color: "#ef4444", cx: 340, cy: 200 },
  { id: "performance", label: "Optimizer", color: "#f59e0b", cx: 200, cy: 340 },
  { id: "product", label: "Advocate", color: "#38bdf8", cx: 60, cy: 200 },
];

const critiquePairs: [number, number][] = [
  [0, 2], // senior <-> performance
  [1, 3], // security <-> product
];

export default function AgentDiagram() {
  const [hoveredAgent, setHoveredAgent] = useState<string | null>(null);

  return (
    <div className="mx-auto w-full max-w-[15rem] sm:max-w-sm" aria-label="Agent communication diagram">
      <svg viewBox="0 0 400 400" className="w-full h-auto">

        {/* Critique lines between review pairs */}
        {critiquePairs.map(([a, b], i) => (
          <line
            key={`line-${i}`}
            x1={agents[a].cx}
            y1={agents[a].cy}
            x2={agents[b].cx}
            y2={agents[b].cy}
            stroke={i === 0 ? "#14b8a6" : "#f59e0b"}
            strokeWidth="2"
            strokeDasharray="8 6"
            strokeOpacity="0.45"
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
                stroke="#4a4a42"
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
            >
              {/* Outer ring */}
              <circle
                cx={agent.cx}
                cy={agent.cy}
                r={isHovered ? 34 : 30}
                fill="none"
                stroke={agent.color}
                strokeWidth="2"
                strokeOpacity={isHovered ? 0.75 : 0.35}
                className="transition-all duration-300"
              />
              {/* Main circle */}
              <circle
                cx={agent.cx}
                cy={agent.cy}
                r={26}
                fill={`${agent.color}18`}
                stroke={agent.color}
                strokeWidth="2.5"
                className="transition-all duration-300"
              />
              {/* Agent icon */}
              {agent.id === "senior" && (
                /* Architect - layers/building icon */
                <path
                  d={`M${agent.cx - 8} ${agent.cy + 4} L${agent.cx} ${agent.cy - 8} L${agent.cx + 8} ${agent.cy + 4} Z M${agent.cx - 6} ${agent.cy + 4} L${agent.cx - 6} ${agent.cy + 8} L${agent.cx + 6} ${agent.cy + 8} L${agent.cx + 6} ${agent.cy + 4}`}
                  fill={agent.color}
                  opacity={0.9}
                />
              )}
              {agent.id === "security" && (
                /* Guardian - shield icon */
                <path
                  d={`M${agent.cx} ${agent.cy - 9} L${agent.cx - 8} ${agent.cy - 5} L${agent.cx - 8} ${agent.cy + 2} C${agent.cx - 8} ${agent.cy + 6} ${agent.cx} ${agent.cy + 9} ${agent.cx} ${agent.cy + 9} C${agent.cx} ${agent.cy + 9} ${agent.cx + 8} ${agent.cy + 6} ${agent.cx + 8} ${agent.cy + 2} L${agent.cx + 8} ${agent.cy - 5} Z`}
                  fill={agent.color}
                  opacity={0.9}
                />
              )}
              {agent.id === "performance" && (
                /* Optimizer - lightning bolt icon */
                <path
                  d={`M${agent.cx + 2} ${agent.cy - 9} L${agent.cx - 5} ${agent.cy + 1} L${agent.cx} ${agent.cy + 1} L${agent.cx - 2} ${agent.cy + 9} L${agent.cx + 5} ${agent.cy - 1} L${agent.cx} ${agent.cy - 1} Z`}
                  fill={agent.color}
                  opacity={0.9}
                />
              )}
              {agent.id === "product" && (
                /* Advocate - star icon */
                <path
                  d={`M${agent.cx} ${agent.cy - 9} L${agent.cx + 3} ${agent.cy - 3} L${agent.cx + 9} ${agent.cy - 2} L${agent.cx + 5} ${agent.cy + 3} L${agent.cx + 6} ${agent.cy + 9} L${agent.cx} ${agent.cy + 6} L${agent.cx - 6} ${agent.cy + 9} L${agent.cx - 5} ${agent.cy + 3} L${agent.cx - 9} ${agent.cy - 2} L${agent.cx - 3} ${agent.cy - 3} Z`}
                  fill={agent.color}
                  opacity={0.9}
                />
              )}
              {/* Label below */}
              <text
                x={agent.cx}
                y={agent.cy + 50}
                textAnchor="middle"
                fill="#b8b0a2"
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
