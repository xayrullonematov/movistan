"use client";

import { useMemo, useState } from "react";
import { GitBranch, FileCode2 } from "lucide-react";
import Sheet from "@/components/ui/Sheet";
import type { PersistedEvent } from "@/types/domain";

interface GitHubGroundingIndicatorProps {
  repo: { owner: string; repo: string; branch: string; rawUrl: string };
  events: PersistedEvent[];
}

function deriveFilesRead(events: PersistedEvent[]): { file: string; agentId: string | null }[] {
  const seen = new Map<string, { file: string; agentId: string | null }>();
  for (const e of events) {
    if (e.type !== "stage-progress") continue;
    try {
      const data = JSON.parse(e.content) as { filesRead?: string[] };
      if (!data.filesRead) continue;
      for (const file of data.filesRead) {
        if (!seen.has(file)) seen.set(file, { file, agentId: e.agentId });
      }
    } catch {
      // skip
    }
  }
  return Array.from(seen.values());
}

const agentLabel: Record<string, string> = {
  "senior-engineer": "Senior",
  "security-engineer": "Security",
  "performance-engineer": "Performance",
  "product-engineer": "Product",
};

export default function GitHubGroundingIndicator({ repo, events }: GitHubGroundingIndicatorProps) {
  const [open, setOpen] = useState(false);
  const files = useMemo(() => deriveFilesRead(events), [events]);

  const label = `${repo.owner}/${repo.repo}${repo.branch ? `@${repo.branch}` : ""}`;

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-1.5 rounded-md border border-gray-700 bg-gray-900/60 px-2.5 py-1 text-xs text-gray-200 transition-colors hover:bg-gray-800"
        title={`Grounded in ${label}`}
      >
        <GitBranch size={12} className="text-gray-400" />
        <span className="hidden truncate sm:inline max-w-[180px]">{label}</span>
        <span className="inline rounded bg-gray-800 px-1 py-0 text-xs text-gray-400 sm:ml-1">
          {files.length} {files.length === 1 ? "file" : "files"}
        </span>
      </button>

      <Sheet open={open} onOpenChange={setOpen} title={`Grounded in ${label}`} side="right">
        <div className="px-4 py-4 space-y-4">
          <div>
            <p className="text-xs text-gray-400">Source</p>
            <a
              href={repo.rawUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="text-sm text-blue-400 transition-colors hover:text-blue-300"
            >
              {repo.rawUrl}
            </a>
          </div>

          <div>
            <p className="mb-2 text-xs uppercase tracking-wider text-gray-500">
              Files agents have read ({files.length})
            </p>
            {files.length === 0 ? (
              <p className="text-xs text-gray-500">
                Agents haven&apos;t read any files yet. They&apos;ll be listed here as the Proposal stage runs.
              </p>
            ) : (
              <ul className="space-y-1">
                {files.map((entry) => (
                  <li
                    key={entry.file}
                    className="flex items-center justify-between gap-2 rounded-md border border-gray-800 bg-gray-950/40 px-2.5 py-1.5"
                  >
                    <div className="flex min-w-0 items-center gap-2">
                      <FileCode2 size={12} className="shrink-0 text-gray-500" />
                      <code className="truncate text-[12px] text-gray-200">{entry.file}</code>
                    </div>
                    {entry.agentId && (
                      <span className="shrink-0 text-xs text-gray-500">
                        {agentLabel[entry.agentId] ?? entry.agentId}
                      </span>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </Sheet>
    </>
  );
}
