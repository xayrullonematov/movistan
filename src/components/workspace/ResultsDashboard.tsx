"use client";

import { useState } from "react";
import { Download, ChevronDown, ChevronUp } from "lucide-react";
import type { SessionState, AgentType, Severity } from "@/types/domain";
import Skeleton from "@/components/ui/Skeleton";

interface ResultsDashboardProps {
  session: SessionState;
  onExport?: () => void;
  loading?: boolean;
}

export function ResultsDashboardSkeleton() {
  return (
    <div className="h-full overflow-y-auto px-3 py-3 space-y-3 sm:px-4 sm:py-4 sm:space-y-5">
      <Skeleton className="h-10 w-full rounded-lg" />
      <Skeleton className="h-28 w-full rounded-xl" />
      <div className="space-y-2">
        <Skeleton className="h-4 w-32" />
        <Skeleton className="h-14 w-full rounded-lg" />
        <Skeleton className="h-14 w-full rounded-lg" />
      </div>
    </div>
  );
}

const severityTextColors: Record<Severity, string> = {
  high: "text-red-300",
  medium: "text-amber-300",
  low: "text-green-300",
};

const agentLabels: Record<AgentType, string> = {
  "senior-engineer": "Senior Engineer",
  "security-engineer": "Security Engineer",
  "performance-engineer": "Performance Engineer",
  "product-engineer": "Product Engineer",
};

const severityLabels: Record<Severity, string> = {
  high: "High risk",
  medium: "Medium risk",
  low: "Low risk",
};

/**
 * Normalize a confidence value to a percentage integer.
 * If confidence > 1, treat it as already a percentage (0-100 scale).
 * Otherwise, multiply by 100 to convert from 0-1 fraction.
 */
export function formatConfidence(confidence: number): number {
  if (confidence > 1) return Math.round(confidence);
  return Math.round(confidence * 100);
}

