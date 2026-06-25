"use client";

import { useState } from "react";
import {
  FileCheck,
  AlertTriangle,
  Lightbulb,
  Scale,
  HelpCircle,
  ThumbsUp,
  ChevronDown,
} from "lucide-react";
import type { ArtifactState, ArtifactType, ArtifactStatus, AgentType } from "@/types/domain";
import ArtifactDetail from "./ArtifactDetail";
import { toast } from "@/hooks/useToast";

interface ArtifactCardProps {
  artifact: ArtifactState;
  sessionId: string;
  onStatusChange?: () => void;
}

const typeIcons: Record<ArtifactType, typeof FileCheck> = {
  decision: FileCheck,
  risk: AlertTriangle,
  assumption: Lightbulb,
  tradeoff: Scale,
  "open-question": HelpCircle,
  recommendation: ThumbsUp,
};

const typeBorderColors: Record<ArtifactType, string> = {
  decision: "border-l-green-500",
  risk: "border-l-red-500",
  assumption: "border-l-amber-500",
  tradeoff: "border-l-violet-500",
  "open-question": "border-l-cyan-500",
  recommendation: "border-l-blue-500",
};

const typeIconColors: Record<ArtifactType, string> = {
  decision: "text-green-400",
  risk: "text-red-400",
  assumption: "text-amber-400",
  tradeoff: "text-violet-400",
  "open-question": "text-cyan-400",
  recommendation: "text-blue-400",
};

const typeLabels: Record<ArtifactType, string> = {
  decision: "Decision",
  risk: "Risk",
  assumption: "Assumption",
  tradeoff: "Tradeoff",
  "open-question": "Open question",
  recommendation: "Recommendation",
};

const statusTextColors: Record<ArtifactStatus, string> = {
  draft: "text-amber-300",
  accepted: "text-green-300",
  rejected: "text-red-300",
};

const statusLabels: Record<ArtifactStatus, string> = {
  draft: "Draft",
  accepted: "Accepted",
  rejected: "Rejected",
};

const agentLabels: Record<AgentType, string> = {
  "senior-engineer": "Senior",
  "security-engineer": "Security",
  "performance-engineer": "Performance",
  "product-engineer": "Product",
};

export default function ArtifactCard({ artifact, sessionId, onStatusChange }: ArtifactCardProps) {
  const [expanded, setExpanded] = useState(false);
  const [showStatusDropdown, setShowStatusDropdown] = useState(false);
  const [isUpdating, setIsUpdating] = useState(false);
  // Optimistic local override — falls back to server-provided status on next refresh.
  const [optimisticStatus, setOptimisticStatus] = useState<ArtifactStatus | null>(null);

  const Icon = typeIcons[artifact.type] || FileCheck;
  const effectiveStatus: ArtifactStatus = optimisticStatus ?? artifact.status;

  const handleStatusChange = async (status: ArtifactStatus) => {
    const previous = optimisticStatus;
    setOptimisticStatus(status);
    setIsUpdating(true);
    setShowStatusDropdown(false);
    try {
      const res = await fetch(`/api/sessions/${sessionId}/artifacts/${artifact.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(body.error ?? "Failed to update artifact. Please try again.");
      }
      onStatusChange?.();
      // Server is now the source of truth — drop the override on next render cycle.
      setOptimisticStatus(null);
    } catch (err) {
      setOptimisticStatus(previous);
      toast.error({
        message: `Couldn't ${status === "accepted" ? "accept" : status === "rejected" ? "reject" : "update"} artifact`,
        description: err instanceof Error ? err.message : "Network error — please try again.",
      });
    } finally {
      setIsUpdating(false);
    }
  };

  return (
    <>
      <div
        className={`
          group relative rounded-lg border border-l-4 border-gray-700 bg-gray-900/50
          hover:-translate-y-px hover:shadow-lg hover:shadow-black/20
          transition-all duration-200 cursor-pointer
          ${typeBorderColors[artifact.type]}
        `}
        onClick={() => setExpanded(true)}
      >
        <div className="p-3 sm:p-4">
          {/* Header: Icon + Title */}
          <div className="flex items-start gap-2 pr-11 sm:gap-3 sm:pr-12">
            <div className={`shrink-0 mt-0.5 ${typeIconColors[artifact.type]}`}>
              <Icon size={18} className="sm:h-5 sm:w-5" />
            </div>
            <div className="flex-1 min-w-0">
              <h3 className="text-sm font-medium text-gray-100 line-clamp-2 leading-snug">
                {artifact.title}
              </h3>
              <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-gray-400 sm:text-sm">
                <span
                  className={`font-medium ${statusTextColors[effectiveStatus]} ${
                    optimisticStatus ? "opacity-80" : ""
                  }`}
                  title={optimisticStatus ? "Saving..." : undefined}
                >
                  {statusLabels[effectiveStatus]}
                </span>
                <span aria-hidden="true" className="text-gray-600">/</span>
                <span>{typeLabels[artifact.type]}</span>
                {artifact.version > 1 && (
                  <>
                    <span aria-hidden="true" className="text-gray-600">/</span>
                    <span className="font-mono">v{artifact.version}</span>
                  </>
                )}
              </div>
            </div>
          </div>

          {/* Content Preview */}
          {artifact.content && (
            <p className="mt-2 line-clamp-1 text-sm leading-relaxed text-gray-300 sm:mt-3 sm:line-clamp-2">
              {artifact.content}
            </p>
          )}

          {/* Meta: Contributors */}
          {artifact.contributors.length > 0 && (
            <p className="mt-2 truncate text-xs text-gray-500 sm:mt-3 sm:text-sm">
              Contributors: {artifact.contributors.map((contributor) => agentLabels[contributor] ?? contributor).join(", ")}
            </p>
          )}
        </div>

        {/* Status Change Dropdown - always visible for draft artifacts */}
        {effectiveStatus === "draft" && (
          <div
            className="absolute right-2 top-2"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              onClick={() => setShowStatusDropdown(!showStatusDropdown)}
              disabled={isUpdating}
              className="flex min-h-10 min-w-10 items-center justify-center rounded-lg bg-gray-800 border border-gray-600 text-gray-200 transition-colors hover:bg-gray-700 disabled:opacity-60 sm:min-h-11 sm:min-w-11"
              aria-label="Change artifact status"
            >
              <ChevronDown size={14} />
            </button>

            {showStatusDropdown && (
              <div className="absolute right-0 top-full mt-1 w-32 bg-gray-800 border border-gray-600 rounded-lg shadow-xl overflow-hidden z-10">
                <button
                  onClick={() => handleStatusChange("accepted")}
                  className="min-h-10 w-full px-3 py-2 text-left text-sm text-green-300 hover:bg-green-900/30 transition-colors"
                >
                  Accept
                </button>
                <button
                  onClick={() => handleStatusChange("rejected")}
                  className="min-h-10 w-full px-3 py-2 text-left text-sm text-red-300 hover:bg-red-900/30 transition-colors"
                >
                  Reject
                </button>
              </div>
            )}
          </div>
        )}
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
