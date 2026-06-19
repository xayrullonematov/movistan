"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import { Hand, Send, SkipForward } from "lucide-react";

interface InterventionPanelProps {
  sessionId: string;
}

const CATEGORIES = ["technical", "business", "timeline", "resource"] as const;

export default function InterventionPanel({ sessionId }: InterventionPanelProps) {
  const [constraintText, setConstraintText] = useState("");
  const [category, setCategory] = useState<string>("technical");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleAddAndContinue = async () => {
    if (!constraintText.trim()) return;
    setIsSubmitting(true);
    try {
      await fetch(`/api/sessions/${sessionId}/intervene`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: constraintText.trim(), category }),
      });
      await fetch(`/api/sessions/${sessionId}/advance`, { method: "POST" });
      setConstraintText("");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleSkip = async () => {
    setIsSubmitting(true);
    try {
      await fetch(`/api/sessions/${sessionId}/advance`, { method: "POST" });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <motion.div
      initial={{ y: -20, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      transition={{ type: "spring", stiffness: 260, damping: 22 }}
      className="rounded-xl border-2 border-yellow-600/50 bg-yellow-950/20 overflow-hidden"
    >
      {/* Header */}
      <div className="flex items-center gap-3 px-5 py-3 bg-yellow-900/20 border-b border-yellow-700/40">
        <div className="w-8 h-8 rounded-lg bg-yellow-500/15 flex items-center justify-center">
          <Hand size={18} className="text-yellow-400" />
        </div>
        <div>
          <h3 className="text-sm font-semibold text-yellow-300">
            Your Turn - Intervention Point
          </h3>
          <p className="text-xs text-yellow-500/80">
            The debate is paused. Add a constraint or continue to the next round.
          </p>
        </div>
      </div>

      {/* Body */}
      <div className="p-5 space-y-3">
        <textarea
          value={constraintText}
          onChange={(e) => setConstraintText(e.target.value)}
          placeholder="Add a new constraint or guidance for the next round..."
          className="w-full h-24 px-4 py-3 bg-gray-900/80 border border-gray-700 rounded-lg text-gray-100 placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-yellow-500/50 focus:border-yellow-600 resize-none text-sm transition-all"
        />

        <div className="flex items-center gap-3">
          <select
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            className="flex-1 px-3 py-2.5 bg-gray-900/80 border border-gray-700 rounded-lg text-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-yellow-500/50 focus:border-yellow-600 transition-all"
          >
            {CATEGORIES.map((cat) => (
              <option key={cat} value={cat}>
                {cat.charAt(0).toUpperCase() + cat.slice(1)}
              </option>
            ))}
          </select>
        </div>

        <div className="flex gap-3 pt-1">
          <button
            onClick={handleAddAndContinue}
            disabled={isSubmitting || !constraintText.trim()}
            className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 bg-yellow-600 hover:bg-yellow-500 disabled:opacity-50 disabled:hover:bg-yellow-600 text-white text-sm font-medium rounded-lg transition-colors"
          >
            <Send size={14} />
            Add Constraint & Continue
          </button>
          <button
            onClick={handleSkip}
            disabled={isSubmitting}
            className="flex items-center gap-2 px-4 py-2.5 bg-gray-800 hover:bg-gray-700 border border-gray-600 disabled:opacity-50 text-gray-200 text-sm rounded-lg transition-colors"
          >
            <SkipForward size={14} />
            Skip
          </button>
        </div>
      </div>
    </motion.div>
  );
}
