"use client";

import { useState, useEffect, useRef } from "react";
import {
  AlertTriangle,
  FileText,
  Copy,
  Check,
  ChevronDown,
} from "lucide-react";
import type { ArtifactState, ArtifactType, ArtifactStatus } from "@/types/domain";
import ArtifactDetail from "./ArtifactDetail";
import { toast } from "@/hooks/useToast";

interface FindingCardProps {
  artifact: ArtifactState;
  sessionId: string;
  onStatusChange?: () => void;
}

type SeverityLevel = "critical" | "high" | "medium" | "low";

const typeSeverityMap: Record<ArtifactType, SeverityLevel> = {
  risk: "high",
  decision: "medium",
  recommendation: "medium",
  tradeoff: "medium",
  assumption: "low",
  "open-question": "low",
};

function severityStyles(severity: SeverityLevel) {
  switch (severity) {
    case "critical":
      return { bg: "bg-red-500/10 border-red-500/30", text: "text-red-400", label: "Critical" };
    case "high":
      return { bg: "bg-orange-500/10 border-orange-500/30", text: "text-orange-400", label: "High" };
    case "medium":
      return { bg: "bg-amber-500/10 border-amber-500/30", text: "text-amber-400", label: "Medium" };
    case "low":
      return { bg: "bg-blue-500/10 border-blue-500/30", text: "text-blue-400", label: "Low" };
  }
}

const typeLabels: Record<ArtifactType, string> = {
  decision: "Finding",
  risk: "Risk",
  assumption: "Assumption",
  tradeoff: "Tradeoff",
  "open-question": "Question",
  recommendation: "Fix",
};

const statusTextColors: Record<ArtifactStatus, string> = {
  draft: "text-amber-400",
  accepted: "text-green-400",
  rejected: "text-red-400",
};

const statusLabels: Record<ArtifactStatus, string> = {
  draft: "Draft",
  accepted: "Accepted",
  rejected: "Rejected",
};

/** Known source file extensions that indicate a real file path. */
const KNOWN_EXTENSIONS = new Set([
  "ts", "tsx", "js", "jsx", "mjs", "cjs",
  "py", "rb", "go", "rs", "java", "kt", "swift",
  "vue", "svelte", "astro",
  "css", "scss", "less", "sass",
  "html", "htm", "xml", "svg",
  "json", "yaml", "yml", "toml", "env",
  "md", "mdx", "txt",
  "sh", "bash", "zsh",
  "sql", "graphql", "gql",
  "proto", "prisma",
  "dockerfile", "makefile",
  "c", "cpp", "h", "hpp",
]);

/**
 * Parse a file/location path from the artifact content.
 * Requires either a directory separator (/) in the path, or a recognized
 * source file extension. This avoids false positives on prose like
 * "next.js", "v2.0", "e.g.", etc.
 */
function parseLocation(content: string): string | null {
  // Match file paths like src/foo/bar.ts, ./foo.js, /path/to/file.ext
  const pathMatch = content.match(
    /(?:^|\s|`)((?:\.{0,2}\/)?(?:[\w@.-]+\/)*[\w@.-]+\.(\w{1,10}))(?:\s|`|$|,|:)/m
  );
  if (!pathMatch) return null;

  const fullPath = pathMatch[1];
  const extension = pathMatch[2].toLowerCase();

  // Must contain a directory separator OR have a known source extension
  const hasDirectorySeparator = fullPath.includes("/");
  const hasKnownExtension = KNOWN_EXTENSIONS.has(extension);

  if (hasDirectorySeparator || hasKnownExtension) {
    return fullPath;
  }

  return null;
}

/**
 * Extract "why it matters" - use the first meaningful sentence or paragraph
 * from the content.
 */
function parseWhyItMatters(content: string): string {
  // Take the first 1-2 sentences up to ~200 chars
  const cleaned = content.replace(/```[\s\S]*?```/g, "").trim();
  const sentences = cleaned.split(/(?<=[.!?])\s+/);
  let result = "";
  for (const sentence of sentences) {
    if (result.length + sentence.length > 200) break;
    result += (result ? " " : "") + sentence;
  }
  return result || cleaned.slice(0, 200);
}

/**
 * Extract a suggested fix from recommendation-type content, or derive
 * a brief actionable note from the content.
 */
function parseSuggestedFix(artifact: ArtifactState): string | null {
  if (artifact.type === "recommendation") {
    // For recommendations, the content IS the fix
    return artifact.content.slice(0, 200);
  }
  // Look for action-oriented patterns in content
  const fixMatch = artifact.content.match(
    /(?:fix|solution|resolve|recommend|should|consider|suggest)[:\s]+(.{10,150})/i
  );
  if (fixMatch) return fixMatch[1].trim();
  return null;
}

/**
 * Build a formatted task string for copying to a coding agent.
 */
function buildTaskString(artifact: ArtifactState, severity: SeverityLevel): string {
  const location = parseLocation(artifact.content);
  const fix = parseSuggestedFix(artifact);
  let task = `[${severity.toUpperCase()}] ${artifact.title}`;
  if (location) task += `\nLocation: ${location}`;
  task += `\nDescription: ${parseWhyItMatters(artifact.content)}`;
  if (fix) task += `\nSuggested fix: ${fix}`;
  return task;
}

