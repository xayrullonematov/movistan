"use client";

import { useState } from "react";
import type { SessionState } from "@/types/domain";

interface SharedWorkspaceProps {
  session: SessionState;
}

export default function SharedWorkspace({ session }: SharedWorkspaceProps) {
  const [expanded, setExpanded] = useState(false);
  const maxLength = 200;
  const isLong = session.problemDescription.length > maxLength;

  return (
    <div className="p-4 border border-gray-700 rounded-lg bg-gray-900/50">
      <h2 className="text-sm font-semibold text-gray-300 uppercase tracking-wide mb-2">
        Problem
      </h2>
      <p className="text-sm text-gray-200 whitespace-pre-wrap">
        {expanded || !isLong
          ? session.problemDescription
          : `${session.problemDescription.slice(0, maxLength)}...`}
      </p>
      {isLong && (
        <button
          onClick={() => setExpanded(!expanded)}
          className="text-xs text-blue-400 hover:text-blue-300 mt-1"
        >
          {expanded ? "Show less" : "Show more"}
        </button>
      )}

      {session.constraints.length > 0 && (
        <div className="mt-3 pt-3 border-t border-gray-700">
          <h3 className="text-xs font-medium text-gray-400 mb-2">Constraints</h3>
          <div className="flex flex-wrap gap-2">
            {session.constraints.map((c) => (
              <span
                key={c.id}
                className="inline-flex items-center gap-1 text-xs px-2 py-1 bg-gray-800 border border-gray-700 rounded max-w-[280px]"
                title={c.text}
              >
                <CategoryDot category={c.category} />
                <span className="text-gray-300 truncate">{c.text}</span>
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function CategoryDot({ category }: { category: string }) {
  const colors: Record<string, string> = {
    technical: "bg-blue-400",
    business: "bg-purple-400",
    timeline: "bg-yellow-400",
    resource: "bg-green-400",
  };

  return (
    <span className={`w-2 h-2 rounded-full ${colors[category] || "bg-gray-400"}`} />
  );
}
