"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import useSWR from "swr";
import {
  AlertTriangle,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  FileText,
  HelpCircle,
  MessageSquareText,
  Pause,
  Play,
  SkipBack,
  SkipForward,
  Target,
} from "lucide-react";
import type {
  AgentType,
  ArtifactType,
  PersistedEvent,
  RoundStage,
  SessionState,
} from "@/types/domain";

interface ReplayResponse {
  events: PersistedEvent[];
  totalSteps: number;
  currentState?: SessionState;
}

interface ReplayScrubberProps {
  sessionId: string;
}

type ParsedEventContent = Record<string, unknown>;
type MilestoneTone = "neutral" | "stage" | "decision" | "risk" | "warning" | "success";

interface ReplayMilestone {
  id: string;
  eventIndex: number;
  round: number | null;
  timestamp: string;
  title: string;
  description: string;
  source: string;
  tone: MilestoneTone;
  event: PersistedEvent;
}

const fetcher = (url: string) => fetch(url).then((r) => r.json());

const eventLabel: Record<string, string> = {
  "session-created": "Session created",
  "round-started": "Round started",
  "round-completed": "Round completed",
  proposal: "Proposal",
  critique: "Critique",
  revision: "Revision",
  consensus: "Agent agreement",
  "consensus-update": "Agreement update",
  "user-intervention": "User intervention",
  "clarification-request": "Clarification request",
  "artifact-created": "Finding created",
  "artifact-updated": "Finding updated",
  "artifact-status-changed": "Finding status changed",
  "stage-progress": "Stage progress",
};

const stageLabels: Record<RoundStage, string> = {
  proposal: "Proposal",
  critique: "Critique",
  revision: "Revision",
  consensus: "Agreement",
  "awaiting-intervention": "Awaiting input",
};

const stageDescriptions: Partial<Record<RoundStage, string>> = {
  proposal: "Agents drafted initial approaches and surfaced early tradeoffs.",
  critique: "Agents challenged opposing proposals and called out likely failure modes.",
  revision: "Agents revised their positions after seeing the strongest objections.",
};

const artifactTypeLabels: Record<ArtifactType, string> = {
  decision: "Decision",
  risk: "Risk",
  assumption: "Assumption",
  tradeoff: "Tradeoff",
  "open-question": "Open question",
  recommendation: "Fix",
};

const agentLabels: Record<AgentType, string> = {
  "senior-engineer": "Senior Engineer",
  "security-engineer": "Security Engineer",
  "performance-engineer": "Performance Engineer",
  "product-engineer": "Product Engineer",
};

function parseEventContent(event: PersistedEvent): ParsedEventContent | null {
  try {
    const parsed = JSON.parse(event.content);
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      return parsed as ParsedEventContent;
    }
  } catch {
    return null;
  }
  return null;
}

