"use client";

import { useRouter } from "next/navigation";

interface SessionSummary {
  id: string;
  problemDescription: string;
  status: "active" | "paused" | "completed";
  currentRound: number;
  createdAt: string;
}

interface SessionListProps {
  sessions: SessionSummary[];
}

export default function SessionList({ sessions }: SessionListProps) {
  const router = useRouter();

  if (sessions.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center p-8 border border-gray-700 rounded-lg bg-gray-900/50">
        <p className="text-gray-400 text-sm">No sessions yet. Create one to get started.</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {sessions.map((session) => (
        <button
          key={session.id}
          onClick={() => router.push(`/sessions/${session.id}`)}
          className="w-full text-left p-4 border border-gray-700 rounded-lg bg-gray-900/50 hover:bg-gray-800/70 transition-colors cursor-pointer"
        >
          <div className="flex items-start justify-between gap-2">
            <h3 className="text-sm font-medium text-gray-100 line-clamp-2">
              {session.problemDescription.slice(0, 100)}
              {session.problemDescription.length > 100 ? "..." : ""}
            </h3>
            <StatusBadge status={session.status} />
          </div>
          <div className="flex items-center gap-3 mt-2 text-xs text-gray-400">
            <span>Round {session.currentRound}</span>
            <span>•</span>
            <span>{new Date(session.createdAt).toLocaleDateString()}</span>
            {session.status === "completed" && (
              <>
                <span>•</span>
                <span
                  onClick={(e) => { e.stopPropagation(); router.push(`/sessions/${session.id}/results`); }}
                  className="text-blue-400 hover:text-blue-300 cursor-pointer"
                >
                  View Results
                </span>
              </>
            )}
          </div>
        </button>
      ))}
    </div>
  );
}

function StatusBadge({ status }: { status: "active" | "paused" | "completed" }) {
  const colors = {
    active: "bg-green-900/50 text-green-400 border-green-700",
    paused: "bg-yellow-900/50 text-yellow-400 border-yellow-700",
    completed: "bg-blue-900/50 text-blue-400 border-blue-700",
  };

  return (
    <span className={`px-2 py-0.5 text-xs rounded-full border ${colors[status]}`}>
      {status}
    </span>
  );
}
