"use client";

import { useState } from "react";
import AgentAvatar from "./AgentAvatar";
import type {
  AgentType,
  ProposalOutput,
  CritiqueOutput,
  RevisionOutput,
  ConsensusOutput,
  ObjectionSeverity,
} from "@/types/domain";
import StanceBadge from "@/components/ui/StanceBadge";

interface DebateMessageProps {
  type: "proposal" | "critique" | "revision" | "consensus";
  agent: AgentType;
  content: string;
  timestamp: string;
  targetAgent?: AgentType;
}

const borderColors: Record<string, string> = {
  proposal: "border-l-blue-500",
  critique: "border-l-red-500",
  revision: "border-l-green-500",
  consensus: "border-l-amber-500",
};

const headerLabels: Record<string, string> = {
  proposal: "Proposal",
  critique: "Critique",
  revision: "Revision",
  consensus: "Consensus",
};

const headerTextColors: Record<string, string> = {
  proposal: "text-blue-400",
  critique: "text-red-400",
  revision: "text-green-400",
  consensus: "text-amber-400",
};

const agentDisplayNames: Record<AgentType, string> = {
  "senior-engineer": "Senior Engineer",
  "security-engineer": "Security Engineer",
  "performance-engineer": "Performance Engineer",
  "product-engineer": "Product Engineer",
};

function severityBadge(severity: ObjectionSeverity) {
  const colors: Record<ObjectionSeverity, string> = {
    critical: "bg-red-500/15 text-red-400 border-red-600/50",
    major: "bg-orange-500/15 text-orange-400 border-orange-600/50",
    minor: "bg-yellow-500/15 text-yellow-400 border-yellow-600/50",
  };
  return (
    <span
      className={`px-1.5 py-0.5 text-[10px] font-medium rounded border ${colors[severity]}`}
    >
      {severity}
    </span>
  );
}

function parseContent(content: string): unknown | null {
  try {
    return JSON.parse(content);
  } catch {
    return null;
  }
}