function getString(content: ParsedEventContent | null | undefined, key: string): string | undefined {
  const value = content?.[key];
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function getNumber(content: ParsedEventContent | null | undefined, key: string): number | undefined {
  const value = content?.[key];
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function getStringArray(content: ParsedEventContent | null | undefined, key: string): string[] {
  const value = content?.[key];
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === "string" && item.trim().length > 0);
}

function getRound(event: PersistedEvent, content: ParsedEventContent | null, activeRound: number): number | null {
  const contentRound = getNumber(content, "round");
  const round = event.round > 0 ? event.round : contentRound ?? activeRound;
  return round > 0 ? round : null;
}

function truncate(text: string, maxLength = 150): string {
  const trimmed = text.trim();
  if (trimmed.length <= maxLength) return trimmed;
  return `${trimmed.slice(0, maxLength - 3).trimEnd()}...`;
}

function formatPercent(value: number | undefined): string | null {
  if (value === undefined) return null;
  const normalized = value <= 1 ? value * 100 : value;
  return `${Math.round(normalized)}%`;
}

function getConsensusDecision(content: ParsedEventContent | null): { title?: string; confidence?: number } {
  const recommendations = content?.recommendedDecisions;
  if (!Array.isArray(recommendations)) return {};
  const first = recommendations.find(
    (item): item is ParsedEventContent => Boolean(item) && typeof item === "object" && !Array.isArray(item),
  );
  return {
    title: getString(first, "title"),
    confidence: getNumber(first, "confidence"),
  };
}

function sourceLabel(event: PersistedEvent): string {
  if (event.agentId) {
    return agentLabels[event.agentId];
  }
  return eventLabel[event.type] ?? event.type;
}

export function buildReplayMilestones(events: PersistedEvent[]): ReplayMilestone[] {
  const milestones: ReplayMilestone[] = [];
  const seenStageMilestones = new Set<string>();
  const artifactsById = new Map<string, { title?: string; type?: ArtifactType }>();
  let activeRound = 0;

  const addMilestone = (
    event: PersistedEvent,
    eventIndex: number,
    content: ParsedEventContent | null,
    milestone: Omit<ReplayMilestone, "id" | "eventIndex" | "round" | "timestamp" | "event">,
  ) => {
    milestones.push({
      id: `${event.id}-${milestones.length}`,
      eventIndex,
      round: getRound(event, content, activeRound),
      timestamp: event.timestamp,
      event,
      ...milestone,
    });
  };

  events.forEach((event, eventIndex) => {
    const content = parseEventContent(event);
    if (event.round > 0) activeRound = event.round;
    const contentRound = getNumber(content, "round");
    if (contentRound && contentRound > 0) activeRound = contentRound;

    switch (event.type) {
      case "session-created": {
        const problem = getString(content, "problemDescription");
        addMilestone(event, eventIndex, content, {
          title: "Review started",
          description: problem ? truncate(problem, 140) : "The review workspace was opened.",
          source: "Session",
          tone: "neutral",
        });
        break;
      }
      case "round-started": {
        const round = getRound(event, content, activeRound);
        addMilestone(event, eventIndex, content, {
          title: round ? `Round ${round} started` : "Round started",
          description: "Agents began another pass through proposals, critiques, revisions, and agreement.",
          source: "Round lifecycle",
          tone: "stage",
        });
        break;
      }
      case "proposal":
      case "critique":
      case "revision": {
        const stage = event.stage ?? event.type;
        const key = `${event.round || activeRound}-${stage}`;
        if (!seenStageMilestones.has(key)) {
          seenStageMilestones.add(key);
          addMilestone(event, eventIndex, content, {
            title: `${stageLabels[stage]} stage completed`,
            description: stageDescriptions[stage] ?? "Agents completed this review stage.",
            source: "Agent review",
            tone: "stage",
          });
        }
        break;
      }
      case "consensus-update": {
        const decision = getConsensusDecision(content);
        const confidence = formatPercent(decision.confidence ?? getNumber(content, "overallConfidence"));
        addMilestone(event, eventIndex, content, {
          title: decision.title ? `Agreement: ${truncate(decision.title, 72)}` : "Agreement synthesized",
          description: confidence
            ? `The agents reached agreement with ${confidence} confidence.`
            : "The agents synthesized their agreement on findings, risks, and open questions.",
          source: "Agent agreement",
          tone: "decision",
        });
        break;
      }
      case "artifact-created": {
        const artifactId = getString(content, "artifactId");
        const type = getString(content, "type") as ArtifactType | undefined;
        const title = getString(content, "title");
        if (artifactId) artifactsById.set(artifactId, { title, type });

        const typeLabel = type && artifactTypeLabels[type] ? artifactTypeLabels[type] : "Finding";
        addMilestone(event, eventIndex, content, {
          title: `${typeLabel} added`,
          description: title ? truncate(title, 130) : "A new finding was added to the review.",
          source: sourceLabel(event),
          tone: type === "risk" ? "risk" : "decision",
        });
        break;
      }
      case "artifact-updated": {
        const artifactId = getString(content, "artifactId");
        const known = artifactId ? artifactsById.get(artifactId) : undefined;
        const version = getNumber(content, "version");
        addMilestone(event, eventIndex, content, {
          title: known?.type === "risk" ? "Risk refined" : "Finding refined",
          description: known?.title
            ? `${truncate(known.title, 112)}${version ? ` moved to version ${version}.` : " was updated."}`
            : version
              ? `A finding moved to version ${version}.`
              : "A finding was updated.",
          source: sourceLabel(event),
          tone: known?.type === "risk" ? "risk" : "decision",
        });
        break;
      }
      case "artifact-status-changed": {
        const artifactId = getString(content, "artifactId");
        const known = artifactId ? artifactsById.get(artifactId) : undefined;
        const status = getString(content, "newStatus");
        addMilestone(event, eventIndex, content, {
          title: status === "accepted" ? "Finding accepted" : status === "rejected" ? "Finding rejected" : "Finding status changed",
          description: known?.title
            ? `${truncate(known.title, 120)} is now ${status ?? "updated"}.`
            : `A finding is now ${status ?? "updated"}.`,
          source: sourceLabel(event),
          tone: status === "rejected" ? "warning" : "success",
        });
        break;
      }
      case "clarification-request": {
        const questions = getStringArray(content, "questions");
        addMilestone(event, eventIndex, content, {
          title: "Clarification requested",
          description: questions.length > 0
            ? truncate(questions[0], 140)
            : "Agents paused the review to ask for more context.",
          source: "Agent review",
          tone: "warning",
        });
        break;
      }
      case "user-intervention": {
        const text = getString(content, "text") ?? getString(content, "constraint");
        addMilestone(event, eventIndex, content, {
          title: "Context added",
          description: text ? truncate(text, 140) : "New constraints or clarification were added to the review.",
          source: "User input",
          tone: "neutral",
        });
        break;
      }
      case "round-completed": {
        const round = getRound(event, content, activeRound);
        addMilestone(event, eventIndex, content, {
          title: round ? `Round ${round} completed` : "Round completed",
          description: "The review report, risks, and open questions were ready for review.",
          source: "Round lifecycle",
          tone: "success",
        });
        break;
      }
      default:
        break;
    }
  });

  return milestones;
}

function formatTimestamp(ts: string): string {
  try {
    return new Date(ts).toLocaleTimeString();
  } catch {
    return ts;
  }
}

function formatDateTime(ts: string): string {
  try {
    return new Date(ts).toLocaleString();
  } catch {
    return ts;
  }
}

export default function ReplayScrubber({ sessionId }: ReplayScrubberProps) {
  const [step, setStep] = useState(0);
  const [playing, setPlaying] = useState(false);

  const { data, isLoading, error } = useSWR<ReplayResponse>(
    `/api/sessions/${sessionId}/replay?step=${step}`,
    fetcher,
    { revalidateOnFocus: false, keepPreviousData: true },
  );

  const totalSteps = data?.totalSteps ?? 0;
  const events = useMemo(() => data?.events ?? [], [data]);
  const state = data?.currentState;
  const effectiveStep = Math.min(step, totalSteps);
  const currentEvent = effectiveStep > 0 ? events[effectiveStep - 1] : null;
  const milestones = useMemo(() => buildReplayMilestones(events), [events]);
  const activeMilestone = useMemo(() => {
    let active: ReplayMilestone | null = null;
    for (const milestone of milestones) {
      if (milestone.eventIndex < effectiveStep) {
        active = milestone;
      }
    }
    return active;
  }, [effectiveStep, milestones]);
  const previewMilestone = activeMilestone ?? milestones[0] ?? null;
  const progressPercent = totalSteps > 0 ? Math.round((effectiveStep / totalSteps) * 100) : 0;

  useEffect(() => {
    if (!playing || totalSteps === 0) return;
    const id = window.setInterval(() => {
      setStep((s) => {
        const next = s + 1;
        if (next >= totalSteps) {
          setPlaying(false);
          return totalSteps;
        }
        return next;
      });
    }, 600);
    return () => window.clearInterval(id);
  }, [playing, totalSteps]);

  if (error) {
    return (
      <div className="rounded-md border border-red-500/40 bg-red-500/10 px-3 py-2 text-xs text-red-200">
        Couldn&apos;t load replay data.
      </div>
    );
  }

  if (isLoading && !data) {
    return <div className="text-xs text-gray-400">Loading replay...</div>;
  }

  return (
    <div className="space-y-5">
      <div className="rounded-lg border border-[#34362f] bg-[#151712]/85 p-4">
        <div className="mb-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-sm font-medium text-gray-100">Review history</p>
            <p className="text-xs text-gray-500">
              {progressPercent}% reviewed - {milestones.length} milestone{milestones.length === 1 ? "" : "s"}
            </p>
          </div>
          {currentEvent && (
            <span className="text-xs text-gray-500">
              {eventLabel[currentEvent.type] ?? currentEvent.type} - {formatTimestamp(currentEvent.timestamp)}
            </span>
          )}
        </div>

        <div className="flex items-center gap-3 text-xs text-gray-500">
          <span className="w-10 shrink-0 font-mono text-gray-300">{effectiveStep}</span>
          <input
            type="range"
            min={0}
            max={totalSteps}
            step={1}
            value={effectiveStep}
            onChange={(e) => {
              setPlaying(false);
              setStep(Number(e.target.value));
            }}
            className="w-full accent-emerald-500"
            aria-label="Replay scrubber"
          />
          <span className="w-10 shrink-0 text-right font-mono text-gray-300">{totalSteps}</span>
        </div>

        <div className="mt-3 flex items-center justify-center gap-2">
          <IconButton
            onClick={() => {
              setPlaying(false);
              setStep(0);
            }}
            disabled={effectiveStep === 0}
            label="Start"
          >
            <SkipBack size={14} />
          </IconButton>
          <IconButton
            onClick={() => {
              setPlaying(false);
              setStep((s) => Math.max(0, Math.min(s, totalSteps) - 1));
            }}
            disabled={effectiveStep === 0}
            label="Previous step"
          >
            <ChevronLeft size={14} />
          </IconButton>
          <button
            type="button"
            onClick={() => setPlaying((v) => !v)}
            disabled={totalSteps === 0 || effectiveStep >= totalSteps}
            className="inline-flex min-w-20 items-center justify-center gap-1.5 rounded-md bg-emerald-600 px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-emerald-500 disabled:opacity-40"
          >
            {playing ? <Pause size={12} /> : <Play size={12} />}
            {playing ? "Pause" : "Play"}
          </button>
          <IconButton
            onClick={() => {
              setPlaying(false);
              setStep((s) => Math.min(totalSteps, s + 1));
            }}
            disabled={effectiveStep >= totalSteps}
            label="Next step"
          >
            <ChevronRight size={14} />
          </IconButton>
          <IconButton
            onClick={() => {
              setPlaying(false);
              setStep(totalSteps);
            }}
            disabled={effectiveStep >= totalSteps}
            label="End"
          >
            <SkipForward size={14} />
          </IconButton>
        </div>
      </div>

      {state && (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <Stat label="Round" value={state.currentRound} />
          <Stat label="Stage" value={state.currentStage ? stageLabels[state.currentStage] : "-"} />
          <Stat label="Report items" value={state.artifacts.length} />
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1fr)_18rem]">
        <section className="rounded-lg border border-[#34362f] bg-[#151712]/70 p-4">
          <div className="mb-4 flex items-center justify-between gap-3">
            <div>
              <h2 className="text-sm font-semibold text-gray-100">Milestones</h2>
              <p className="text-xs text-gray-500">A readable summary of how the review report came together.</p>
            </div>
          </div>

          {milestones.length === 0 ? (
            <div className="rounded-md border border-dashed border-gray-700 px-3 py-6 text-center text-sm text-gray-500">
              No replay milestones are available yet.
            </div>
          ) : (
            <ol className="relative space-y-2 before:absolute before:left-4 before:top-2 before:h-[calc(100%-1rem)] before:w-px before:bg-[#34362f]">
              {milestones.map((milestone) => {
                const isComplete = milestone.eventIndex < effectiveStep;
                const isActive = activeMilestone?.id === milestone.id;
                return (
                  <li key={milestone.id} className="relative pl-10">
                    <MilestoneMarker tone={milestone.tone} active={isActive} complete={isComplete} />
                    <button
                      type="button"
                      onClick={() => {
                        setPlaying(false);
                        setStep(milestone.eventIndex + 1);
                      }}
                      className={`block w-full rounded-md border px-3 py-2 text-left transition-colors ${
                        isActive
                          ? "border-emerald-500/50 bg-emerald-500/10"
                          : "border-[#34362f] bg-[#11130f]/80 hover:border-emerald-500/35 hover:bg-[#191c15]"
                      }`}
                    >
                      <div className="flex flex-col gap-1 sm:flex-row sm:items-start sm:justify-between">
                        <div className="min-w-0">
                          <p className="text-sm font-medium text-gray-100">{milestone.title}</p>
                          <p className="mt-0.5 line-clamp-2 text-xs leading-relaxed text-gray-400">
                            {milestone.description}
                          </p>
                        </div>
                        <span className="shrink-0 text-xs text-gray-500">
                          {formatTimestamp(milestone.timestamp)}
                        </span>
                      </div>
                    </button>
                  </li>
                );
              })}
            </ol>
          )}
        </section>

        <aside className="rounded-lg border border-[#34362f] bg-[#151712]/70 p-4">
          <p className="text-xs uppercase tracking-wider text-gray-500">
            {activeMilestone ? "Current milestone" : "Next milestone"}
          </p>
          {previewMilestone ? (
            <div className="mt-3 space-y-4">
              <div>
                <div className="mb-2 inline-flex h-9 w-9 items-center justify-center rounded-md border border-emerald-500/30 bg-emerald-500/10 text-emerald-200">
                  <MilestoneSymbol tone={previewMilestone.tone} size={18} />
                </div>
                <h3 className="text-base font-semibold text-gray-100">{previewMilestone.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-gray-400">{previewMilestone.description}</p>
              </div>
              <div className="space-y-2 border-t border-[#34362f] pt-3 text-xs text-gray-500">
                <MetadataRow label="Round" value={previewMilestone.round ? `Round ${previewMilestone.round}` : "Session"} />
                <MetadataRow label="Source" value={previewMilestone.source} />
                <MetadataRow label="Time" value={formatDateTime(previewMilestone.timestamp)} />
              </div>
            </div>
          ) : (
            <p className="mt-3 text-sm text-gray-500">Start the review to populate the timeline.</p>
          )}
        </aside>
      </div>

      {currentEvent && (
        <details className="group rounded-lg border border-gray-800 bg-gray-950/40">
          <summary className="flex cursor-pointer items-center justify-between gap-3 rounded-lg px-3 py-2 text-sm text-gray-200 transition-colors hover:bg-gray-900/60">
            <span className="font-medium">Developer details</span>
            <span className="text-xs text-gray-500 group-open:hidden">Show raw event</span>
            <span className="hidden text-xs text-gray-500 group-open:inline">Hide raw event</span>
          </summary>
          <div className="border-t border-gray-800 p-3">
            <p className="text-xs uppercase tracking-wider text-gray-500">Current event</p>
            <pre className="mt-1 max-h-64 overflow-auto text-xs leading-relaxed text-gray-300">
{tryFormat(currentEvent.content)}
            </pre>
          </div>
        </details>
      )}
    </div>
  );
}

function tryFormat(content: string): string {
  try {
    return JSON.stringify(JSON.parse(content), null, 2);
  } catch {
    return content;
  }
}

function IconButton({
  label,
  disabled,
  onClick,
  children,
}: {
  label: string;
  disabled: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="rounded-md border border-gray-700 p-1.5 text-gray-300 transition-colors hover:bg-gray-800 disabled:opacity-40"
      aria-label={label}
    >
      {children}
    </button>
  );
}

function Stat({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="rounded-md border border-gray-800 bg-gray-950/40 px-3 py-2">
      <p className="text-xs uppercase tracking-wider text-gray-500">{label}</p>
      <p className="text-sm font-medium text-gray-100">{String(value)}</p>
    </div>
  );
}

function MetadataRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start justify-between gap-3">
      <span>{label}</span>
      <span className="text-right text-gray-300">{value}</span>
    </div>
  );
}

