"use client";

import { useState } from "react";
import {
  Download,
  ChevronDown,
  ChevronUp,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  HelpCircle,
  Lightbulb,
  ShieldAlert,
} from "lucide-react";
import type { SessionState, SessionConfig, AgentType, Severity } from "@/types/domain";
import Skeleton from "@/components/ui/Skeleton";

interface ResultsDashboardProps {
  session: SessionState;
  config?: SessionConfig;
  onExport?: () => void;
  loading?: boolean;
}

export function ResultsDashboardSkeleton() {
  return (
    <div className="h-full overflow-y-auto px-4 py-5 space-y-5 sm:px-6 sm:py-6 sm:space-y-6">
      {/* Header skeleton */}
      <div className="space-y-3">
        <Skeleton className="h-7 w-48 rounded" />
        <Skeleton className="h-4 w-72 rounded" />
      </div>
      {/* Summary card skeleton */}
      <Skeleton className="h-32 w-full rounded-xl" />
      {/* Findings skeleton */}
      <div className="space-y-2">
        <Skeleton className="h-5 w-36 rounded" />
        <Skeleton className="h-16 w-full rounded-lg" />
        <Skeleton className="h-16 w-full rounded-lg" />
        <Skeleton className="h-16 w-full rounded-lg" />
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

/** Derive a short verdict label from the overall confidence score and risk data. */
export function deriveVerdict(
  score: number,
  risks: { severity: Severity }[] = []
): { label: string; color: string; icon: typeof CheckCircle2 } {
  const highRiskCount = risks.filter((r) => r.severity === "high").length;
  const mediumRiskCount = risks.filter((r) => r.severity === "medium").length;

  // High-severity risks always block a "Ready to ship" verdict
  if (highRiskCount > 0) {
    return { label: "Fix before shipping", color: "text-amber-400", icon: AlertTriangle };
  }

  // Multiple medium risks should also warn the user
  if (mediumRiskCount >= 3) {
    return { label: "Fix before shipping", color: "text-amber-400", icon: AlertTriangle };
  }

  // Score-based fallback
  if (score >= 80) return { label: "Ready to ship", color: "text-green-400", icon: CheckCircle2 };
  if (score >= 60) return { label: "Fix before shipping", color: "text-amber-400", icon: AlertTriangle };
  return { label: "Needs significant work", color: "text-red-400", icon: XCircle };
}

/** Derive a one-line summary from the consensus data. */
function deriveSummary(
  agreements: { point: string }[],
  risks: { description: string; severity: Severity }[],
  decisions: { title: string }[]
): string {
  const highRisks = risks.filter((r) => r.severity === "high");
  if (highRisks.length > 0) {
    return `${highRisks.length} critical risk${highRisks.length > 1 ? "s" : ""} found. Top risk: ${highRisks[0].description.slice(0, 100)}`;
  }
  if (decisions.length > 0) {
    return `${decisions.length} recommendation${decisions.length > 1 ? "s" : ""} identified across the codebase.`;
  }
  if (agreements.length > 0) {
    return `${agreements.length} point${agreements.length > 1 ? "s" : ""} of agent agreement reached.`;
  }
  return "Analysis complete. Review findings below.";
}

function ScoreRing({ score, size = 64 }: { score: number; size?: number }) {
  const radius = (size - 8) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (score / 100) * circumference;

  const getColor = (s: number) => {
    if (s >= 80) return "#22C55E";
    if (s >= 60) return "#F59E0B";
    return "#EF4444";
  };

  const getTextColor = (s: number) => {
    if (s >= 80) return "text-green-400";
    if (s >= 60) return "text-amber-400";
    return "text-red-400";
  };

  return (
    <div className="relative" style={{ width: size, height: size }}>
      <svg viewBox={`0 0 ${size} ${size}`} className="w-full h-full -rotate-90">
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="#1F2937"
          strokeWidth="5"
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={getColor(score)}
          strokeWidth="5"
          strokeDasharray={`${circumference}`}
          strokeDashoffset={offset}
          strokeLinecap="round"
          className="transition-all duration-700"
        />
      </svg>
      <div className="absolute inset-0 flex items-center justify-center">
        <span className={`text-sm font-bold font-mono ${getTextColor(score)}`}>
          {score}
        </span>
      </div>
    </div>
  );
}

export default function ResultsDashboard({
  session,
  config,
  onExport,
  loading = false,
}: ResultsDashboardProps) {
  const consensus = session.consensus;
  const [showAllDecisions, setShowAllDecisions] = useState(false);
  const [showAllRisks, setShowAllRisks] = useState(false);
  const [showAllAgreements, setShowAllAgreements] = useState(false);

  if (loading) {
    return <ResultsDashboardSkeleton />;
  }

  if (!consensus) {
    const hasArtifacts = session.artifacts.length > 0;
    const acceptedArtifacts = session.artifacts.filter(
      (a) => a.status === "accepted"
    );
    const draftArtifacts = session.artifacts.filter(
      (a) => a.status === "draft"
    );

    return (
      <div className="h-full overflow-y-auto px-4 py-5 space-y-5 sm:px-6 sm:py-6 sm:space-y-6">
        <div>
          <h2 className="text-xl font-semibold text-[#F8FAFC]">
            Review Report
          </h2>
          <p className="mt-1.5 text-sm leading-relaxed text-[#94A3B8]">
            {session.problemDescription}
          </p>
        </div>

        {session.constraints.length > 0 && (
          <div className="rounded-lg border border-[#1F2937] bg-[#111827] px-4 py-3">
            <h3 className="text-xs font-medium text-[#94A3B8] uppercase tracking-wider mb-2">
              Review Constraints
            </h3>
            <ul className="space-y-1.5">
              {session.constraints.map((c, i) => (
                <li
                  key={i}
                  className="text-sm text-[#F8FAFC] flex items-start gap-2"
                >
                  <span className="text-[#7C3AED] mt-0.5 shrink-0 font-mono text-xs">
                    -
                  </span>
                  <span>{c.text}</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {hasArtifacts && (
          <div>
            <h3 className="text-sm font-medium text-[#94A3B8] uppercase tracking-wider mb-3">
              Findings so far
            </h3>
            <div className="space-y-2">
              {[...acceptedArtifacts, ...draftArtifacts]
                .slice(0, 5)
                .map((a) => (
                  <div
                    key={a.id}
                    className="rounded-lg border border-[#1F2937] bg-[#111827] px-4 py-3"
                  >
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-mono text-[#64748B] uppercase">
                        {a.type}
                      </span>
                      {a.status === "accepted" && (
                        <span className="text-[10px] text-green-400 font-mono">
                          accepted
                        </span>
                      )}
                    </div>
                    <p className="mt-1 text-sm font-medium text-[#F8FAFC]">
                      {a.title}
                    </p>
                    <p className="mt-1 text-sm text-[#94A3B8] line-clamp-2">
                      {a.content}
                    </p>
                  </div>
                ))}
            </div>
          </div>
        )}

        {!hasArtifacts && (
          <div className="rounded-xl border border-[#1F2937] bg-[#111827] px-5 py-6 text-center">
            <div className="mx-auto mb-3 w-10 h-10 rounded-full bg-[#7C3AED]/12 flex items-center justify-center">
              <ShieldAlert size={20} className="text-[#7C3AED]" />
            </div>
            <p className="text-sm font-medium text-[#F8FAFC]">
              Analyzing repository...
            </p>
            <p className="mt-1.5 text-xs text-[#64748B]">
              Findings will appear here after the review completes.
            </p>
          </div>
        )}
      </div>
    );
  }

  // ─── Main report: consensus available ────────────────────────────────────────
  const score = formatConfidence(consensus.overallConfidence || 0);

  const agreements = consensus.agreements || [];
  const disagreements = consensus.disagreements || [];
  const agreeCount = agreements.length;
  const disagreeCount = disagreements.length;
  const totalPoints = agreeCount + disagreeCount;
  const agreementPct =
    totalPoints > 0 ? Math.round((agreeCount / totalPoints) * 100) : 0;

  const risks = [...(consensus.identifiedRisks || [])];
  const severityOrder: Record<Severity, number> = { high: 0, medium: 1, low: 2 };
  risks.sort((a, b) => severityOrder[a.severity] - severityOrder[b.severity]);

  const verdict = deriveVerdict(score, risks);
  const VerdictIcon = verdict.icon;

  const decisions = [...(consensus.recommendedDecisions || [])].sort(
    (a, b) => b.confidence - a.confidence
  );

  const openQuestions = consensus.openQuestions || [];
  const summary = deriveSummary(agreements, risks, decisions);

  const visibleLimit = 5;
  const cappedRisks = showAllRisks ? risks : risks.slice(0, visibleLimit);
  const cappedDecisions = showAllDecisions
    ? decisions
    : decisions.slice(0, visibleLimit);
  const cappedAgreements = showAllAgreements
    ? agreements
    : agreements.slice(0, 3);

  const highRisks = risks.filter((r) => r.severity === "high");
  const mediumRisks = risks.filter((r) => r.severity === "medium");
  const lowRisks = risks.filter((r) => r.severity === "low");

  return (
    <div className="h-full overflow-y-auto px-4 py-5 space-y-5 sm:px-6 sm:py-6 sm:space-y-6">
      {/* ─── Top Summary Card ─────────────────────────────────────────────── */}
      <div className="rounded-xl border border-[#1F2937] bg-[#111827] p-5">
        <div className="flex items-start justify-between gap-4">
          <div className="flex-1 min-w-0">
            <h2 className="text-lg font-semibold text-[#F8FAFC] sm:text-xl">
              Review Report
            </h2>
            {config?.githubRepo && (
              <p className="mt-1 text-xs text-[#64748B] font-mono">
                {config.githubRepo.owner}/{config.githubRepo.repo}
                {config.githubRepo.branch ? ` (${config.githubRepo.branch})` : ""}
              </p>
            )}
            <p className="mt-1 text-sm text-[#94A3B8] line-clamp-2">
              {session.problemDescription}
            </p>
          </div>
          <ScoreRing score={score} />
        </div>

        <div className="mt-4 flex items-center gap-2">
          <VerdictIcon size={16} className={verdict.color} />
          <span className={`text-sm font-semibold ${verdict.color}`}>
            {verdict.label}
          </span>
        </div>
        <p className="mt-2 text-sm text-[#94A3B8] leading-relaxed">
          {summary}
        </p>

        <div className="mt-4 grid grid-cols-3 gap-3 pt-3 border-t border-[#1F2937]">
          <div className="text-center">
            <p className="text-xs text-[#64748B]">Risks</p>
            <p className="text-sm font-mono font-semibold text-[#F8FAFC]">
              {risks.length}
            </p>
          </div>
          <div className="text-center">
            <p className="text-xs text-[#64748B]">Fixes</p>
            <p className="text-sm font-mono font-semibold text-[#F8FAFC]">
              {decisions.length}
            </p>
          </div>
          <div className="text-center">
            <p className="text-xs text-[#64748B]">Agreement</p>
            <p className="text-sm font-mono font-semibold text-[#F8FAFC]">
              {agreementPct}%
            </p>
          </div>
        </div>
      </div>

      {/* ─── Risks Found ──────────────────────────────────────────────────── */}
      {risks.length > 0 && (
        <section>
          <div className="flex items-center gap-2 mb-3">
            <ShieldAlert size={16} className="text-[#94A3B8]" />
            <h3 className="text-sm font-semibold text-[#F8FAFC]">
              Risks Found
            </h3>
            {highRisks.length > 0 && (
              <span className="ml-auto text-xs font-mono text-red-400">
                {highRisks.length} critical
              </span>
            )}
          </div>

          <div className="space-y-2">
            {cappedRisks.map((risk, i) => (
              <div
                key={i}
                className={`rounded-lg border px-4 py-3 ${
                  risk.severity === "high"
                    ? "border-red-500/30 bg-red-500/5"
                    : risk.severity === "medium"
                      ? "border-amber-500/20 bg-amber-500/5"
                      : "border-[#1F2937] bg-[#111827]"
                }`}
              >
                <div className="flex items-center gap-2 mb-1.5">
                  <span
                    className={`text-xs font-mono font-medium ${severityTextColors[risk.severity]}`}
                  >
                    {severityLabels[risk.severity]}
                  </span>
                  <span className="text-[#64748B] text-xs">
                    {risk.raisedBy
                      .map((agentId) => agentLabels[agentId])
                      .join(", ")}
                  </span>
                </div>
                <p className="text-sm text-[#F8FAFC] leading-relaxed">
                  {risk.description}
                </p>
              </div>
            ))}
          </div>

          {risks.length > visibleLimit && (
            <button
              onClick={() => setShowAllRisks(!showAllRisks)}
              className="mt-2 flex items-center gap-1 text-xs text-[#7C3AED] hover:text-[#8B5CF6] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#7C3AED]/50 rounded px-1 py-1"
              aria-expanded={showAllRisks}
            >
              {showAllRisks ? (
                <ChevronUp size={12} />
              ) : (
                <ChevronDown size={12} />
              )}
              {showAllRisks ? "Show less" : `Show all ${risks.length} risks`}
            </button>
          )}

          {risks.length > 1 && (
            <div className="mt-3 flex items-center gap-4 text-xs text-[#64748B]">
              {highRisks.length > 0 && (
                <span className="flex items-center gap-1">
                  <span className="w-2 h-2 rounded-full bg-red-500" />
                  {highRisks.length} high
                </span>
              )}
              {mediumRisks.length > 0 && (
                <span className="flex items-center gap-1">
                  <span className="w-2 h-2 rounded-full bg-amber-500" />
                  {mediumRisks.length} medium
                </span>
              )}
              {lowRisks.length > 0 && (
                <span className="flex items-center gap-1">
                  <span className="w-2 h-2 rounded-full bg-green-500" />
                  {lowRisks.length} low
                </span>
              )}
            </div>
          )}
        </section>
      )}

      {/* ─── Suggested Fixes ──────────────────────────────────────────────── */}
      {decisions.length > 0 && (
        <section>
          <div className="flex items-center gap-2 mb-3">
            <Lightbulb size={16} className="text-[#94A3B8]" />
            <h3 className="text-sm font-semibold text-[#F8FAFC]">
              Suggested Fixes
            </h3>
          </div>

          <div className="space-y-2">
            {cappedDecisions.map((decision, i) => (
              <div
                key={i}
                className="rounded-lg border border-[#1F2937] bg-[#111827] px-4 py-3"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-start gap-2.5 min-w-0">
                    <span className="text-xs font-mono text-[#64748B] mt-0.5 shrink-0">
                      {i + 1}.
                    </span>
                    <h4 className="text-sm font-medium text-[#F8FAFC]">
                      {decision.title}
                    </h4>
                  </div>
                  <span className="text-xs font-mono text-[#94A3B8] shrink-0">
                    {formatConfidence(decision.confidence)}%
                  </span>
                </div>
                {decision.description && (
                  <p className="mt-1.5 pl-5 text-sm text-[#94A3B8] leading-relaxed line-clamp-3">
                    {decision.description}
                  </p>
                )}
              </div>
            ))}
          </div>

          {decisions.length > visibleLimit && (
            <button
              onClick={() => setShowAllDecisions(!showAllDecisions)}
              className="mt-2 flex items-center gap-1 text-xs text-[#7C3AED] hover:text-[#8B5CF6] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#7C3AED]/50 rounded px-1 py-1"
              aria-expanded={showAllDecisions}
            >
              {showAllDecisions ? (
                <ChevronUp size={12} />
              ) : (
                <ChevronDown size={12} />
              )}
              {showAllDecisions
                ? "Show less"
                : `Show all ${decisions.length} fixes`}
            </button>
          )}
        </section>
      )}

      {/* ─── Questions to Resolve ─────────────────────────────────────────── */}
      {openQuestions.length > 0 && (
        <section>
          <div className="flex items-center gap-2 mb-3">
            <HelpCircle size={16} className="text-[#94A3B8]" />
            <h3 className="text-sm font-semibold text-[#F8FAFC]">
              Questions to Resolve
            </h3>
          </div>

          <div className="space-y-1.5">
            {openQuestions.map((question, i) => (
              <div
                key={i}
                className="flex items-start gap-2.5 rounded-lg border border-[#1F2937] bg-[#111827] px-4 py-2.5"
              >
                <span className="text-[#38BDF8] shrink-0 mt-0.5 text-xs font-mono">
                  ?
                </span>
                <p className="text-sm text-[#F8FAFC]">{question}</p>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* ─── Agent Agreement ──────────────────────────────────────────────── */}
      {agreements.length > 0 && (
        <section>
          <div className="flex items-center gap-2 mb-3">
            <CheckCircle2 size={16} className="text-[#94A3B8]" />
            <h3 className="text-sm font-semibold text-[#F8FAFC]">
              Review Confidence
            </h3>
            <span className="ml-auto text-xs font-mono text-[#64748B]">
              {agreeCount}/{totalPoints} points
            </span>
          </div>

          <div className="space-y-1.5">
            {cappedAgreements.map((agreement, i) => (
              <div
                key={i}
                className="rounded-lg border border-[#1F2937] bg-[#111827] px-4 py-2.5"
              >
                <p className="text-sm text-[#F8FAFC]">{agreement.point}</p>
                <p className="mt-1 text-xs text-[#64748B]">
                  Supported by{" "}
                  {agreement.supportingAgents
                    .map((a) => agentLabels[a])
                    .join(", ")}
                </p>
              </div>
            ))}
          </div>

          {agreements.length > 3 && (
            <button
              onClick={() => setShowAllAgreements(!showAllAgreements)}
              className="mt-2 flex items-center gap-1 text-xs text-[#7C3AED] hover:text-[#8B5CF6] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#7C3AED]/50 rounded px-1 py-1"
              aria-expanded={showAllAgreements}
            >
              {showAllAgreements ? (
                <ChevronUp size={12} />
              ) : (
                <ChevronDown size={12} />
              )}
              {showAllAgreements
                ? "Show less"
                : `Show all ${agreements.length} agreements`}
            </button>
          )}
        </section>
      )}

      {/* ─── Export ───────────────────────────────────────────────────────── */}
      {onExport && (
        <div className="pt-3 border-t border-[#1F2937]">
          <button
            onClick={onExport}
            className="flex items-center gap-2 px-4 py-2.5 rounded-lg bg-[#7C3AED] hover:bg-[#8B5CF6] text-sm font-medium text-white transition-colors w-full justify-center focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#7C3AED]/50 focus-visible:ring-offset-2 focus-visible:ring-offset-[#0D1117]"
          >
            <Download size={16} />
            <span>Export Report</span>
          </button>
        </div>
      )}
    </div>
  );
}
