"use client";

import { useMemo, useState } from "react";
import { motion } from "framer-motion";
import { HelpCircle, Send, Loader2, SkipForward } from "lucide-react";
import type { AgentType, PersistedEvent } from "@/types/domain";
import { toast } from "@/hooks/useToast";

interface ClarificationPanelProps {
  sessionId: string;
  events: PersistedEvent[];
  currentRound: number;
}

interface ClarificationRequest {
  agentId: AgentType | null;
  questions: string[];
  timestamp: string;
}

const agentLabel: Record<AgentType, string> = {
  "senior-engineer": "Senior Engineer",
  "security-engineer": "Security Engineer",
  "performance-engineer": "Performance Engineer",
  "product-engineer": "Product Engineer",
};

/**
 * Returns the most recent clarification request(s) for the active round.
 * Each agent can emit at most one, so we de-duplicate by agentId keeping
 * the latest entry.
 */
function deriveActiveClarifications(events: PersistedEvent[], currentRound: number): ClarificationRequest[] {
  const byAgent = new Map<string, ClarificationRequest>();
  for (const e of events) {
    if (e.type !== "clarification-request") continue;
    if (e.round !== currentRound) continue;
    try {
      const data = JSON.parse(e.content) as { questions?: string[]; clarificationQuestions?: string[] };
      const questions = data.questions ?? data.clarificationQuestions ?? [];
      if (questions.length === 0) continue;
      byAgent.set(e.agentId ?? "unknown", {
        agentId: e.agentId,
        questions,
        timestamp: e.timestamp,
      });
    } catch {
      // skip malformed
    }
  }
  return Array.from(byAgent.values()).sort((a, b) => a.timestamp.localeCompare(b.timestamp));
}

export default function ClarificationPanel({ sessionId, events, currentRound }: ClarificationPanelProps) {
  const clarifications = useMemo(
    () => deriveActiveClarifications(events, currentRound),
    [events, currentRound],
  );
  const [reply, setReply] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  if (clarifications.length === 0) return null;

  async function handleSubmit() {
    if (!reply.trim()) return;
    setIsSubmitting(true);
    try {
      const intRes = await fetch(`/api/sessions/${sessionId}/intervene`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: reply.trim(), category: "clarification" }),
      });
      if (!intRes.ok) {
        const body = (await intRes.json().catch(() => ({}))) as { error?: string };
        throw new Error(body.error ?? "Couldn't send your reply. Please try again.");
      }
      const advRes = await fetch(`/api/sessions/${sessionId}/advance`, { method: "POST" });
      if (!advRes.ok) {
        const body = (await advRes.json().catch(() => ({}))) as { error?: string };
        throw new Error(body.error ?? "Couldn't resume the round. Please try again.");
      }
      setReply("");
      toast.success({ message: "Clarification sent", description: "The round will resume shortly." });
    } catch (err) {
      toast.error({
        message: "Couldn't send clarification",
        description: err instanceof Error ? err.message : "Network error",
      });
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleSkip() {
    setIsSubmitting(true);
    try {
      const res = await fetch(`/api/sessions/${sessionId}/advance`, { method: "POST" });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(body.error ?? "Couldn't resume the session. Please try again.");
      }
      toast.info({ message: "Resuming without clarification" });
    } catch (err) {
      toast.error({
        message: "Couldn't resume",
        description: err instanceof Error ? err.message : "Network error",
      });
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <motion.div
      initial={{ y: -10, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      transition={{ duration: 0.2 }}
      className="overflow-hidden rounded-xl border-2 border-cyan-600/50 bg-cyan-950/20"
    >
      <header className="flex items-center gap-3 border-b border-cyan-700/40 bg-cyan-900/20 px-5 py-3">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-cyan-500/15">
          <HelpCircle size={18} className="text-cyan-300" />
        </div>
        <div>
          <h3 className="text-sm font-semibold text-cyan-200">
            Agents need clarification
          </h3>
          <p className="text-xs text-cyan-300/80">
            The round is paused waiting on your answer.
          </p>
        </div>
      </header>

      <div className="space-y-4 p-5">
        {clarifications.map((req, i) => (
          <div key={i} className="rounded-lg border border-cyan-700/30 bg-gray-900/40 p-3">
            <p className="text-xs font-medium text-cyan-200">
              {req.agentId ? agentLabel[req.agentId] : "Agent"}
            </p>
            <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-gray-200">
              {req.questions.map((q, j) => (
                <li key={j}>{q}</li>
              ))}
            </ul>
          </div>
        ))}

        <div>
          <label htmlFor="clarification-reply" className="block text-xs font-medium text-gray-300">
            Your reply
          </label>
          <textarea
            id="clarification-reply"
            value={reply}
            onChange={(e) => setReply(e.target.value)}
            placeholder="Answer the agents' questions so they can continue the round…"
            className="mt-1 h-24 w-full resize-none rounded-lg border border-gray-700 bg-gray-900/80 px-3 py-2 text-sm text-gray-100 placeholder-gray-500 focus:border-cyan-500 focus:outline-none focus:ring-2 focus:ring-cyan-500/40"
          />
        </div>

        <div className="flex gap-3">
          <button
            type="button"
            onClick={handleSubmit}
            disabled={isSubmitting || !reply.trim()}
            className="inline-flex flex-1 items-center justify-center gap-2 rounded-lg bg-cyan-600 px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-cyan-500 disabled:opacity-50"
          >
            {isSubmitting ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
            Send & resume round
          </button>
          <button
            type="button"
            onClick={handleSkip}
            disabled={isSubmitting}
            className="inline-flex items-center gap-2 rounded-lg border border-gray-600 bg-gray-800 px-4 py-2.5 text-sm text-gray-200 transition-colors hover:bg-gray-700 disabled:opacity-50"
          >
            <SkipForward size={14} />
            Resume without answering
          </button>
        </div>
      </div>
    </motion.div>
  );
}
