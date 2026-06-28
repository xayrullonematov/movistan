"use client";

import { AlertTriangle, ShieldAlert, ChevronRight } from "lucide-react";
import type { SessionState, Severity } from "@/types/domain";

interface TopFindingsListProps {
  session: SessionState;
  onViewAllFindings: () => void;
}

const severityTextColors: Record<Severity, string> = {
  high: "text-red-400",
  medium: "text-amber-400",
  low: "text-green-400",
};

const severityBgColors: Record<Severity, string> = {
  high: "border-red-500/30 bg-red-500/10",
  medium: "border-amber-500/30 bg-amber-500/10",
  low: "border-green-500/30 bg-green-500/10",
};

const severityLabels: Record<Severity, string> = {
  high: "Critical",
  medium: "Medium",
  low: "Low",
};

export default function TopFindingsList({ session, onViewAllFindings }: TopFindingsListProps) {
  const consensus = session.consensus;
  if (!consensus) return null;

  const risks = [...(consensus.identifiedRisks || [])];
  const severityOrder: Record<Severity, number> = { high: 0, medium: 1, low: 2 };
  risks.sort((a, b) => severityOrder[a.severity] - severityOrder[b.severity]);

  // Also include artifact-sourced findings (risks from artifacts)
  const riskArtifacts = session.artifacts
    .filter((a) => a.type === "risk" && a.status !== "rejected")
    .slice(0, 3);

  // Use consensus risks if available, otherwise fallback to artifacts
  const topItems = risks.length > 0
    ? risks.slice(0, 3)
    : riskArtifacts.map((a) => ({
        description: a.content,
        severity: "medium" as Severity,
        raisedBy: a.contributors,
      }));

  if (topItems.length === 0) return null;

  return (
    <section>
      <div className="flex items-center gap-2 mb-3">
        <ShieldAlert size={16} className="text-[var(--text-secondary)]" />
        <h3 className="text-sm font-semibold text-[var(--text-primary)]">Top Findings</h3>
      </div>

      <div className="space-y-2">
        {topItems.map((item, i) => (
          <div key={i} className={`rounded-lg border px-4 py-3 ${severityBgColors[item.severity]}`}>
            <div className="flex items-center gap-2 mb-1">
              <AlertTriangle size={12} className={severityTextColors[item.severity]} />
              <span className={`text-xs font-medium ${severityTextColors[item.severity]}`}>
                {severityLabels[item.severity]}
              </span>
            </div>
            <p className="text-sm text-[var(--text-primary)] leading-relaxed line-clamp-2">
              {item.description}
            </p>
          </div>
        ))}
      </div>

      {(risks.length > 3 || session.artifacts.length > 0) && (
        <button
          onClick={onViewAllFindings}
          className="mt-3 flex items-center gap-1 text-xs text-[var(--brand-violet)] hover:text-[var(--violet-hover)] transition-colors"
        >
          View all findings
          <ChevronRight size={12} />
        </button>
      )}
    </section>
  );
}
