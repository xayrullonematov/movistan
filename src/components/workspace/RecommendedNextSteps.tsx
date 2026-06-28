"use client";

import { Copy, Download, RotateCcw, Plus } from "lucide-react";
import type { SessionState } from "@/types/domain";
import { toast } from "@/hooks/useToast";
import Link from "next/link";

interface RecommendedNextStepsProps {
  session: SessionState;
  onExport: () => void;
  onRerun: () => void;
  rerunDisabled: boolean;
}

export default function RecommendedNextSteps({
  session,
  onExport,
  onRerun,
  rerunDisabled,
}: RecommendedNextStepsProps) {
  const consensus = session.consensus;
  const decisions = consensus?.recommendedDecisions || [];

  const handleCopyFixPlan = () => {
    if (decisions.length === 0) return;
    const lines = decisions.map(
      (d, i) => `${i + 1}. ${d.title}${d.description ? `\n   ${d.description}` : ""}`
    );
    const plan = `# Fix Plan\n\n${lines.join("\n\n")}`;
    navigator.clipboard.writeText(plan);
    toast.success({ message: "Fix plan copied to clipboard" });
  };

  return (
    <section>
      <h3 className="text-sm font-semibold text-[var(--text-primary)] mb-3">Next Steps</h3>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        {decisions.length > 0 && (
          <button
            onClick={handleCopyFixPlan}
            className="flex items-center gap-2.5 rounded-lg border border-[var(--border)] bg-[var(--surface)] px-4 py-3 text-sm font-medium text-[var(--text-primary)] hover:bg-[var(--surface-elevated)] transition-colors text-left"
          >
            <Copy size={16} className="text-[var(--text-muted)] shrink-0" />
            <span>Copy fix plan</span>
          </button>
        )}
        <button
          onClick={onExport}
          className="flex items-center gap-2.5 rounded-lg bg-[var(--brand-violet)] px-4 py-3 text-sm font-medium text-white hover:bg-[var(--violet-hover)] transition-colors text-left focus:outline-none focus:ring-2 focus:ring-[var(--violet-glow)]"
        >
          <Download size={16} className="shrink-0" />
          <span>Export report</span>
        </button>
        <button
          onClick={onRerun}
          disabled={rerunDisabled}
          className="flex items-center gap-2.5 rounded-lg border border-[var(--border)] bg-[var(--surface)] px-4 py-3 text-sm font-medium text-[var(--text-primary)] hover:bg-[var(--surface-elevated)] transition-colors text-left disabled:opacity-50"
        >
          <RotateCcw size={16} className="text-[var(--text-muted)] shrink-0" />
          <span>Re-run review</span>
        </button>
        <Link
          href="/"
          className="flex items-center gap-2.5 rounded-lg border border-[var(--border)] bg-[var(--surface)] px-4 py-3 text-sm font-medium text-[var(--text-primary)] hover:bg-[var(--surface-elevated)] transition-colors text-left"
        >
          <Plus size={16} className="text-[var(--text-muted)] shrink-0" />
          <span>Analyze another repo</span>
        </Link>
      </div>
    </section>
  );
}
