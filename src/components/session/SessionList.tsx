"use client";

import { useRouter } from "next/navigation";
import Skeleton from "@/components/ui/Skeleton";

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
  loading?: boolean;
}

export function SessionListSkeleton({ rows = 3 }: { rows?: number }) {
  return (
    <div className="space-y-3">
      <Skeleton className="h-4 w-40" />
      <div className="overflow-hidden rounded-xl border border-gray-700">
        <div className="divide-y divide-gray-800">
          {Array.from({ length: rows }).map((_, i) => (
            <div key={i} className="flex items-center gap-3 px-4 py-3">
              <Skeleton className="h-4 flex-1" />
              <Skeleton className="h-4 w-16" />
              <Skeleton className="h-4 w-10" />
              <Skeleton className="h-4 w-12" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
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

export default function SessionList({ sessions, loading = false }: SessionListProps) {
  const router = useRouter();

  if (loading) {
    return <SessionListSkeleton />;
  }

  if (sessions.length === 0) {
    return null;
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-medium text-gray-400">
          Continue a session
        </h3>
        <button
          onClick={() => router.push("/sessions")}
          className="text-xs text-violet-400 hover:text-violet-300 transition-colors"
        >
          View all &rarr;
        </button>
      </div>

      <div className="grid gap-2">
        {sessions.slice(0, 3).map((session) => (
          <button
            key={session.id}
            onClick={() => router.push(`/sessions/${session.id}`)}
            className="flex items-center gap-3 rounded-lg border border-[#2f312b] bg-[#151712] px-4 py-3 text-left transition-all hover:border-violet-500/30 hover:bg-[#1a1c17]"
          >
            <StatusDot status={session.status} />
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium text-gray-200">
                {(session.title || session.problemDescription || "Untitled").slice(0, 60)}
              </p>
              <p className="mt-0.5 text-xs text-gray-500">
                Round {session.currentRound} · {timeAgo(session.createdAt)}
              </p>
            </div>
            <StatusBadge status={session.status} />
          </button>
        ))}
      </div>
    </div>
  );
}

function StatusDot({ status }: { status: "active" | "paused" | "completed" }) {
  const colors = {
    active: "bg-green-400",
    paused: "bg-yellow-400",
    completed: "bg-blue-400",
  };
  return <span className={`h-2 w-2 shrink-0 rounded-full ${colors[status]}`} />;
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
