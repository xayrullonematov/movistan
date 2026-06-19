"use client";

import type { PersistedEvent } from "@/types/domain";

interface TimelineEventProps {
  event: PersistedEvent;
}

const AGENT_NAMES: Record<string, string> = {
  "senior-engineer": "Senior Eng",
  "security-engineer": "Security Eng",
  "performance-engineer": "Perf Eng",
  "product-engineer": "Product Eng",
};

export default function TimelineEvent({ event }: TimelineEventProps) {
  const typeColors: Record<string, string> = {
    proposal: "border-blue-600 bg-blue-900/20",
    critique: "border-orange-600 bg-orange-900/20",
    revision: "border-purple-600 bg-purple-900/20",
    "consensus-update": "border-green-600 bg-green-900/20",
    "user-intervention": "border-yellow-600 bg-yellow-900/20",
    "artifact-created": "border-teal-600 bg-teal-900/20",
    "artifact-updated": "border-teal-600 bg-teal-900/20",
    "round-started": "border-gray-600 bg-gray-800/20",
    "round-completed": "border-gray-600 bg-gray-800/20",
  };

  const badgeColors: Record<string, string> = {
    proposal: "bg-blue-900/50 text-blue-400",
    critique: "bg-orange-900/50 text-orange-400",
    revision: "bg-purple-900/50 text-purple-400",
    "consensus-update": "bg-green-900/50 text-green-400",
    "user-intervention": "bg-yellow-900/50 text-yellow-400",
  };

  // Parse content summary
  let summary = "";
  try {
    const content = JSON.parse(event.content);
    summary = content.summary || content.text || event.type;
  } catch {
    summary = event.content.slice(0, 100);
  }

  const colorClass = typeColors[event.type] || "border-gray-700 bg-gray-900/20";
  const badgeClass = badgeColors[event.type] || "bg-gray-800 text-gray-400";

  return (
    <div className={`border-l-2 pl-2 py-1 ${colorClass} rounded-r`}>
      <div className="flex items-center gap-1.5">
        <span className={`px-1 py-0.5 text-xs rounded ${badgeClass}`}>
          {event.type.replace("-", " ")}
        </span>
        {event.agentId && (
          <span className="text-xs text-gray-500">{AGENT_NAMES[event.agentId] || event.agentId}</span>
        )}
      </div>
      <p className="text-xs text-gray-300 mt-0.5 line-clamp-2">{summary.slice(0, 100)}</p>
      <p className="text-xs text-gray-600 mt-0.5">
        {new Date(event.timestamp).toLocaleTimeString()}
      </p>
    </div>
  );
}
