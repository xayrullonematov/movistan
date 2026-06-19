"use client";

import { useRouter } from "next/navigation";

interface SessionSummary {
  id: string;
  title: string;
  problemDescription?: string;
  status: "active" | "paused" | "completed";
  currentRound: number;
  createdAt: string;
}

interface SessionListProps {
  sessions: SessionSummary[];
}

function timeAgo(dateStr: string): string {
  const now = new Date();
  const date = new Date(dateStr);
  const seconds = Math.floor((now.getTime() - date.getTime()) / 1000);

  if (seconds < 60) return "just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

export default function SessionList({ sessions }: SessionListProps) {
  const router = useRouter();

  if (sessions.length === 0) {
    return null;
  }

  const displaySessions = sessions.slice(0, 5);
  const hasMore = sessions.length > 5;

  return (
    <div className="space-y-3">
      <h3 className="text-sm font-medium text-gray-400 uppercase tracking-wider">
        Recent Sessions
      </h3>

      <div className="border border-gray-700 rounded-xl overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-700 bg-gray-800/50">
              <th className="text-left px-4 py-2.5 text-xs font-medium text-gray-500 uppercase tracking-wider">
                Problem
              </th>
              <th className="text-center px-3 py-2.5 text-xs font-medium text-gray-500 uppercase tracking-wider">
                Status
              </th>
              <th className="text-center px-3 py-2.5 text-xs font-medium text-gray-500 uppercase tracking-wider">
                Rounds
              </th>
              <th className="text-right px-4 py-2.5 text-xs font-medium text-gray-500 uppercase tracking-wider">
                Time
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-800">
            {displaySessions.map((session) => (
              <tr
                key={session.id}
                onClick={() => router.push(`/sessions/${session.id}`)}
                className="hover:bg-gray-800/70 cursor-pointer transition-colors"
              >
                <td className="px-4 py-3">
                  <span className="text-gray-200 line-clamp-1">
                    {(session.title || session.problemDescription || "Untitled").slice(0, 80)}
                  </span>
                </td>
                <td className="px-3 py-3 text-center">
                  <StatusBadge status={session.status} />
                </td>
                <td className="px-3 py-3 text-center text-gray-400">
                  {session.currentRound}
                </td>
                <td className="px-4 py-3 text-right text-gray-500 whitespace-nowrap">
                  {timeAgo(session.createdAt)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {hasMore && (
        <div className="text-center">
          <button
            onClick={() => router.push("/sessions")}
            className="text-sm text-blue-400 hover:text-blue-300 transition-colors"
          >
            View all sessions ({sessions.length})
          </button>
        </div>
      )}
    </div>
  );
}

function StatusBadge({ status }: { status: "active" | "paused" | "completed" }) {
  const config = {
    active: {
      bg: "bg-green-900/50",
      text: "text-green-400",
      border: "border-green-700",
      dot: "bg-green-400",
    },
    paused: {
      bg: "bg-yellow-900/50",
      text: "text-yellow-400",
      border: "border-yellow-700",
      dot: "bg-yellow-400",
    },
    completed: {
      bg: "bg-blue-900/50",
      text: "text-blue-400",
      border: "border-blue-700",
      dot: "bg-blue-400",
    },
  };

  const c = config[status];

  return (
    <span
      className={`inline-flex items-center gap-1.5 px-2 py-0.5 text-xs rounded-md border ${c.bg} ${c.text} ${c.border}`}
    >
      <span className={`w-1.5 h-1.5 rounded-full ${c.dot}`} />
      {status}
    </span>
  );
}
