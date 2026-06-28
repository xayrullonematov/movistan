"use client";

import {
  AlertTriangle,
  CheckCircle2,
  XCircle,
  ShieldAlert,
} from "lucide-react";
import type { SessionState, SessionConfig, Severity } from "@/types/domain";
import { deriveVerdict, formatConfidence } from "./ResultsDashboard";

interface ReviewSummaryCardProps {
  session: SessionState;
  config?: SessionConfig;
}

function ScoreRing({ score, size = 56 }: { score: number; size?: number }) {
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
        <circle cx={size / 2} cy={size / 2} r={radius} fill="none" stroke="var(--border)" strokeWidth="4" />
        <circle cx={size / 2} cy={size / 2} r={radius} fill="none" stroke={getColor(score)} strokeWidth="4" strokeDasharray={`${circumference}`} strokeDashoffset={offset} strokeLinecap="round" className="transition-all duration-700" />
      </svg>
      <div className="absolute inset-0 flex items-center justify-center">
        <span className={`text-sm font-bold font-mono ${getTextColor(score)}`}>{score}</span>
      </div>
    </div>
  );
}

export default function ReviewSummaryCard({ session, config }: ReviewSummaryCardProps) {
  const consensus = session.consensus;
  if (!consensus) return null;

  const score = formatConfidence(consensus.overallConfidence || 0);
  const risks = consensus.identifiedRisks || [];
  const decisions = consensus.recommendedDecisions || [];
  const verdict = deriveVerdict(score, risks);
  const VerdictIcon = verdict.icon;

  const highRisks = risks.filter((r) => r.severity === "high");
  const mediumRisks = risks.filter((r) => r.severity === "medium");
  const lowRisks = risks.filter((r) => r.severity === "low");

  const totalFindings = risks.length + decisions.length;

  return (
    <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-5">
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <VerdictIcon size={18} className={verdict.color} />
            <span className={`text-sm font-semibold ${verdict.color}`}>{verdict.label}</span>
          </div>
          <h2 className="text-lg font-bold text-[var(--text-primary)]">Review Complete</h2>
          {config?.githubRepo && (
            <p className="mt-1 text-xs text-[var(--text-muted)] font-mono">
              {config.githubRepo.owner}/{config.githubRepo.repo}
              {config.githubRepo.branch ? ` (${config.githubRepo.branch})` : ""}
            </p>
          )}
        </div>
        <ScoreRing score={score} />
      </div>

      {/* Severity breakdown */}
      <div className="mt-4 flex flex-wrap items-center gap-4 pt-3 border-t border-[var(--border)]">
        <div className="text-center">
          <p className="text-xs text-[var(--text-muted)]">Findings</p>
          <p className="text-sm font-semibold text-[var(--text-primary)]">{totalFindings}</p>
        </div>
        {highRisks.length > 0 && (
          <>
            <div className="h-6 w-px bg-[var(--border)] hidden sm:block" />
            <div className="text-center">
              <p className="text-xs text-[var(--text-muted)]">Critical</p>
              <p className="text-sm font-semibold text-red-400">{highRisks.length}</p>
            </div>
          </>
        )}
        {mediumRisks.length > 0 && (
          <>
            <div className="h-6 w-px bg-[var(--border)] hidden sm:block" />
            <div className="text-center">
              <p className="text-xs text-[var(--text-muted)]">Medium</p>
              <p className="text-sm font-semibold text-amber-400">{mediumRisks.length}</p>
            </div>
          </>
        )}
        {lowRisks.length > 0 && (
          <>
            <div className="h-6 w-px bg-[var(--border)] hidden sm:block" />
            <div className="text-center">
              <p className="text-xs text-[var(--text-muted)]">Low</p>
              <p className="text-sm font-semibold text-green-400">{lowRisks.length}</p>
            </div>
          </>
        )}
        <div className="h-6 w-px bg-[var(--border)] hidden sm:block" />
        <div className="text-center">
          <p className="text-xs text-[var(--text-muted)]">Fixes</p>
          <p className="text-sm font-semibold text-[var(--text-primary)]">{decisions.length}</p>
        </div>
      </div>
    </div>
  );
}
