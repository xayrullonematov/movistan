"use client";

import { use, useState } from "react";
import useSWR from "swr";

const fetcher = (url: string) => fetch(url).then((r) => r.json());

const statusBadge = (status: string) => {
  const colors: Record<string, string> = {
    accepted: "bg-green-600 text-green-100",
    rejected: "bg-red-600 text-red-100",
    draft: "bg-gray-600 text-gray-100",
  };
  return (
    <span className={`px-2 py-0.5 rounded text-xs font-medium ${colors[status] || colors.draft}`}>
      {status}
    </span>
  );
};

export default function ResultsPage({ params }: { params: Promise<{ sessionId: string }> }) {
  const { sessionId } = use(params);
  const { data, error, isLoading } = useSWR(`/api/sessions/${sessionId}/results`, fetcher);

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <span className="text-gray-400">Loading results...</span>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <p className="text-red-400 mb-2">Failed to load results</p>
          <p className="text-gray-500 text-sm">{error?.message || "Results not found"}</p>
        </div>
      </div>
    );
  }

  const { session, consensus, artifacts, summary } = data;

  return (
    <div className="min-h-screen bg-gray-950 text-gray-100 p-8">
      {/* Header */}
      <div className="flex items-start justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold">{session.problemDescription.slice(0, 100)}</h1>
          <div className="flex gap-4 mt-2 text-sm text-gray-400">
            <span>Rounds: {summary.roundCount}</span>
            <span>Artifacts: {summary.artifactCount} ({summary.acceptedCount} accepted)</span>
            <span>Tokens: {session.totalTokens?.toLocaleString() ?? "—"}</span>
            <span>Cost: ${session.estimatedCostUsd?.toFixed(4) ?? "—"}</span>
          </div>
        </div>
        <DownloadButton sessionId={sessionId} />
      </div>

      {/* Consensus confidence */}
      {consensus?.overallConfidence != null && (
        <div className="mb-6 text-sm text-gray-400">
          Consensus confidence: <span className="text-white font-medium">{Math.round(consensus.overallConfidence * 100)}%</span>
        </div>
      )}

      {/* Artifacts grouped by type */}
      {Object.entries(artifacts as Record<string, Array<{ id: string; title: string; status: string; content: string }>>)
        .filter(([, items]) => items.length > 0)
        .map(([type, items]) => (
          <section key={type} className="mb-8">
            <h2 className="text-lg font-semibold capitalize mb-3">{type}</h2>
            <div className="space-y-3">
              {items.map((artifact) => (
                <div key={artifact.id} className="bg-gray-900 border border-gray-800 rounded-lg p-4">
                  <div className="flex items-center gap-2 mb-2">
                    <span className="font-medium">{artifact.title}</span>
                    {statusBadge(artifact.status)}
                  </div>
                  <p className="text-sm text-gray-300 whitespace-pre-wrap">{artifact.content}</p>
                </div>
              ))}
            </div>
          </section>
        )
      )}
    </div>
  );
}

function DownloadButton({ sessionId }: { sessionId: string }) {
  const [state, setState] = useState<"idle" | "loading" | "done">("idle");

  const handleDownload = async () => {
    setState("loading");
    try {
      const res = await fetch(`/api/sessions/${sessionId}/results/markdown`);
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = res.headers.get("content-disposition")?.match(/filename="(.+)"/)?.[1] || "results.md";
      a.click();
      URL.revokeObjectURL(url);
      setState("done");
      setTimeout(() => setState("idle"), 2000);
    } catch {
      setState("idle");
    }
  };

  return (
    <button
      onClick={handleDownload}
      disabled={state === "loading"}
      className="px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 rounded text-sm font-medium"
    >
      {state === "loading" ? "Downloading..." : state === "done" ? "✓ Downloaded" : "Download Markdown"}
    </button>
  );
}
