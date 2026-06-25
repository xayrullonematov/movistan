"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ChevronDown, ChevronUp, GitBranch, BookOpen, MessageCircleQuestion } from "lucide-react";
import ConstraintInput from "./ConstraintInput";
import PriorSessionPicker from "./PriorSessionPicker";

interface ConstraintItem {
  text: string;
  category: string;
}

type ClarificationPolicy = "allow" | "suppress" | "limit-1" | "limit-3";

function policyToValue(p: ClarificationPolicy): "allow" | "suppress" | number {
  if (p === "limit-1") return 1;
  if (p === "limit-3") return 3;
  return p;
}

const reviewTypes: { id: string; label: string; problem: string }[] = [
  {
    id: "security",
    label: "Find security vulnerabilities",
    problem: "Scan this repo for security vulnerabilities: auth bypass, injection flaws, secrets in code, insecure dependencies, and misconfigured permissions. Flag the riskiest files first.",
  },
  {
    id: "bugs",
    label: "Find bugs and edge cases",
    problem: "Find bugs, unhandled edge cases, and logic errors in this codebase. Focus on crash-prone paths, race conditions, null dereferences, and incorrect error handling.",
  },
  {
    id: "architecture",
    label: "Review architecture",
    problem: "Review the architecture of this repo. Identify coupling issues, unclear boundaries, scaling bottlenecks, and areas where the structure will break as the team or traffic grows.",
  },
  {
    id: "production",
    label: "Check production readiness",
    problem: "Check if this repo is production-ready. Look for missing error handling, no monitoring/logging, deployment risks, missing tests on critical paths, and configuration issues.",
  },
  {
    id: "explain",
    label: "Explain this repo",
    problem: "Explain what this codebase does, how it is structured, what the main entry points are, and how data flows through the system. Summarize at the file and module level.",
  },
  {
    id: "refactor",
    label: "What should I refactor first?",
    problem: "Identify the highest-impact refactoring targets in this repo. Prioritize by risk, complexity, and how much they block other improvements. Give concrete file-level recommendations.",
  },
];

