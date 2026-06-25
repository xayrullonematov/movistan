"use client";

import { useState, useMemo } from "react";
import type { PersistedEvent, AgentType } from "@/types/domain";

interface ToolCallTraceProps {
  events: PersistedEvent[];
  currentStage: string | null;
}

interface StageProgressData {
  agentId: AgentType;
  stage: string;
  status: string;
  toolCallCount: number;
  capHit: boolean;
  filesRead: string[];
  groundedByRepo: boolean;
}

const agentDisplayNames: Record<AgentType, string> = {
  "senior-engineer": "Senior Engineer",
  "security-engineer": "Security Engineer",
  "performance-engineer": "Performance Engineer",
  "product-engineer": "Product Engineer",
};

const agentDotColors: Record<AgentType, string> = {
  "senior-engineer": "bg-blue-500",
  "security-engineer": "bg-red-500",
  "performance-engineer": "bg-amber-500",
  "product-engineer": "bg-violet-500",
};

export function parseStageProgress(event: PersistedEvent): StageProgressData | null {
  try {
    const data = JSON.parse(event.content);
    if (!data.groundedByRepo) return null;
    return {
      agentId: data.agentId || event.agentId || "senior-engineer",
      stage: data.stage || "",
      status: data.status || "",
      toolCallCount: data.toolCallCount || 0,
      capHit: data.capHit || false,
      filesRead: data.filesRead || [],
      groundedByRepo: true,
    };
  } catch {
    return null;
  }
}

export default function ToolCallTrace({ events, currentStage }: ToolCallTraceProps) {
  const [expanded, setExpanded] = useState(false);

  // Extract stage-progress events with tool data
  const stageProgressEvents = useMemo(
    () => events.filter((e) => e.type === "stage-progress"),
    [events]
  );

  const traceData = useMemo(() => {
    return stageProgressEvents
      .map(parseStageProgress)
      .filter((d): d is StageProgressData => d !== null);
  }, [stageProgressEvents]);

  // Count how many events were filtered out (not repo-grounded)
  const filteredCount = stageProgressEvents.length - traceData.length;

  // Find in-progress agents (status !== "completed")
  const activeTraces = useMemo(
    () => traceData.filter((d) => d.status !== "completed"),
    [traceData]
  );

  // Find completed traces
  const completedTraces = useMemo(
    () => traceData.filter((d) => d.status === "completed"),
    [traceData]
  );

  if (traceData.length === 0 && filteredCount === 0) {
    return null;
  }

  const isProposalStage = currentStage === "proposal";

  return (
    <div className="border border-gray-700 rounded-lg bg-gray-800/30 overflow-hidden">
      {/* Header - collapsible */}
      <div
        role="button"
        tabIndex={0}
        aria-expanded={expanded}
        aria-label={`Tool call trace. ${expanded ? "Click to collapse" : "Click to expand"}.`}
        className="flex items-center justify-between px-3 py-2 cursor-pointer hover:bg-gray-800/50 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/70 focus-visible:ring-offset-1 focus-visible:ring-offset-gray-950"
        onClick={() => setExpanded(!expanded)}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            setExpanded(!expanded);
          }
        }}
      >
        <div className="flex items-center gap-2">
          <span className="text-xs font-medium text-gray-300">Tool Call Trace</span>
          <span className="text-xs text-gray-500 font-mono">
            {traceData.length} event{traceData.length !== 1 ? "s" : ""}
          </span>
          {filteredCount > 0 && (
            <span className="text-xs text-gray-500 italic">
              ({filteredCount} hidden)
            </span>
          )}
        </div>
        <svg
          className={`w-3.5 h-3.5 text-gray-500 transition-transform ${expanded ? "rotate-180" : ""}`}
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          aria-hidden="true"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </div>

      {expanded && (
        <div className="border-t border-gray-700 px-3 py-2 space-y-2">
          {/* Live activity during proposal stage */}
          {isProposalStage && activeTraces.length > 0 && (
            <div className="space-y-1">
              {activeTraces.map((trace, i) => (
                <div key={`active-${i}`} className="flex items-center gap-2 text-xs">
                  <div className={`w-2 h-2 rounded-full animate-pulse ${agentDotColors[trace.agentId]}`} />
                  <span className="text-gray-300">
                    {agentDisplayNames[trace.agentId]} is reading{" "}
                    {trace.filesRead.length > 0
                      ? trace.filesRead[trace.filesRead.length - 1].split("/").pop()
                      : "files"}
                    ...
                  </span>
                  <span className="text-xs text-gray-500 font-mono ml-auto">
                    {trace.toolCallCount} calls
                  </span>
                </div>
              ))}
            </div>
          )}

          {/* Summary table for completed traces */}
          {completedTraces.length > 0 && (
            <table className="w-full text-xs">
              <thead>
                <tr className="text-gray-500">
                  <th className="text-left py-1 font-medium">Agent</th>
                  <th className="text-left py-1 font-medium">Files Read</th>
                  <th className="text-right py-1 font-medium">Calls</th>
                  <th className="text-right py-1 font-medium">Cap</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-700/50">
                {completedTraces.map((trace, i) => (
                  <tr key={`completed-${i}`}>
                    <td className="py-1.5">
                      <div className="flex items-center gap-1.5">
                        <div className={`w-2 h-2 rounded-full ${agentDotColors[trace.agentId]}`} />
                        <span className="text-gray-300">
                          {agentDisplayNames[trace.agentId].split(" ").pop()}
                        </span>
                      </div>
                    </td>
                    <td className="py-1.5 text-gray-400">
                      {trace.filesRead.length > 0 ? (
                        <span title={trace.filesRead.join(", ")}>
                          {trace.filesRead.length} file{trace.filesRead.length !== 1 ? "s" : ""}
                        </span>
                      ) : (
                        <span className="text-gray-600">-</span>
                      )}
                    </td>
                    <td className="py-1.5 text-right text-gray-400 font-mono">
                      {trace.toolCallCount}
                    </td>
                    <td className="py-1.5 text-right">
                      {trace.capHit ? (
                        <span className="text-amber-400">hit</span>
                      ) : (
                        <span className="text-gray-600">-</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}

          {/* Filtered events indicator */}
          {filteredCount > 0 && (
            <p className="text-xs text-gray-500 italic pt-1">
              {filteredCount} event{filteredCount !== 1 ? "s" : ""} hidden (not repo-grounded)
            </p>
          )}
        </div>
      )}
    </div>
  );
}
