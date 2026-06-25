"use client";

import { useConfig } from "@/hooks/useConfig";
import SettingsLoadingState from "./LoadingState";

export default function AdvancedTab() {
  const { config, isLoading, error, mutate } = useConfig();

  if (isLoading || !config) return <SettingsLoadingState />;

  if (error) {
    return (
      <div className="rounded-md border border-red-500/30 bg-red-500/10 p-3 text-xs text-red-200">
        Failed to load configuration: {error.message}
      </div>
    );
  }

  return (
    <div className="space-y-4 text-sm text-gray-300">
      <p className="text-sm text-gray-400">
        Live snapshot of the in-memory configuration as the server sees it. Useful when an env var
        change doesn&apos;t look like it took effect.
      </p>

      <details className="group rounded-lg border border-gray-800 bg-gray-950/40">
        <summary className="flex cursor-pointer items-center justify-between gap-3 rounded-lg px-3 py-2 text-sm text-gray-200 transition-colors hover:bg-gray-900/60">
          <span className="font-medium">Developer details</span>
          <span className="text-xs text-gray-500 group-open:hidden">Show JSON</span>
          <span className="hidden text-xs text-gray-500 group-open:inline">Hide JSON</span>
        </summary>
        <pre className="overflow-auto border-t border-gray-800 bg-gray-950/70 p-3 text-xs leading-relaxed text-gray-300">
{JSON.stringify(config, null, 2)}
        </pre>
      </details>

      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => mutate()}
          className="rounded-md border border-gray-700 px-3 py-1.5 text-sm text-gray-200 transition-colors hover:bg-gray-800"
        >
          Refresh from server
        </button>
        <span className="text-xs text-gray-500">Reads the same /api/config endpoint the other tabs use.</span>
      </div>
    </div>
  );
}
