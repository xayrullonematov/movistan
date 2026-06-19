"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ChevronDown, ChevronUp } from "lucide-react";
import ConstraintInput from "./ConstraintInput";

interface ConstraintItem {
  text: string;
  category: string;
}

export default function NewSessionForm() {
  const router = useRouter();
  const [problemDescription, setProblemDescription] = useState("");
  const [tokenBudget, setTokenBudget] = useState<string>("");
  const [constraints, setConstraints] = useState<ConstraintItem[]>([]);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!problemDescription.trim()) return;

    setIsSubmitting(true);
    setError(null);

    try {
      const res = await fetch("/api/sessions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          problemDescription: problemDescription.trim(),
          tokenBudget: tokenBudget ? parseInt(tokenBudget, 10) : undefined,
          constraints,
        }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Failed to create session");
      }

      const data = await res.json();
      router.push(`/sessions/${data.sessionId}`);
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
    <form onSubmit={handleSubmit} className="space-y-6">
      {/* Problem Description */}
      <div>
        <label htmlFor="problem" className="block text-sm font-medium text-gray-300 mb-2">
          What engineering problem should the agents debate?
        </label>
        <textarea
          id="problem"
          value={problemDescription}
          onChange={(e) => setProblemDescription(e.target.value)}
          placeholder="Should we migrate our monolith to microservices? We have 50 engineers, 3M daily requests, and need to ship faster. Current deploy takes 45 minutes..."
          className="w-full h-44 px-4 py-3 bg-gray-800 border border-gray-700 rounded-xl text-gray-100 placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500/50 resize-none text-base leading-relaxed"
          required
        />
        <p className="text-xs text-gray-500 mt-2">
          {problemDescription.length}/2000 &mdash; Be specific: include context, constraints, and what a good outcome looks like.
        </p>
      </div>

      {/* Advanced Options Toggle */}
      <div>
        <button
          type="button"
          onClick={() => setShowAdvanced(!showAdvanced)}
          className="flex items-center gap-2 text-sm text-gray-400 hover:text-gray-200 transition-colors"
        >
          {showAdvanced ? (
            <ChevronUp className="w-4 h-4" />
          ) : (
            <ChevronDown className="w-4 h-4" />
          )}
          Advanced options
        </button>

        {showAdvanced && (
          <div className="mt-4 space-y-4 p-4 bg-gray-800/50 rounded-xl border border-gray-700">
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
                className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-gray-100 placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500/50 text-sm"
              />
              <p className="text-xs text-gray-500 mt-1">
                Maximum tokens the debate can consume. Leave empty for unlimited.
              </p>
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
        className="w-full py-3.5 px-6 rounded-lg font-semibold text-white bg-gradient-to-r from-blue-500 to-violet-500 hover:from-blue-600 hover:to-violet-600 disabled:from-gray-700 disabled:to-gray-700 disabled:text-gray-500 transition-all duration-300 shadow-lg shadow-blue-500/20 hover:shadow-blue-500/30 disabled:shadow-none text-base"
      >
        {isSubmitting ? "Creating Session..." : "Start Debate"}
      </button>
    </form>
  );
}
