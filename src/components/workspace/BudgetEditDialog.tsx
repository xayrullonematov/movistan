"use client";

import { useState } from "react";
import { X, Loader2 } from "lucide-react";
import { toast } from "@/hooks/useToast";

interface BudgetEditDialogProps {
  open: boolean;
  sessionId: string;
  currentBudget: number | null;
  currentUsed: number;
  onClose: () => void;
  onSaved?: (next: number | null) => void;
}

export default function BudgetEditDialog({
  open,
  sessionId,
  currentBudget,
  currentUsed,
  onClose,
  onSaved,
}: BudgetEditDialogProps) {
  const [value, setValue] = useState<string>(currentBudget == null ? "" : String(currentBudget));
  const [unlimited, setUnlimited] = useState<boolean>(currentBudget == null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!open) return null;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    let nextBudget: number | null = null;
    if (!unlimited) {
      const trimmed = value.trim();
      const parsed = Number(trimmed);
      if (!trimmed || !Number.isFinite(parsed) || !Number.isInteger(parsed) || parsed <= 0) {
        setError("Budget must be a positive integer.");
        return;
      }
      if (parsed < currentUsed) {
        setError(`Budget can't drop below current usage (${currentUsed.toLocaleString()} tokens).`);
        return;
      }
      nextBudget = parsed;
    }

    setSaving(true);
    try {
      const res = await fetch(`/api/sessions/${sessionId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tokenBudget: nextBudget }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(body.error ?? "Couldn't update budget. Please try again.");
      }
      onSaved?.(nextBudget);
      toast.success({
        message: "Budget updated",
        description:
          nextBudget === null
            ? "Session is now unlimited."
            : `New ceiling: ${nextBudget.toLocaleString()} tokens.`,
      });
      onClose();
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Network error";
      setError(msg);
      toast.error({ message: "Couldn't update budget", description: msg });
    } finally {
      setSaving(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="budget-edit-title"
    >
      <form
        onSubmit={handleSubmit}
        className="w-full max-w-md overflow-hidden rounded-xl border border-gray-700 bg-gray-900 shadow-2xl"
      >
        <header className="flex items-center justify-between border-b border-gray-800 px-5 py-3">
          <h2 id="budget-edit-title" className="text-sm font-semibold text-gray-100">
            Edit session budget
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="rounded-md p-1 text-gray-400 transition-colors hover:bg-gray-800 hover:text-gray-100"
          >
            <X size={16} />
          </button>
        </header>

        <div className="space-y-4 px-5 py-4 text-sm">
          <div className="rounded-md border border-gray-800 bg-gray-950/40 px-3 py-2 text-xs text-gray-400">
            Used so far: <span className="font-mono text-gray-200">{currentUsed.toLocaleString()}</span> tokens
          </div>

          <label className="flex items-center gap-2 text-gray-200">
            <input
              type="checkbox"
              checked={unlimited}
              onChange={(e) => setUnlimited(e.target.checked)}
              className="accent-blue-500"
            />
            Unlimited (no ceiling)
          </label>

          <div>
            <label htmlFor="budget-edit-value" className="block text-xs font-medium text-gray-300">
              New token ceiling
            </label>
            <input
              id="budget-edit-value"
              type="number"
              min={1}
              step={1000}
              inputMode="numeric"
              value={value}
              onChange={(e) => setValue(e.target.value)}
              placeholder="e.g. 250000"
              disabled={unlimited}
              className="mt-1 w-full rounded-md border border-gray-700 bg-gray-950/70 px-3 py-2 text-sm text-gray-100 placeholder:text-gray-500 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 disabled:cursor-not-allowed disabled:opacity-50"
            />
            <p className="mt-1 text-xs text-gray-500">
              Raising mid-round is safe; lowering below current usage is rejected.
            </p>
          </div>

          {error && (
            <div className="rounded-md border border-red-500/40 bg-red-500/10 px-3 py-2 text-xs text-red-200">
              {error}
            </div>
          )}
        </div>

        <footer className="flex items-center justify-end gap-2 border-t border-gray-800 px-5 py-3">
          <button
            type="button"
            onClick={onClose}
            className="rounded-md px-3 py-1.5 text-xs text-gray-300 transition-colors hover:bg-gray-800"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={saving}
            className="inline-flex items-center gap-2 rounded-md bg-blue-600 px-4 py-1.5 text-xs font-medium text-white transition-colors hover:bg-blue-500 disabled:opacity-50"
          >
            {saving && <Loader2 size={12} className="animate-spin" />}
            {saving ? "Saving…" : "Save"}
          </button>
        </footer>
      </form>
    </div>
  );
}
