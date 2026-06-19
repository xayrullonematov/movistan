"use client";

import type { ArtifactState } from "@/types/domain";
import ArtifactCard from "./ArtifactCard";

interface ArtifactsPanelProps {
  artifacts: ArtifactState[];
  sessionId: string;
  onStatusChange?: () => void;
}

export default function ArtifactsPanel({ artifacts, sessionId, onStatusChange }: ArtifactsPanelProps) {
  return (
    <div>
      <h2 className="text-sm font-semibold text-gray-300 uppercase tracking-wide mb-3">
        Artifacts ({artifacts.length})
      </h2>
      {artifacts.length === 0 ? (
        <div className="p-6 border border-gray-700 rounded-lg bg-gray-900/30 text-center">
          <p className="text-gray-500 text-sm">
            No artifacts yet. Agents will create them during the debate.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {artifacts.map((artifact) => (
            <ArtifactCard key={artifact.id} artifact={artifact} sessionId={sessionId} onStatusChange={onStatusChange} />
          ))}
        </div>
      )}
    </div>
  );
}
