"use client";

import { useState } from "react";
import type { ArtifactState } from "@/types/domain";
import ArtifactDetail from "./ArtifactDetail";

interface ArtifactCardProps {
  artifact: ArtifactState;
  sessionId: string;
  onStatusChange?: () => void;
}

export default function ArtifactCard({ artifact, sessionId, onStatusChange }: ArtifactCardProps) {
  const [expanded, setExpanded] = useState(false);

  const statusColors = {
    draft: "bg-yellow-900/50 text-yellow-400 border-yellow-700",
    accepted: "bg-green-900/50 text-green-400 border-green-700",
    rejected: "bg-red-900/50 text-red-400 border-red-700",
  };

  const typeIcons: Record<string, string> = {
    decision: "📋",
    risk: "⚠️",
    assumption: "💡",
    tradeoff: "⚖️",
    "open-question": "❓",
    recommendation: "✅",
  };

  return (
    <>
      <button
        onClick={() => setExpanded(true)}
        className="w-full text-left p-3 border border-gray-700 rounded-lg bg-gray-900/50 hover:bg-gray-800/70 transition-colors"
      >
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-center gap-2">
            <span className="text-base">{typeIcons[artifact.type] || "📄"}</span>
            <span className="text-xs px-1.5 py-0.5 bg-gray-800 border border-gray-700 rounded text-gray-400">
              {artifact.type}
            </span>
          </div>
          <span className={`px-1.5 py-0.5 text-xs rounded border ${statusColors[artifact.status]}`}>
            {artifact.status}
          </span>
        </div>
        <h3 className="text-sm font-medium text-gray-200 mt-2 line-clamp-2">{artifact.title}</h3>
        <div className="flex items-center gap-2 mt-2 text-xs text-gray-500">
          {artifact.contributors.length > 0 && (
            <span>{artifact.contributors.join(", ")}</span>
          )}
          {artifact.version > 1 && (
            <span>v{artifact.version}</span>
          )}
        </div>
      </button>

      {expanded && (
        <ArtifactDetail
          artifact={artifact}
          sessionId={sessionId}
          onClose={() => setExpanded(false)}
          onStatusChange={onStatusChange}
        />
      )}
    </>
  );
}
