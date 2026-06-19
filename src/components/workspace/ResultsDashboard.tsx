"use client";

import { Download } from "lucide-react";
import type { SessionState, AgentType, Severity } from "@/types/domain";

interface ResultsDashboardProps {
  session: SessionState;
  onExport?: () => void;
}

const severityColors: Record<Severity, string> = {
  high: "bg-red-500/15 text-red-400 border-red-600/50",
  medium: "bg-amber-500/15 text-amber-400 border-amber-600/50",
  low: "bg-green-500/15 text-green-400 border-green-600/50",
};

const agentDotColors: Record<AgentType, string> = {
  "senior-engineer": "bg-blue-500",
  "security-engineer": "bg-red-500",
  "performance-engineer": "bg-amber-500",
  "product-engineer": "bg-violet-500",
};

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
    <div className="bg-gray-800/50 rounded-xl border border-gray-700 p-4">
      <h3 className="text-sm font-medium text-gray-300 mb-3">
        Consensus Level
      </h3>
      <div className="flex items-center gap-4">
        <div className="relative w-20 h-20">
          {/* Circular gauge */}
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
  );
}

export default function ResultsDashboard({
  session,
  onExport,
}: ResultsDashboardProps) {
  const consensus = session.consensus;

  if (!consensus) {
    return (
      <div className="flex items-center justify-center h-full p-8">
        <div className="text-center max-w-sm">
          <div className="w-12 h-12 rounded-full bg-gray-800 border border-gray-700 flex items-center justify-center mx-auto mb-4">
            <svg
              className="w-6 h-6 text-gray-500"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={1.5}
                d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
              />
            </svg>
          </div>
          <p className="text-gray-400 text-sm">
            No results yet.
          </p>
          <p className="text-gray-500 text-xs mt-1">
            Results will appear after the first round reaches consensus.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full overflow-y-auto px-4 py-4 space-y-5">
      {/* Consensus Meter */}
      <ConsensusMeter
        agreements={consensus.agreements?.length || 0}
        disagreements={consensus.disagreements?.length || 0}
      />

      {/* Key Decisions */}
      {consensus.recommendedDecisions && consensus.recommendedDecisions.length > 0 && (
        <div>
          <h3 className="text-sm font-medium text-gray-300 mb-3">
            Key Decisions
          </h3>
          <div className="space-y-2">
            {consensus.recommendedDecisions.map((decision, i) => (
              <div
                key={i}
                className="rounded-lg bg-green-500/5 border border-green-600/30 p-3"
              >
                <div className="flex items-start justify-between gap-2">
                  <h4 className="text-sm font-medium text-green-300">
                    {decision.title}
                  </h4>
                  <span className="text-[10px] text-green-400 font-mono shrink-0">
                    {Math.round(decision.confidence * 100)}%
                  </span>
                </div>
                <p className="text-xs text-gray-400 mt-1 leading-relaxed">
                  {decision.description}
                </p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Risk Register */}
      {consensus.identifiedRisks && consensus.identifiedRisks.length > 0 && (
        <div>
          <h3 className="text-sm font-medium text-gray-300 mb-3">
            Risk Register
          </h3>
          <div className="rounded-lg border border-gray-700 overflow-hidden">
            <table className="w-full text-xs">
              <thead>
                <tr className="bg-gray-800/50">
                  <th className="text-left px-3 py-2 text-gray-400 font-medium">
                    Risk
                  </th>
                  <th className="text-left px-3 py-2 text-gray-400 font-medium w-20">
                    Severity
                  </th>
                  <th className="text-left px-3 py-2 text-gray-400 font-medium w-24">
                    Raised By
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-700/50">
                {consensus.identifiedRisks.map((risk, i) => (
                  <tr key={i} className="hover:bg-gray-800/30">
                    <td className="px-3 py-2 text-gray-300">
                      {risk.description}
                    </td>
                    <td className="px-3 py-2">
                      <span
                        className={`px-1.5 py-0.5 rounded text-[10px] font-medium border ${severityColors[risk.severity]}`}
                      >
                        {risk.severity}
                      </span>
                    </td>
                    <td className="px-3 py-2">
                      <div className="flex gap-1">
                        {risk.raisedBy.map((agentId) => (
                          <div
                            key={agentId}
                            className={`w-2.5 h-2.5 rounded-full ${agentDotColors[agentId]}`}
                            title={agentId}
                          />
                        ))}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
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
                className="flex items-start gap-2 text-xs text-gray-400 bg-gray-800/40 rounded-lg px-3 py-2 border border-gray-700/50"
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
        <div className="pt-3 border-t border-gray-700">
          <button
            onClick={onExport}
            className="flex items-center gap-2 px-4 py-2.5 rounded-lg bg-gray-800 border border-gray-700 text-sm text-gray-300 hover:bg-gray-700 hover:text-white transition-colors w-full justify-center"
          >
            <Download size={16} />
            <span>Export Results as Markdown</span>
          </button>
        </div>
      )}
    </div>
  );
}
