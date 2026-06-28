"use client";

import { motion } from "framer-motion";
import { Loader2 } from "lucide-react";
import type { RoundStage } from "@/types/domain";

interface ReviewProgressStateProps {
  currentStage: RoundStage | null;
  onShowTechnical: () => void;
}

const stageDescriptions: Record<string, string> = {
  proposal: "Reading repository structure",
  critique: "Inspecting important files",
  revision: "Checking for risks and bugs",
  consensus: "Preparing report",
};

export default function ReviewProgressState({
  currentStage,
  onShowTechnical,
}: ReviewProgressStateProps) {
  const description = currentStage
    ? stageDescriptions[currentStage] || "Analyzing..."
    : "Starting analysis...";

  return (
    <div className="flex flex-col items-center justify-center py-16 px-6 text-center">
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
        className="space-y-6"
      >
        {/* Animated progress indicator */}
        <div className="flex items-center justify-center">
          <div className="relative">
            <div className="h-12 w-12 rounded-full border-2 border-[var(--border)] flex items-center justify-center">
              <Loader2 size={24} className="text-[var(--brand-violet)] animate-spin" />
            </div>
            <div className="absolute -inset-2 rounded-full border border-[var(--brand-violet)]/20 animate-pulse" />
          </div>
        </div>

        <div className="space-y-2">
          <h2 className="text-lg font-semibold text-[var(--text-primary)]">
            Analyzing repository...
          </h2>
          <p className="text-sm text-[var(--text-secondary)]">{description}</p>
        </div>

        <p className="text-xs text-[var(--text-muted)] max-w-xs mx-auto">
          You will see findings here as soon as they are ready.
        </p>

        <button
          onClick={onShowTechnical}
          className="text-xs text-[var(--brand-violet)] hover:text-[var(--violet-hover)] transition-colors"
        >
          Show technical activity
        </button>
      </motion.div>
    </div>
  );
}
