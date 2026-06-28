"use client";

import Link from "next/link";
import useSWR from "swr";
import { Plus } from "lucide-react";
import SessionsTable from "@/components/session/SessionsTable";
import PageHeader from "@/components/ui/PageHeader";

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
  const { data, isLoading, error } = useSWR<{ sessions: ApiSession[] }>("/api/sessions", fetcher, {
    revalidateOnFocus: false,
  });

  const sessions = data?.sessions ?? [];

  return (
    <main className="mx-auto max-w-5xl px-4 py-10 sm:px-6">
      <PageHeader
        title="Review history"
        description="Your repo review reports. Click one to see the full report."
        action={
          <Link
            href="/"
            className="inline-flex items-center gap-1.5 rounded-lg bg-[var(--brand-violet)] px-3.5 py-2 text-sm font-medium text-white transition-colors hover:bg-[var(--violet-hover)] focus:outline-none focus:ring-2 focus:ring-[var(--violet-glow)]"
          >
            <Plus size={14} />
            New review
          </Link>
        }
      />

      {error ? (
        <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-300">
          <p className="font-medium">Couldn&apos;t load reviews</p>
          <p className="mt-1 text-xs text-red-400/80">Check your connection and reload the page.</p>
        </div>
      ) : (
        <SessionsTable sessions={sessions} loading={isLoading} />
      )}
    </main>
  );
}