function MilestoneMarker({
  tone,
  active,
  complete,
}: {
  tone: MilestoneTone;
  active: boolean;
  complete: boolean;
}) {
  return (
    <span
      className={`absolute left-0 top-2 z-10 inline-flex h-8 w-8 items-center justify-center rounded-full border ${toneClasses[tone]} ${
        active ? "ring-2 ring-emerald-400/30" : ""
      }`}
    >
      {complete ? <CheckCircle2 size={15} /> : <MilestoneSymbol tone={tone} size={15} />}
    </span>
  );
}

function MilestoneSymbol({ tone, size }: { tone: MilestoneTone; size: number }) {
  switch (tone) {
    case "decision":
    case "success":
      return <Target size={size} />;
    case "risk":
      return <AlertTriangle size={size} />;
    case "warning":
      return <HelpCircle size={size} />;
    case "stage":
      return <MessageSquareText size={size} />;
    default:
      return <FileText size={size} />;
  }
}

const toneClasses: Record<MilestoneTone, string> = {
  neutral: "border-gray-700 bg-gray-900 text-gray-300",
  stage: "border-teal-500/45 bg-teal-500/10 text-teal-200",
  decision: "border-emerald-500/50 bg-emerald-500/10 text-emerald-200",
  risk: "border-red-500/50 bg-red-500/10 text-red-200",
  warning: "border-amber-500/50 bg-amber-500/10 text-amber-200",
  success: "border-emerald-500/50 bg-emerald-500/10 text-emerald-200",
};