function ProposalContent({ data }: { data: ProposalOutput }) {
  return (
    <div className="space-y-2">
      <p className="text-sm text-gray-300">{data.summary}</p>
      {data.recommendations && data.recommendations.length > 0 && (
        <ul className="space-y-1 pl-3">
          {data.recommendations.map((rec, i) => (
            <li key={i} className="text-xs text-gray-400 flex gap-2">
              <span className="text-blue-400 shrink-0">&#8226;</span>
              <span>{rec}</span>
            </li>
          ))}
        </ul>
      )}
      {data.risks && data.risks.length > 0 && (
        <div className="mt-2">
          <span className="text-[10px] uppercase font-medium text-gray-500">
            Risks
          </span>
          <ul className="mt-1 space-y-1">
            {data.risks.map((risk, i) => (
              <li
                key={i}
                className="text-xs text-gray-400 flex items-start gap-2"
              >
                <span className="text-red-400 shrink-0">!</span>
                <span>{risk.description}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

function CritiqueContent({
  data,
  targetAgent,
}: {
  data: CritiqueOutput;
  targetAgent?: AgentType;
}) {
  return (
    <div className="space-y-2">
      <p className="text-sm text-gray-300">{data.summary}</p>
      {data.objections && data.objections.length > 0 && (
        <div className="space-y-1.5">
          {data.objections.map((obj, i) => (
            <div
              key={i}
              className="flex items-start gap-2 text-xs text-gray-400 bg-gray-800/50 rounded px-2 py-1.5"
            >
              {severityBadge(obj.severity)}
              <span>{obj.point}</span>
            </div>
          ))}
        </div>
      )}
      {data.acknowledgedStrengths && data.acknowledgedStrengths.length > 0 && (
        <div className="mt-2">
          <span className="text-[10px] uppercase font-medium text-gray-500">
            Acknowledged Strengths
          </span>
          <ul className="mt-1 space-y-1">
            {data.acknowledgedStrengths.map((str, i) => (
              <li key={i} className="text-xs text-gray-400 flex gap-2">
                <span className="text-green-400 shrink-0">+</span>
                <span>{str}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

function RevisionContent({ data }: { data: RevisionOutput }) {
  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2 mb-1">
        <StanceBadge stance={data.stance} />
      </div>
      <p className="text-sm text-gray-300">{data.summary}</p>
      {data.concededPoints && data.concededPoints.length > 0 && (
        <div>
          <span className="text-[10px] uppercase font-medium text-gray-500">
            Conceded
          </span>
          <ul className="mt-1 space-y-1">
            {data.concededPoints.map((cp, i) => (
              <li key={i} className="text-xs text-gray-400 flex gap-2">
                <span className="text-amber-400 shrink-0">~</span>
                <span>{cp.point}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
      {data.maintainedPoints && data.maintainedPoints.length > 0 && (
        <div>
          <span className="text-[10px] uppercase font-medium text-gray-500">
            Maintained
          </span>
          <ul className="mt-1 space-y-1">
            {data.maintainedPoints.map((mp, i) => (
              <li key={i} className="text-xs text-gray-400 flex gap-2">
                <span className="text-blue-400 shrink-0">&#8594;</span>
                <span>{mp.point}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

function ConsensusContent({ data }: { data: ConsensusOutput }) {
  return (
    <div className="space-y-3">
      {data.agreements && data.agreements.length > 0 && (
        <div>
          <span className="text-[10px] uppercase font-medium text-green-400">
            Agreements ({data.agreements.length})
          </span>
          <ul className="mt-1 space-y-1">
            {data.agreements.map((a, i) => (
              <li key={i} className="text-xs text-gray-300 flex gap-2">
                <span className="text-green-400 shrink-0">&#10003;</span>
                <span>{a.point}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
      {data.disagreements && data.disagreements.length > 0 && (
        <div>
          <span className="text-[10px] uppercase font-medium text-red-400">
            Disagreements ({data.disagreements.length})
          </span>
          <ul className="mt-1 space-y-1">
            {data.disagreements.map((d, i) => (
              <li key={i} className="text-xs text-gray-300 flex gap-2">
                <span className="text-red-400 shrink-0">&#10007;</span>
                <span>{d.point}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
      {data.overallConfidence !== undefined && (
        <div className="flex items-center gap-2 pt-1 border-t border-gray-700">
          <span className="text-[10px] text-gray-500">Overall Confidence:</span>
          <span className="text-xs font-mono text-amber-400">
            {Math.round(data.overallConfidence * 100)}%
          </span>
        </div>
      )}
    </div>
  );
}

function FallbackContent({ content }: { content: string }) {
  return <p className="text-sm text-gray-300 whitespace-pre-wrap">{content}</p>;
}

export default function DebateMessage({
  type,
  agent,
  content,
  timestamp,
  targetAgent,
}: DebateMessageProps) {
  const [expanded, setExpanded] = useState(false);
  const parsed = parseContent(content);
  const formattedTime = new Date(timestamp).toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
  });

  const headerLabel =
    type === "critique" && targetAgent
      ? `Critique of ${agentDisplayNames[targetAgent]}`
      : headerLabels[type];

  // Derive one-line summary for collapsed view
  const summary = parsed && typeof parsed === "object" && "summary" in (parsed as Record<string, unknown>)
    ? (parsed as { summary?: string }).summary || content.slice(0, 100)
    : content.slice(0, 100);

  return (
    <div className="flex gap-3 group">
      {/* Left: Avatar */}
      <div className="shrink-0 pt-1">
        <AgentAvatar agent={agent} size="sm" />
      </div>

      {/* Right: Content card */}
      <div className="flex-1 min-w-0">
        {/* Clickable header for expand/collapse */}
        <div
          role="button"
          tabIndex={0}
          aria-expanded={expanded}
          aria-label={`${agentDisplayNames[agent]} ${headerLabel}. ${expanded ? "Click to collapse" : "Click to expand"}.`}
          className="cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/70 focus-visible:ring-offset-1 focus-visible:ring-offset-gray-950 rounded-lg"
          onClick={() => setExpanded(!expanded)}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              setExpanded(!expanded);
            }
          }}
        >
          {/* Agent name + timestamp */}
          <div className="flex items-center gap-2 mb-1">
            <span className="text-sm font-medium text-gray-200">
              {agentDisplayNames[agent]}
            </span>
            <span className={`text-[10px] uppercase font-semibold tracking-wider ${headerTextColors[type]}`}>
              {headerLabel}
            </span>
            <span className="text-[10px] text-gray-500">{formattedTime}</span>
            <svg
              className={`w-3.5 h-3.5 text-gray-500 ml-auto transition-transform ${expanded ? "rotate-180" : ""}`}
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              aria-hidden="true"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </div>

          {/* Collapsed: one-line summary */}
          {!expanded && (
            <p className="text-xs text-gray-400 line-clamp-1 leading-relaxed">
              {summary}
            </p>
          )}
        </div>

        {/* Expanded: full message card */}
        {expanded && (
          <div
            className={`
              border-l-2 rounded-lg bg-gray-800/60 p-3 mt-1
              ${borderColors[type]}
              ${type === "consensus" ? "bg-amber-500/5 border border-amber-500/20" : "border border-gray-700/50"}
            `}
          >
            {/* Structured content */}
            {type === "proposal" && parsed ? (
              <ProposalContent data={parsed as ProposalOutput} />
            ) : type === "critique" && parsed ? (
              <CritiqueContent
                data={parsed as CritiqueOutput}
                targetAgent={targetAgent}
              />
            ) : type === "revision" && parsed ? (
              <RevisionContent data={parsed as RevisionOutput} />
            ) : type === "consensus" && parsed ? (
              <ConsensusContent data={parsed as ConsensusOutput} />
            ) : (
              <FallbackContent content={content} />
            )}
          </div>
        )}
      </div>
    </div>
  );
}
