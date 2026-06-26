"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { Search, ArrowUpDown, ArrowDown, ArrowUp } from "lucide-react";
import Skeleton from "@/components/ui/Skeleton";
import EmptyState from "@/components/ui/EmptyState";
import { FileText } from "lucide-react";

interface SessionSummary {
  id: string;
  title: string | null;
  problemDescription?: string;
  status: "active" | "paused" | "completed";
  currentRound: number;
  createdAt: string;
}

interface SessionsTableProps {
  sessions: SessionSummary[];
  loading?: boolean;
}

type SortKey = "createdAt" | "round" | "status" | "title";
type SortDir = "asc" | "desc";
type StatusFilter = "all" | "active" | "paused" | "completed";

function timeAgo(dateStr: string): string {
  const seconds = Math.floor((Date.now() - new Date(dateStr).getTime()) / 1000);
  if (seconds < 60) return "just now";
  const m = Math.floor(seconds / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

const statusOrder: Record<SessionSummary["status"], number> = {
  active: 0,
  paused: 1,
  completed: 2,
};

export default function SessionsTable({ sessions, loading = false }: SessionsTableProps) {
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [sortKey, setSortKey] = useState<SortKey>("createdAt");
  const [sortDir, setSortDir] = useState<SortDir>("desc");

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = sessions.filter((s) => {
      if (statusFilter !== "all" && s.status !== statusFilter) return false;
      if (!q) return true;
      return (s.title ?? s.problemDescription ?? "").toLowerCase().includes(q);
    });
    const sorted = [...list].sort((a, b) => {
      let cmp = 0;
      if (sortKey === "createdAt") cmp = new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
      else if (sortKey === "round") cmp = a.currentRound - b.currentRound;
      else if (sortKey === "status") cmp = statusOrder[a.status] - statusOrder[b.status];
      else cmp = (a.title ?? a.problemDescription ?? "").localeCompare(b.title ?? b.problemDescription ?? "");
      return sortDir === "asc" ? cmp : -cmp;
    });
    return sorted;
  }, [sessions, query, statusFilter, sortKey, sortDir]);

  function toggleSort(key: SortKey) {
    if (sortKey === key) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else {
      setSortKey(key);
      setSortDir(key === "title" ? "asc" : "desc");
    }
  }

  const sortIconFor = (k: SortKey) => {
    if (sortKey !== k) return <ArrowUpDown size={11} className="opacity-40" />;
    return sortDir === "asc" ? <ArrowUp size={11} /> : <ArrowDown size={11} />;
  };

  if (loading) {
    return (
      <div className="space-y-3">
        <Skeleton className="h-9 w-full" />
        <div className="overflow-hidden rounded-xl border border-gray-800">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="flex items-center gap-3 border-b border-gray-800/60 px-4 py-3 last:border-b-0">
              <Skeleton className="h-4 flex-1" />
              <Skeleton className="h-4 w-20" />
              <Skeleton className="h-4 w-10" />
              <Skeleton className="h-4 w-16" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <div className="relative flex-1">
          <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" />
          <input
            type="search"
            placeholder="Search by title or problem…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="min-h-11 w-full rounded-md border border-gray-700 bg-gray-950/70 py-2 pl-9 pr-3 text-sm text-gray-100 placeholder:text-gray-400 focus:border-violet-500 focus:outline-none focus:ring-1 focus:ring-violet-500"
          />
        </div>
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value as StatusFilter)}
          className="min-h-11 w-32 shrink-0 rounded-md border border-gray-700 bg-gray-950/70 px-2 py-2 text-sm text-gray-100 focus:border-violet-500 focus:outline-none focus:ring-1 focus:ring-violet-500 sm:w-auto sm:px-3"
        >
          <option value="all">All status</option>
          <option value="active">Active</option>
          <option value="paused">Paused</option>
          <option value="completed">Completed</option>
        </select>
      </div>

      {filtered.length === 0 ? (
        <EmptyState
          icon={FileText}
          title={query || statusFilter !== "all" ? "No sessions match" : "No sessions yet"}
          description={
            query || statusFilter !== "all"
              ? "Try a different search or status filter."
              : "Start a debate from the home page to see it here."
          }
        />
      ) : (
        <>
        <div className="space-y-2 sm:hidden">
          {filtered.map((session) => (
            <SessionCard key={session.id} session={session} />
          ))}
        </div>
        <div className="hidden overflow-hidden rounded-xl border border-gray-800 sm:block">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-800 bg-gray-900/50 text-left text-xs uppercase tracking-wide text-gray-400">
                <th className="px-4 py-2.5">
                  <button
                    type="button"
                    onClick={() => toggleSort("title")}
                    className="inline-flex items-center gap-1 hover:text-gray-300"
                  >
                    Problem {sortIconFor("title")}
                  </button>
                </th>
                <th className="px-3 py-2.5 text-center">
                  <button
                    type="button"
                    onClick={() => toggleSort("status")}
                    className="inline-flex items-center gap-1 hover:text-gray-300"
                  >
                    Status {sortIconFor("status")}
                  </button>
                </th>
                <th className="px-3 py-2.5 text-center">
                  <button
                    type="button"
                    onClick={() => toggleSort("round")}
                    className="inline-flex items-center gap-1 hover:text-gray-300"
                  >
                    Round {sortIconFor("round")}
                  </button>
                </th>
                <th className="px-4 py-2.5 text-right">
                  <button
                    type="button"
                    onClick={() => toggleSort("createdAt")}
                    className="inline-flex items-center gap-1 hover:text-gray-300"
                  >
                    Created {sortIconFor("createdAt")}
                  </button>
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-800/60">
              {filtered.map((session) => (
                <tr key={session.id} className="transition-colors hover:bg-gray-800/40">
                  <td className="px-4 py-3">
                    <Link
                      href={`/sessions/${session.id}`}
                      className="block truncate text-gray-200 transition-colors hover:text-white"
                    >
                      {(session.title ?? session.problemDescription ?? "Untitled").slice(0, 100)}
                    </Link>
                  </td>
                  <td className="px-3 py-3 text-center">
                    <StatusPill status={session.status} />
                  </td>
                  <td className="px-3 py-3 text-center text-gray-400">{session.currentRound}</td>
                  <td className="px-4 py-3 text-right text-gray-500 whitespace-nowrap">
                    {timeAgo(session.createdAt)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        </>
      )}

      <p className="text-sm text-gray-400">
        Showing {filtered.length} of {sessions.length} session{sessions.length === 1 ? "" : "s"}.
      </p>
    </div>
  );
}

function SessionCard({ session }: { session: SessionSummary }) {
  const title = (session.title ?? session.problemDescription ?? "Untitled").slice(0, 120);
  return (
    <Link
      href={`/sessions/${session.id}`}
      className="block rounded-lg border border-gray-800 bg-gray-900/50 p-3 transition-colors hover:border-gray-700 hover:bg-gray-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500/70"
    >
      <div className="flex items-start justify-between gap-3">
        <h2 className="line-clamp-2 text-sm font-medium leading-snug text-gray-100">{title}</h2>
        <StatusPill status={session.status} />
      </div>
      <div className="mt-2 flex items-center gap-3 text-xs text-gray-400">
        <span>Round {session.currentRound}</span>
        <span className="h-1 w-1 rounded-full bg-gray-600" />
        <span>{timeAgo(session.createdAt)}</span>
      </div>
    </Link>
  );
}

function StatusPill({ status }: { status: SessionSummary["status"] }) {
  const tone = {
    active:    { bg: "bg-green-900/50",  text: "text-green-400",  border: "border-green-700",  dot: "bg-green-400" },
    paused:    { bg: "bg-yellow-900/50", text: "text-yellow-400", border: "border-yellow-700", dot: "bg-yellow-400" },
    completed: { bg: "bg-blue-900/50",   text: "text-blue-400",   border: "border-blue-700",   dot: "bg-blue-400" },
  }[status];
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-md border px-2 py-0.5 text-xs ${tone.bg} ${tone.text} ${tone.border}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${tone.dot}`} />
      {status}
    </span>
  );
}
