"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
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
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <label htmlFor="problem" className="block text-sm font-medium text-gray-300 mb-1">
          Problem Description
        </label>
        <textarea
          id="problem"
          value={problemDescription}
          onChange={(e) => setProblemDescription(e.target.value)}
          placeholder="Describe the engineering problem you want the agents to discuss..."
          className="w-full h-32 px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-gray-100 placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none text-sm"
          required
        />
        <p className="text-xs text-gray-500 mt-1">
          {problemDescription.length}/2000 — Be specific: include context, constraints, and what a good outcome looks like.
        </p>
      </div>

      <div>
        <label htmlFor="budget" className="block text-sm font-medium text-gray-300 mb-1">
          Token Budget (optional)
        </label>
        <input
          id="budget"
          type="number"
          value={tokenBudget}
          onChange={(e) => setTokenBudget(e.target.value)}
          placeholder="e.g., 100000"
          min="1000"
          className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-gray-100 placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm"
        />
      </div>

      <ConstraintInput
        constraints={constraints}
        onAdd={addConstraint}
        onRemove={removeConstraint}
      />

      {error && (
        <p className="text-red-400 text-sm">{error}</p>
      )}

      <button
        type="submit"
        disabled={isSubmitting || !problemDescription.trim()}
        className="w-full py-2.5 px-4 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-700 disabled:text-gray-500 text-white font-medium rounded-lg transition-colors text-sm"
      >
        {isSubmitting ? "Creating..." : "Start Session"}
      </button>
    </form>
  );
}
