"use client";

import { useState } from "react";
import type { ArtifactState, ArtifactVersion } from "@/types/domain";
import MarkdownRenderer from "@/components/ui/MarkdownRenderer";

interface ArtifactDetailProps {
  artifact: ArtifactState;
  sessionId: string;
  onClose: () => void;
  onStatusChange?: () => void;
}

export default function ArtifactDetail({ artifact, sessionId, onClose, onStatusChange }: ArtifactDetailProps) {
  const [versions, setVersions] = useState<ArtifactVersion[] | null>(null);
  const [isUpdating, setIsUpdating] = useState(false);
  const [showVersions, setShowVersions] = useState(false);

  const loadVersions = async () => {
    if (versions) {
      setShowVersions(!showVersions);
      return;
    }
    try {
      const res = await fetch(`/api/sessions/${sessionId}/artifacts/${artifact.id}/versions`);
      if (res.ok) {
        const data = await res.json();
        setVersions(data.versions);
        setShowVersions(true);
      }
    } catch {
      // silently fail
    }
  };

  const handleStatusChange = async (status: "accepted" | "rejected") => {
    setIsUpdating(true);
    try {
      await fetch(`/api/sessions/${sessionId}/artifacts/${artifact.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      onStatusChange?.();
    } finally {
      setIsUpdating(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="w-full max-w-2xl max-h-[80vh] bg-gray-900 border border-gray-700 rounded-xl overflow-hidden flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3 border-b border-gray-700">
          <div className="flex items-center gap-2">
            <span className="text-xs px-2 py-0.5 bg-gray-800 border border-gray-700 rounded text-gray-400">
              {artifact.type}
            </span>
            <h3 className="text-base font-semibold text-gray-100">{artifact.title}</h3>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-200 text-lg">
            ✕
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          <MarkdownRenderer content={artifact.content} />

          {/* Contributors */}
          {artifact.contributors.length > 0 && (
            <div className="pt-3 border-t border-gray-700">
              <p className="text-xs text-gray-500 mb-1">Contributors</p>
              <div className="flex flex-wrap gap-1">
                {artifact.contributors.map((c) => (
                  <span key={c} className="text-xs px-2 py-0.5 bg-gray-800 border border-gray-700 rounded text-gray-300">
                    {c}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Version History */}
          <div className="pt-3 border-t border-gray-700">
            <button
              onClick={loadVersions}
              className="text-xs text-blue-400 hover:text-blue-300"
            >
              {showVersions ? "Hide" : "Show"} version history (v{artifact.version})
            </button>
            {showVersions && versions && (
              <div className="mt-2 space-y-2">
                {versions.map((v) => (
                  <div key={v.id} className="p-2 bg-gray-800/50 border border-gray-700 rounded text-xs">
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-gray-300 font-medium">
                        v{v.version} by {v.agentId || "system"}
                      </span>
                      <span className="text-gray-500">
                        {new Date(v.timestamp).toLocaleString()}
                      </span>
                    </div>
                    {v.reasoning && (
                      <p className="text-gray-400 italic">{v.reasoning}</p>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Footer with Actions */}
        <div className="px-5 py-3 border-t border-gray-700 flex items-center gap-3">
          <button
            onClick={() => handleStatusChange("accepted")}
            disabled={isUpdating || artifact.status === "accepted"}
            className="px-3 py-1.5 bg-green-700 hover:bg-green-600 disabled:opacity-50 text-white text-xs rounded-lg transition-colors"
          >
            Accept
          </button>
          <button
            onClick={() => handleStatusChange("rejected")}
            disabled={isUpdating || artifact.status === "rejected"}
            className="px-3 py-1.5 bg-red-700 hover:bg-red-600 disabled:opacity-50 text-white text-xs rounded-lg transition-colors"
          >
            Reject
          </button>
          <span className="ml-auto text-xs text-gray-500">
            Status: {artifact.status}
          </span>
        </div>
      </div>
    </div>
  );
}
