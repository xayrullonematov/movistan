"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ChevronDown, ChevronUp, GitBranch, BookOpen, MessageCircleQuestion, ClipboardCheck } from "lucide-react";
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

const templates: { id: string; label: string; problem: string }[] = [
  {
    id: "monolith-to-services",
    label: "Monolith → services",
    problem:
      "Should we extract our checkout flow into a separate service? We're a 30-engineer team on a single Rails monolith, ~5M daily requests, deploys take 25 minutes and any checkout change risks the whole app. We want faster release velocity for the checkout team and clearer ownership boundaries, but we've never run multi-service infra. A good outcome is a concrete first step (extract / strangle / stay) with an honest read on what we lose.",
  },
  {
    id: "auth-strategy",
    label: "Auth strategy",
    problem:
      "We're picking an auth strategy for a new B2B SaaS app: session cookies vs JWT vs a managed identity provider (Auth0/Clerk/WorkOS). Constraints: SOC2 on the roadmap, customers will want SSO/SAML within 12 months, 3 backend engineers, no security specialist on staff. A good outcome is a recommendation, the top two failure modes, and what we're locking ourselves into.",
  },
  {
    id: "database-scaling",
    label: "Database scaling",
    problem:
      "Our Postgres primary is at 70% CPU during peak and writes are starting to lag. We have ~800GB on a single instance, read-heavy but with hot write tables (orders, events). Options on the table: read replicas, partitioning, moving events to a separate store, or a managed sharding layer. Engineering capacity: one senior engineer for ~6 weeks. A good outcome is a sequenced plan with the cheapest reversible step first.",
  },
  {
    id: "api-versioning",
    label: "API versioning",
    problem:
      "We need to introduce breaking changes to our public REST API and have ~400 external integrations live. Options: versioned URLs (/v2/...), versioned headers, deprecation windows with sunset headers, or a parallel GraphQL surface. Constraint: we can't break enterprise customers without 90 days notice. A good outcome is a versioning policy we can defend for the next 3 years and a migration playbook for the first breaking change.",
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
        {/* Problem Description */}
        <div>
          <label htmlFor="problem" className="block text-sm font-medium text-gray-300 mb-2">
            What decision should the review cover?
          </label>
          <div className="mb-2 flex flex-wrap items-center gap-1.5">
            <span className="inline-flex items-center gap-1 text-xs text-gray-400">
              <ClipboardCheck size={12} className="text-emerald-300" />
              Start from a template:
            </span>
            {templates.map((tpl) => (
              <button
                key={tpl.id}
                type="button"
                onClick={() => setProblemDescription(tpl.problem)}
                className="min-h-9 rounded-full border border-gray-700 bg-gray-800/70 px-3 text-xs text-gray-200 transition-colors hover:border-emerald-500/60 hover:bg-emerald-500/10 hover:text-emerald-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/70"
              >
                {tpl.label}
              </button>
            ))}
          </div>
          <textarea
            id="problem"
            value={problemDescription}
            onChange={(e) => setProblemDescription(e.target.value)}
            placeholder="Should we migrate our monolith to microservices? We have 50 engineers, 3M daily requests, and need to ship faster. Current deploy takes 45 minutes..."
            className="h-32 w-full resize-none rounded-xl border border-gray-700 bg-gray-800 px-4 py-3 text-base leading-relaxed text-gray-100 placeholder-gray-500 focus:border-emerald-500/50 focus:outline-none focus:ring-2 focus:ring-emerald-500/50 sm:h-44"
            required
          />
          <p className="mt-1.5 text-sm text-gray-400 sm:mt-2">
            {problemDescription.length}/2000 &mdash; Be specific: include context, constraints, and what a good outcome looks like.
          </p>
        </div>

        {/* GitHub repo grounding (top-level, since it's high-impact) */}
        <div>
          <label htmlFor="github-repo" className="flex items-center gap-1.5 text-sm font-medium text-gray-300 mb-2">
            <GitBranch size={14} className="text-gray-400" />
            Ground in a GitHub repo <span className="text-sm font-normal text-gray-400">(optional)</span>
          </label>
          <input
            id="github-repo"
            type="text"
            value={githubRepo}
            onChange={(e) => setGithubRepo(e.target.value)}
            placeholder="vercel/next.js, owner/repo@branch, or full GitHub URL"
            className="min-h-11 w-full rounded-lg border border-gray-700 bg-gray-800 px-4 py-2.5 text-sm text-gray-100 placeholder-gray-500 focus:border-emerald-500/50 focus:outline-none focus:ring-2 focus:ring-emerald-500/50"
            autoComplete="off"
            spellCheck={false}
          />
          <p className="mt-1 text-sm text-gray-400">
            Agents use read-only file access during the proposal stage. Repo contents are used only to ground this decision report.
          </p>
        </div>

        {/* Advanced Options Toggle */}
        <div>
          <button
            type="button"
            onClick={() => setShowAdvanced(!showAdvanced)}
            className="flex min-h-11 items-center gap-2 text-sm text-gray-300 hover:text-gray-100 transition-colors"
          >
            {showAdvanced ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
            Advanced options
          </button>

          {showAdvanced && (
            <div className="mt-3 space-y-4 rounded-xl border border-gray-700 bg-gray-800/50 p-3 sm:mt-4 sm:space-y-5 sm:p-4">
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
                  className="min-h-11 w-full rounded-lg border border-gray-700 bg-gray-800 px-3 py-2 text-sm text-gray-100 placeholder-gray-500 focus:border-emerald-500/50 focus:outline-none focus:ring-2 focus:ring-emerald-500/50"
                />
                <p className="text-sm text-gray-400 mt-1">
                  Maximum tokens the debate can consume. Leave empty for unlimited.
                </p>
              </div>

              {/* Clarification policy */}
              <div>
                <label htmlFor="clarification-policy" className="flex items-center gap-1.5 text-sm font-medium text-gray-300 mb-1">
                  <MessageCircleQuestion size={14} className="text-gray-400" />
                  Clarification policy
                </label>
                <select
                  id="clarification-policy"
                  value={clarificationPolicy}
                  onChange={(e) => setClarificationPolicy(e.target.value as ClarificationPolicy)}
                  className="min-h-11 w-full rounded-lg border border-gray-700 bg-gray-800 px-3 py-2 text-sm text-gray-100 focus:border-emerald-500/50 focus:outline-none focus:ring-2 focus:ring-emerald-500/50"
                >
                  <option value="allow">Allow — pause the round whenever agents need clarification</option>
                  <option value="limit-1">Limit to 1 question per stage</option>
                  <option value="limit-3">Limit to 3 questions per stage</option>
                  <option value="suppress">Suppress — never pause for clarifications</option>
                </select>
                <p className="text-sm text-gray-400 mt-1">
                  Controls whether agents can ask you questions mid-round. Suppress for fully autonomous runs.
                </p>
              </div>

              {/* Prior session summary */}
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label htmlFor="prior-session" className="flex items-center gap-1.5 text-sm font-medium text-gray-300">
                    <BookOpen size={14} className="text-gray-400" />
                    Prior session context
                  </label>
                  <button
                    type="button"
                    onClick={() => setShowPicker(true)}
                    className="min-h-9 text-sm text-emerald-300 transition-colors hover:text-emerald-200"
                  >
                    Import from session…
                  </button>
                </div>
                <textarea
                  id="prior-session"
                  value={priorSessionSummary}
                  onChange={(e) => setPriorSessionSummary(e.target.value)}
                  placeholder="Paste or import a prior debate's summary so agents continue from where you left off."
                  className="h-24 w-full resize-none rounded-lg border border-gray-700 bg-gray-800 px-3 py-2 text-sm leading-relaxed text-gray-100 placeholder-gray-500 focus:border-emerald-500/50 focus:outline-none focus:ring-2 focus:ring-emerald-500/50 sm:h-28"
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
          className="min-h-12 w-full rounded-lg px-6 py-3.5 text-base font-semibold bg-emerald-500 text-gray-950 hover:bg-emerald-400 disabled:bg-gray-700 disabled:text-gray-400 transition-colors disabled:shadow-none"
        >
          {isSubmitting ? "Starting decision review..." : "Start Review"}
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