export default function NewSessionForm() {
  const router = useRouter();
  const [problemDescription, setProblemDescription] = useState("");
  const [tokenBudget, setTokenBudget] = useState<string>("");
  const [constraints, setConstraints] = useState<ConstraintItem[]>([]);
  const [githubRepo, setGithubRepo] = useState("");
  const [priorSessionSummary, setPriorSessionSummary] = useState("");
  const [clarificationPolicy, setClarificationPolicy] = useState<ClarificationPolicy>("allow");
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [showPicker, setShowPicker] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!problemDescription.trim()) return;

    setIsSubmitting(true);
    setError(null);

    try {
      const payload: Record<string, unknown> = {
        problemDescription: problemDescription.trim(),
        tokenBudget: tokenBudget ? parseInt(tokenBudget, 10) : undefined,
        constraints,
      };
      if (githubRepo.trim()) payload.githubRepo = githubRepo.trim();
      if (priorSessionSummary.trim()) payload.priorSessionSummary = priorSessionSummary.trim();
      if (clarificationPolicy !== "allow") {
        payload.config = { clarificationPolicy: policyToValue(clarificationPolicy) };
      }

      const res = await fetch("/api/sessions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Failed to create session");
      }

      const data = await res.json();
      router.push(`/sessions/${data.sessionId}?start=1`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setIsSubmitting(false);
    }
  };

  const addConstraint = (constraint: ConstraintItem) => {
    setConstraints((prev) => [...prev, constraint]);
  };

  const removeConstraint = (index: number) => {
    setConstraints((prev) => prev.filter((_, i) => i !== index));
  };

  return (
    <>
      <form onSubmit={handleSubmit} className="space-y-4 sm:space-y-6">
        {/* GitHub Repository - Primary */}
        <div>
          <label htmlFor="github-repo" className="flex items-center gap-1.5 text-sm font-medium text-gray-300 mb-2">
            <GitBranch size={14} className="text-violet-400" />
            GitHub repository
          </label>
          <input
            id="github-repo"
            type="text"
            value={githubRepo}
            onChange={(e) => setGithubRepo(e.target.value)}
            placeholder="owner/repo, owner/repo@branch, or full GitHub URL"
            className="min-h-11 w-full rounded-lg border border-[var(--border)] bg-[var(--surface-elevated)] px-4 py-2.5 text-sm font-mono text-[var(--text-primary)] placeholder-[var(--text-muted)] focus:border-[var(--brand-violet)] focus:outline-none focus:ring-2 focus:ring-[var(--violet-glow)]"
            autoComplete="off"
            spellCheck={false}
          />
        </div>

        {/* What to check */}
        <div>
          <label htmlFor="problem" className="block text-sm font-medium text-gray-300 mb-2">
            What should we check?
          </label>
          <div className="mb-2 flex flex-wrap items-center gap-1.5">
            {reviewTypes.map((rt) => (
              <button
                key={rt.id}
                type="button"
                onClick={() => setProblemDescription(rt.problem)}
                className="min-h-9 rounded-full border border-[var(--border)] bg-[var(--surface-elevated)] px-3 text-xs text-[var(--text-secondary)] transition-colors hover:border-[var(--brand-violet)] hover:bg-[var(--violet-soft-bg)] hover:text-violet-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand-violet)]"
              >
                {rt.label}
              </button>
            ))}
          </div>
          <textarea
            id="problem"
            value={problemDescription}
            onChange={(e) => setProblemDescription(e.target.value)}
            placeholder="Find auth bypass risks and secrets leaking in environment configs..."
            className="h-32 w-full resize-none rounded-xl border border-[var(--border)] bg-[var(--surface-elevated)] px-4 py-3 text-base leading-relaxed text-[var(--text-primary)] placeholder-[var(--text-muted)] focus:border-[var(--brand-violet)] focus:outline-none focus:ring-2 focus:ring-[var(--violet-glow)] sm:h-36"
            required
          />
          <p className="mt-1.5 text-sm text-[var(--text-muted)] sm:mt-2">
            {problemDescription.length}/2000 - Be specific: include what files or areas to focus on.
          </p>
        </div>

        {/* Advanced Options Toggle */}
        <div>
          <button
            type="button"
            onClick={() => setShowAdvanced(!showAdvanced)}
            className="flex min-h-11 items-center gap-2 text-sm text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors"
          >
            {showAdvanced ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
            Advanced options
          </button>

          {showAdvanced && (
            <div className="mt-3 space-y-4 rounded-xl border border-[var(--border)] bg-[var(--surface-elevated)]/50 p-3 sm:mt-4 sm:space-y-5 sm:p-4">
              {/* Token Budget */}
              <div>
                <label htmlFor="budget" className="block text-sm font-medium text-gray-300 mb-1">
                  Token Budget
                </label>
                <input
                  id="budget"
                  type="number"
                  value={tokenBudget}
                  onChange={(e) => setTokenBudget(e.target.value)}
                  placeholder="e.g., 100000"
                  min="1000"
                  className="min-h-11 w-full rounded-lg border border-[var(--border)] bg-[var(--surface-elevated)] px-3 py-2 text-sm text-[var(--text-primary)] placeholder-[var(--text-muted)] focus:border-[var(--brand-violet)] focus:outline-none focus:ring-2 focus:ring-[var(--violet-glow)]"
                />
                <p className="text-sm text-[var(--text-muted)] mt-1">
                  Maximum tokens the review can consume. Leave empty for unlimited.
                </p>
              </div>

              {/* Clarification policy */}
              <div>
                <label htmlFor="clarification-policy" className="flex items-center gap-1.5 text-sm font-medium text-gray-300 mb-1">
                  <MessageCircleQuestion size={14} className="text-[var(--text-muted)]" />
                  Clarification policy
                </label>
                <select
                  id="clarification-policy"
                  value={clarificationPolicy}
                  onChange={(e) => setClarificationPolicy(e.target.value as ClarificationPolicy)}
                  className="min-h-11 w-full rounded-lg border border-[var(--border)] bg-[var(--surface-elevated)] px-3 py-2 text-sm text-[var(--text-primary)] focus:border-[var(--brand-violet)] focus:outline-none focus:ring-2 focus:ring-[var(--violet-glow)]"
                >
                  <option value="allow">Allow - pause when agents need clarification</option>
                  <option value="limit-1">Limit to 1 question per stage</option>
                  <option value="limit-3">Limit to 3 questions per stage</option>
                  <option value="suppress">Suppress - fully autonomous run</option>
                </select>
                <p className="text-sm text-[var(--text-muted)] mt-1">
                  Controls whether agents can ask you questions mid-review.
                </p>
              </div>

              {/* Prior session summary */}
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label htmlFor="prior-session" className="flex items-center gap-1.5 text-sm font-medium text-gray-300">
                    <BookOpen size={14} className="text-[var(--text-muted)]" />
                    Prior session context
                  </label>
                  <button
                    type="button"
                    onClick={() => setShowPicker(true)}
                    className="min-h-9 text-sm text-violet-400 transition-colors hover:text-violet-300"
                  >
                    Import from session...
                  </button>
                </div>
                <textarea
                  id="prior-session"
                  value={priorSessionSummary}
                  onChange={(e) => setPriorSessionSummary(e.target.value)}
                  placeholder="Paste or import a prior session summary so agents continue from where you left off."
                  className="h-24 w-full resize-none rounded-lg border border-[var(--border)] bg-[var(--surface-elevated)] px-3 py-2 text-sm leading-relaxed text-[var(--text-primary)] placeholder-[var(--text-muted)] focus:border-[var(--brand-violet)] focus:outline-none focus:ring-2 focus:ring-[var(--violet-glow)] sm:h-28"
                />
              </div>

              {/* Constraints */}
              <ConstraintInput
                constraints={constraints}
                onAdd={addConstraint}
                onRemove={removeConstraint}
              />
            </div>
          )}
        </div>

        {/* Error Message */}
        {error && (
          <p className="text-red-400 text-sm bg-red-900/20 border border-red-800/50 rounded-lg px-4 py-2">
            {error}
          </p>
        )}

        {/* Submit Button */}
        <button
          type="submit"
          disabled={isSubmitting || !problemDescription.trim()}
          className="min-h-12 w-full rounded-lg px-6 py-3.5 text-base font-semibold bg-[var(--brand-violet)] text-white hover:bg-[var(--violet-hover)] disabled:bg-gray-700 disabled:text-gray-400 transition-colors disabled:shadow-none"
        >
          {isSubmitting ? "Analyzing..." : "Analyze repo"}
        </button>
      </form>

      {showPicker && (
        <PriorSessionPicker
          onClose={() => setShowPicker(false)}
          onPick={(summary) => {
            setPriorSessionSummary(summary);
            setShowAdvanced(true);
            setShowPicker(false);
          }}
        />
      )}
    </>
  );
}