export default function FindingCard({ artifact, sessionId, onStatusChange }: FindingCardProps) {
  const [expanded, setExpanded] = useState(false);
  const [copied, setCopied] = useState(false);
  const [showStatusDropdown, setShowStatusDropdown] = useState(false);
  const [isUpdating, setIsUpdating] = useState(false);
  const [optimisticStatus, setOptimisticStatus] = useState<ArtifactStatus | null>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Close dropdown on outside click
  useEffect(() => {
    if (!showStatusDropdown) return;
    function handleClickOutside(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setShowStatusDropdown(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [showStatusDropdown]);

  const severity = typeSeverityMap[artifact.type];
  const styles = severityStyles(severity);
  const location = parseLocation(artifact.content);
  const whyItMatters = parseWhyItMatters(artifact.content);
  const suggestedFix = parseSuggestedFix(artifact);
  const effectiveStatus: ArtifactStatus = optimisticStatus ?? artifact.status;

  const handleCopyTask = async (e: React.MouseEvent) => {
    e.stopPropagation();
    const taskStr = buildTaskString(artifact, severity);
    try {
      await navigator.clipboard.writeText(taskStr);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error({ message: "Copy failed", description: "Couldn't copy to clipboard." });
    }
  };

  const handleStatusChange = async (status: ArtifactStatus) => {
    const previous = optimisticStatus;
    setOptimisticStatus(status);
    setIsUpdating(true);
    setShowStatusDropdown(false);

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10_000);

    try {
      const res = await fetch(`/api/sessions/${sessionId}/artifacts/${artifact.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
        signal: controller.signal,
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(body.error ?? "Failed to update finding.");
      }
      onStatusChange?.();
      setOptimisticStatus(null);
    } catch (err) {
      setOptimisticStatus(previous);
      const message =
        err instanceof DOMException && err.name === "AbortError"
          ? "Request timed out."
          : err instanceof Error
            ? err.message
            : "Network error.";
      toast.error({
        message: "Couldn't update finding",
        description: message,
      });
    } finally {
      clearTimeout(timeoutId);
      setIsUpdating(false);
    }
  };

  return (
    <>
      <div
        className={`rounded-lg border ${styles.bg} p-4 sm:p-5 cursor-pointer transition-all duration-200 hover:shadow-lg hover:shadow-black/10`}
        onClick={() => setExpanded(true)}
      >
        {/* Header: severity badge + location + status */}
        <div className="flex flex-wrap items-center gap-2 mb-2">
          <span
            className={`inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-xs font-medium ${styles.text} border ${styles.bg}`}
          >
            <AlertTriangle size={12} />
            {styles.label}
          </span>
          <span className="rounded-md px-1.5 py-0.5 text-xs text-[var(--text-muted)] bg-[var(--surface-elevated)]/50">
            {typeLabels[artifact.type]}
          </span>
          {location && (
            <span className="font-mono text-xs text-[var(--text-muted)] truncate max-w-[200px] sm:max-w-none">
              <FileText size={10} className="inline mr-1 opacity-60" />
              {location}
            </span>
          )}
          <span className={`ml-auto text-xs font-medium ${statusTextColors[effectiveStatus]}`}>
            {statusLabels[effectiveStatus]}
          </span>
        </div>

        {/* Title */}
        <h3 className="text-sm font-semibold text-[var(--text-primary)] mb-2 leading-snug">
          {artifact.title}
        </h3>

        {/* Why it matters */}
        {whyItMatters && (
          <p className="text-sm text-[var(--text-secondary)] mb-2 leading-relaxed">
            <span className="font-medium text-[var(--text-muted)]">Why it matters:</span>{" "}
            {whyItMatters}
          </p>
        )}

        {/* Suggested fix */}
        {suggestedFix && (
          <p className="text-sm text-[var(--text-secondary)] mb-3 leading-relaxed">
            <span className="font-medium text-[var(--text-muted)]">Suggested fix:</span>{" "}
            {suggestedFix}
          </p>
        )}

        {/* Actions row */}
        <div className="flex items-center gap-2 pt-1" onClick={(e) => e.stopPropagation()}>
          <button
            onClick={handleCopyTask}
            className="inline-flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs text-[var(--text-secondary)] border border-[var(--border)] bg-[var(--surface)] hover:bg-[var(--surface-elevated)] transition-colors"
            title="Copy as task for coding agent"
          >
            {copied ? <Check size={12} className="text-green-400" /> : <Copy size={12} />}
            {copied ? "Copied" : "Copy task"}
          </button>

          {effectiveStatus === "draft" && (
            <div className="relative ml-auto" ref={dropdownRef}>
              <button
                onClick={() => setShowStatusDropdown(!showStatusDropdown)}
                disabled={isUpdating}
                className="inline-flex items-center gap-1 rounded-md px-2.5 py-1.5 text-xs text-[var(--text-secondary)] border border-[var(--border)] bg-[var(--surface)] hover:bg-[var(--surface-elevated)] transition-colors disabled:opacity-60"
              >
                Status <ChevronDown size={10} />
              </button>
              {showStatusDropdown && (
                <div className="absolute right-0 top-full mt-1 w-28 border border-[var(--border)] bg-[var(--surface-elevated)] rounded-lg shadow-xl overflow-hidden z-10">
                  <button
                    onClick={() => handleStatusChange("accepted")}
                    className="w-full px-3 py-2 text-left text-xs text-green-400 hover:bg-green-500/10 transition-colors"
                  >
                    Accept
                  </button>
                  <button
                    onClick={() => handleStatusChange("rejected")}
                    className="w-full px-3 py-2 text-left text-xs text-red-400 hover:bg-red-500/10 transition-colors"
                  >
                    Reject
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {expanded && (
        <ArtifactDetail
          artifact={artifact}
          sessionId={sessionId}
          onClose={() => setExpanded(false)}
          onStatusChange={onStatusChange}
        />
      )}
    </>
  );
}
