"use client";

import { useMemo, useState } from "react";
import useSWR from "swr";
import { X, Search, FileText, Loader2 } from "lucide-react";

interface SessionSummary {
  id: string;
  title: string | null;
  status: "active" | "paused" | "completed";
  currentRound: number;
  createdAt: string;
}

interface PriorSessionPickerProps {
  onClose: () => void;
  onPick: (summary: string, source: SessionSummary) => void;
}

const fetcher = (url: string) => fetch(url).then((r) => r.json());

const exportFetcher = async (url: string): Promise<string> => {
  const res = await fetch(url);
  if (!res.ok) throw new Error("Couldn't load session summary");
  return res.text();
};

function timeAgo(dateStr: string): string {
  const seconds = Math.floor((Date.now() - new Date(dateStr).getTime()) / 1000);
  if (seconds < 60) return "just now";
  const m = Math.floor(seconds / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

export default function PriorSessionPicker({ onClose, onPick }: PriorSessionPickerProps) {
  const { data, isLoading } = useSWR<{ sessions: SessionSummary[] }>(
    "/api/sessions",
    fetcher,
    { revalidateOnFocus: false },
  );
  const [query, setQuery] = useState("");
  const [pickingId, setPickingId] = useState<string | null>(null);

  const filtered = useMemo(() => {
    if (!data) return [];
    const q = query.trim().toLowerCase();
    if (!q) return data.sessions;
    return data.sessions.filter((s) =>
      (s.title ?? "").toLowerCase().includes(q),
    );
  }, [data, query]);

  async function handlePick(session: SessionSummary) {
    setPickingId(session.id);
    try {
      const markdown = await exportFetcher(`/api/sessions/${session.id}/export`);
      // Trim very long exports to a manageable prefix — the orchestrator will
      // re-summarise it server-side, but smaller payloads keep the form snappy.
      const trimmed = markdown.length > 12_000 ? markdown.slice(0, 12_000) + "\n\n…(truncated)" : markdown;
      onPick(trimmed, session);
    } catch (err) {
      console.error(err);
    } finally {
      setPickingId(null);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" role="dialog" aria-modal="true">
      <div className="w-full max-w-2xl overflow-hidden rounded-xl border border-gray-700 bg-gray-900 shadow-2xl">
        <header className="flex items-center justify-between border-b border-gray-800 px-5 py-3">
          <div className="flex items-center gap-2">
            <FileText size={16} className="text-violet-400" />
            <h2 className="text-sm font-semibold text-gray-100">Import a prior session</h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="rounded-md p-1 text-gray-400 transition-colors hover:bg-gray-800 hover:text-gray-100"
          >
            <X size={16} />
          </button>
        </header>

        <div className="border-b border-gray-800 px-5 py-3">
          <div className="relative">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" />
            <input
              type="search"
              placeholder="Search by title…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="w-full rounded-md border border-gray-700 bg-gray-950/70 py-2 pl-9 pr-3 text-sm text-gray-100 placeholder:text-gray-500 focus:border-violet-500 focus:outline-none focus:ring-1 focus:ring-violet-500"
            />
          </div>
        </div>

        <div className="max-h-[50vh] overflow-y-auto">
          {isLoading ? (
            <div className="flex items-center justify-center px-5 py-8 text-sm text-gray-500">
              <Loader2 size={14} className="mr-2 animate-spin" />
              Loading sessions…
            </div>
          ) : filtered.length === 0 ? (
            <p className="px-5 py-8 text-center text-sm text-gray-500">
              {query ? "No sessions match that search." : "No prior sessions yet."}
            </p>
          ) : (
            <ul className="divide-y divide-gray-800">
              {filtered.map((session) => (
                <li key={session.id}>
                  <button
                    type="button"
                    disabled={pickingId !== null}
                    onClick={() => handlePick(session)}
                    className="flex w-full items-center gap-3 px-5 py-3 text-left transition-colors hover:bg-gray-800/60 disabled:opacity-60"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm text-gray-100">
                        {session.title || "Untitled session"}
                      </p>
                      <p className="mt-0.5 text-xs text-gray-500">
                        Round {session.currentRound} · {session.status} · {timeAgo(session.createdAt)}
                      </p>
                    </div>
                    {pickingId === session.id && <Loader2 size={14} className="animate-spin text-violet-400" />}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
