"use client";

import Link from "next/link";
import useSWR from "swr";
import { Plus } from "lucide-react";
import SessionsTable from "@/components/session/SessionsTable";

const fetcher = (url: string) => fetch(url).then((r) => r.json());

interface ApiSession {
  id: string;
  title: string | null;
  problemDescription?: string;
  status: "active" | "paused" | "completed";
  currentRound: number;
  createdAt: string;
}

export default function MySessionsPage() {
  // No real auth yet — the listing endpoint already returns the local user's
  // sessions implicitly (single-user mock). When auth lands this swaps to a
  // server-filtered route without changing this component.
  const { data, isLoading, error } = useSWR<{ sessions: ApiSession[] }>("/api/sessions", fetcher, {
    revalidateOnFocus: false,
  });

  const sessions = data?.sessions ?? [];

  return (
    <main className="mx-auto max-w-5xl px-4 py-10 sm:px-6">
      <div className="mb-6 flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-gray-50">My sessions</h1>
          <p className="mt-1 text-sm text-gray-400">
            Every debate you&apos;ve started. Click one to jump back in.
          </p>
        </div>
        <Link
          href="/#form"
          className="inline-flex items-center gap-1.5 rounded-lg bg-[var(--brand-violet)] px-3.5 py-2 text-sm font-medium text-white transition-colors hover:bg-[var(--violet-hover)]"
        >
          <Plus size={14} />
          New session
        </Link>
      </div>

      {error ? (
        <div className="rounded-lg border border-red-500/40 bg-red-500/10 px-4 py-3 text-sm text-red-200">
          Couldn&apos;t load sessions. Please reload.
        </div>
      ) : (
        <SessionsTable sessions={sessions} loading={isLoading} />
      )}
    </main>
  );
}
