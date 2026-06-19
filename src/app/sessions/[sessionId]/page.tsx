"use client";

import { use } from "react";
import { useSession } from "@/hooks/useSession";
import WorkspaceLayout from "@/components/workspace/WorkspaceLayout";

export default function SessionPage({ params }: { params: Promise<{ sessionId: string }> }) {
  const { sessionId } = use(params);
  const { session, isLoading, error, mutate } = useSession(sessionId);

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <span className="text-gray-400">Loading session...</span>
      </div>
    );
  }

  if (error || !session) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <p className="text-red-400 mb-2">Failed to load session</p>
          <p className="text-gray-500 text-sm">{error?.message || "Session not found"}</p>
        </div>
      </div>
    );
  }

  return <WorkspaceLayout session={session} mutate={mutate} />;
}