function ConsensusMeter({
  agreements,
  disagreements,
}: {
  agreements: number;
  disagreements: number;
}) {
  const total = agreements + disagreements;
  const percentage = total > 0 ? Math.round((agreements / total) * 100) : 0;

  const getColor = (pct: number): string => {
    if (pct >= 75) return "text-green-400";
    if (pct >= 50) return "text-amber-400";
    return "text-red-400";
  };

  const getBarColor = (pct: number): string => {
    if (pct >= 75) return "bg-green-500";
    if (pct >= 50) return "bg-amber-500";
    return "bg-red-500";
  };

  return (
    <>
      <div className="rounded-lg border border-gray-700 bg-gray-800/50 px-3 py-2 sm:hidden">
        <div className="flex items-center justify-between gap-3">
          <span className="text-sm font-medium text-gray-300">Consensus</span>
          <span className={`text-sm font-bold ${getColor(percentage)}`}>{percentage}%</span>
        </div>
        <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-gray-700">
          <div
            className={`h-full rounded-full transition-all duration-500 ${getBarColor(percentage)}`}
            style={{ width: `${percentage}%` }}
          />
        </div>
        <div className="mt-1.5 flex items-center justify-between text-xs text-gray-400">
          <span>{agreements} agreements</span>
          <span>{disagreements} disagreements</span>
        </div>
      </div>

      <div className="hidden rounded-xl border border-gray-700 bg-gray-800/50 p-4 sm:block">
        <h3 className="text-sm font-medium text-gray-300 mb-3">
          Consensus Level
        </h3>
        <div className="flex items-center gap-4">
          <div className="relative w-20 h-20">
            <svg viewBox="0 0 80 80" className="w-full h-full -rotate-90">
              <circle
                cx="40"
                cy="40"
                r="34"
                fill="none"
                stroke="#374151"
                strokeWidth="6"
              />
              <circle
                cx="40"
                cy="40"
                r="34"
                fill="none"
                stroke={percentage >= 75 ? "#22c55e" : percentage >= 50 ? "#f59e0b" : "#ef4444"}
                strokeWidth="6"
                strokeDasharray={`${(percentage / 100) * 213.6} 213.6`}
                strokeLinecap="round"
                className="transition-all duration-700"
              />
            </svg>
            <div className="absolute inset-0 flex items-center justify-center">
              <span className={`text-lg font-bold ${getColor(percentage)}`}>
                {percentage}%
              </span>
            </div>
          </div>
          <div className="flex-1 space-y-2">
            <div className="flex items-center justify-between text-xs">
              <span className="text-gray-400">Agreement</span>
              <span className="text-green-400 font-mono">{agreements}</span>
            </div>
            <div className="h-1.5 rounded-full bg-gray-700 overflow-hidden">
              <div
                className={`h-full rounded-full transition-all duration-500 ${getBarColor(percentage)}`}
                style={{ width: `${percentage}%` }}
              />
            </div>
            <div className="flex items-center justify-between text-xs">
              <span className="text-gray-400">Disagreement</span>
              <span className="text-red-400 font-mono">{disagreements}</span>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}

export default function ResultsDashboard({
  session,
  onExport,
  loading = false,
}: ResultsDashboardProps) {
  const consensus = session.consensus;
  const [showAllDecisions, setShowAllDecisions] = useState(false);
  const [showAllRisks, setShowAllRisks] = useState(false);

  if (loading) {
    return <ResultsDashboardSkeleton />;
  }

  if (!consensus) {
    const hasArtifacts = session.artifacts.length > 0;
    const acceptedArtifacts = session.artifacts.filter(a => a.status === "accepted");
    const draftArtifacts = session.artifacts.filter(a => a.status === "draft");

    return (
      <div className="h-full overflow-y-auto px-3 py-3 space-y-4 sm:px-4 sm:py-4 sm:space-y-5">
        {/* Problem statement — always visible */}
        <div>
          <h2 className="text-lg font-semibold text-gray-50 sm:text-xl">Decision Report</h2>
          <p className="mt-2 text-sm leading-relaxed text-gray-300">{session.problemDescription}</p>
        </div>

        {/* Constraints if any */}
        {session.constraints.length > 0 && (
          <div>
            <h3 className="text-xs font-medium text-gray-400 uppercase tracking-wider mb-2">Constraints</h3>
            <ul className="space-y-1">
              {session.constraints.map((c, i) => (
                <li key={i} className="text-sm text-gray-300 flex items-start gap-2">
                  <span className="text-emerald-500 mt-0.5 shrink-0">—</span>
                  <span>{c.text}</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Early artifacts — show what agents have produced so far */}
        {hasArtifacts && (
          <div>
            <h3 className="text-xs font-medium text-gray-400 uppercase tracking-wider mb-2">
              Findings so far
            </h3>
            <div className="space-y-2">
              {[...acceptedArtifacts, ...draftArtifacts].slice(0, 5).map((a) => (
                <div key={a.id} className="rounded-lg border border-gray-700/50 bg-gray-900/40 px-3 py-2.5">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-medium text-gray-500 uppercase">{a.type}</span>
                    {a.status === "accepted" && <span className="text-[10px] text-green-400">✓ accepted</span>}
                  </div>
                  <p className="mt-1 text-sm font-medium text-gray-200">{a.title}</p>
                  <p className="mt-1 text-sm text-gray-400 line-clamp-2">{a.content}</p>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Progress note */}
        {!hasArtifacts && (
          <div className="rounded-lg border border-gray-700/50 bg-gray-800/30 px-4 py-3 text-center">
            <p className="text-sm text-gray-400">
              The full report will appear here after the first round completes.
            </p>
          </div>
        )}
      </div>
    );
  }

  // Derive headline from top recommended decision or overall confidence
  const topDecision = consensus.recommendedDecisions?.[0];
  const headline = topDecision
    ? `Recommendation: ${topDecision.title} \u2014 confidence ${formatConfidence(topDecision.confidence)}%`
    : `Overall Confidence: ${formatConfidence(consensus.overallConfidence || 0)}%`;

  // Sort decisions by confidence descending
  const sortedDecisions = [...(consensus.recommendedDecisions || [])].sort(
    (a, b) => b.confidence - a.confidence
  );
  const visibleLimit = 3;
  const cappedDecisions = showAllDecisions ? sortedDecisions : sortedDecisions.slice(0, visibleLimit);
  const hasMoreDecisions = sortedDecisions.length > visibleLimit;

  // Sort risks by severity: high > medium > low
  const severityOrder: Record<Severity, number> = { high: 0, medium: 1, low: 2 };
  const sortedRisks = [...(consensus.identifiedRisks || [])].sort(
    (a, b) => severityOrder[a.severity] - severityOrder[b.severity]
  );
  const cappedRisks = showAllRisks ? sortedRisks : sortedRisks.slice(0, visibleLimit);
  const hasMoreRisks = sortedRisks.length > visibleLimit;

  return (
    <div className="h-full overflow-y-auto px-3 py-3 space-y-3 sm:px-4 sm:py-4 sm:space-y-5">
      {/* Headline / TL;DR */}
      <div className="rounded-lg bg-emerald-500/8 border border-emerald-600/30 px-4 py-3">
        <p className="text-base font-semibold text-emerald-100">{headline}</p>
        <p className="mt-1 text-sm text-gray-400 line-clamp-2">{session.problemDescription}</p>
      </div>

      {/* Consensus Meter */}
      <ConsensusMeter
        agreements={consensus.agreements?.length || 0}
        disagreements={consensus.disagreements?.length || 0}
      />

      {/* Key Decisions */}
      {sortedDecisions.length > 0 && (
        <div>
          <h3 className="text-sm font-medium text-gray-300 mb-3">
            Key Decisions
          </h3>
          <div className="space-y-2">
            {cappedDecisions.map((decision, i) => (
              <div
                key={i}
                className="rounded-lg bg-green-500/5 border border-green-600/30 p-3"
              >
                <div className="flex items-start justify-between gap-2">
                  <h4 className="text-sm font-medium text-green-300">
                    {decision.title}
                  </h4>
                  <span className="text-sm text-green-300 font-mono shrink-0">
                    {formatConfidence(decision.confidence)}%
                  </span>
                </div>
                <p className="mt-2 line-clamp-3 text-sm leading-relaxed text-gray-300 sm:line-clamp-none">
                  {decision.description}
                </p>
              </div>
            ))}
          </div>
          {hasMoreDecisions && (
            <button
              onClick={() => setShowAllDecisions(!showAllDecisions)}
              className="mt-2 flex min-h-10 items-center gap-1 text-sm text-emerald-300 hover:text-emerald-200 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/70 rounded"
              aria-expanded={showAllDecisions}
            >
              {showAllDecisions ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
              {showAllDecisions ? "Show less" : `Show all (${sortedDecisions.length})`}
            </button>
          )}
        </div>
      )}

      {/* Risk Register */}
      {sortedRisks.length > 0 && (
        <div>
          <h3 className="text-sm font-medium text-gray-300 mb-3">
            Risk Register
          </h3>
          <div className="space-y-2 sm:hidden">
            {cappedRisks.map((risk, i) => (
              <div key={i} className="rounded-lg border border-gray-700 bg-gray-900/45 p-3">
                <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm">
                  <span className={`font-medium ${severityTextColors[risk.severity]}`}>
                    {severityLabels[risk.severity]}
                  </span>
                  <span aria-hidden="true" className="text-gray-600">/</span>
                  <span className="text-gray-400">
                    Raised by {risk.raisedBy.map((agentId) => agentLabels[agentId]).join(", ")}
                  </span>
                </div>
                <p className="mt-2 line-clamp-3 text-sm leading-relaxed text-gray-200">{risk.description}</p>
              </div>
            ))}
          </div>
          <div className="hidden rounded-lg border border-gray-700 overflow-hidden sm:block">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-800/50">
                  <th className="text-left px-3 py-2 text-gray-300 font-medium">
                    Risk
                  </th>
                  <th className="text-left px-3 py-2 text-gray-300 font-medium w-28">
                    Severity
                  </th>
                  <th className="text-left px-3 py-2 text-gray-300 font-medium w-28">
                    Raised By
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-700/50">
                {cappedRisks.map((risk, i) => (
                  <tr key={i} className="hover:bg-gray-800/30">
                    <td className="px-3 py-2 text-gray-200">
                      {risk.description}
                    </td>
                    <td className="px-3 py-2">
                      <span className={`text-sm font-medium ${severityTextColors[risk.severity]}`}>
                        {severityLabels[risk.severity]}
                      </span>
                    </td>
                    <td className="px-3 py-2">
                      <span className="text-gray-300">
                        {risk.raisedBy.map((agentId) => agentLabels[agentId]).join(", ")}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {hasMoreRisks && (
            <button
              onClick={() => setShowAllRisks(!showAllRisks)}
              className="mt-2 flex min-h-10 items-center gap-1 text-sm text-emerald-300 hover:text-emerald-200 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/70 rounded"
              aria-expanded={showAllRisks}
            >
              {showAllRisks ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
              {showAllRisks ? "Show less" : `Show all (${sortedRisks.length})`}
            </button>
          )}
        </div>
      )}

      {/* Open Questions */}
      {consensus.openQuestions && consensus.openQuestions.length > 0 && (
        <div>
          <h3 className="text-sm font-medium text-gray-300 mb-3">
            Open Questions
          </h3>
          <ul className="space-y-2">
            {consensus.openQuestions.map((question, i) => (
              <li
                key={i}
                className="flex items-start gap-2 text-sm text-gray-300 bg-gray-800/40 rounded-lg px-3 py-2 border border-gray-700/50"
              >
                <span className="text-cyan-400 shrink-0 mt-0.5">?</span>
                <span>{question}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Export Button */}
      {onExport && (
        <div className="border-t border-gray-700 pt-2 sm:pt-3">
          <button
            onClick={onExport}
            className="flex min-h-11 items-center gap-2 px-4 py-2.5 rounded-lg bg-gray-800 border border-gray-700 text-sm text-gray-200 hover:bg-gray-700 hover:text-white transition-colors w-full justify-center"
          >
            <Download size={16} />
            <span>Export Report as Markdown</span>
          </button>
        </div>
      )}
    </div>
  );
}
