import { NextResponse } from "next/server";
import { artifactStore } from "@/lib/artifact-store";
import { snapshotManager } from "@/lib/snapshot-manager";
import { tokenBudgetManager } from "@/lib/token-budget-manager";
import type { ArtifactState } from "@/types/domain";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ sessionId: string }> }
) {
  try {
    const { sessionId } = await params;
    const state = await snapshotManager.projectFromSnapshot(sessionId);
    const artifacts = await artifactStore.getSessionArtifacts(sessionId);
    const usage = await tokenBudgetManager.getSessionUsage(sessionId);

    const grouped: Record<string, ArtifactState[]> = {
      decision: [],
      risk: [],
      assumption: [],
      tradeoff: [],
      "open-question": [],
      recommendation: [],
    };

    for (const a of artifacts) {
      if (a.type in grouped) {
        grouped[a.type].push(a);
      }
    }

    return NextResponse.json({
      session: {
        problemDescription: state.problemDescription,
        status: state.status,
        currentRound: state.currentRound,
        totalTokens: usage.totalInputTokens + usage.totalOutputTokens,
        estimatedCostUsd: usage.estimatedCostUsd,
      },
      consensus: state.consensus ?? null,
      artifacts: grouped,
      summary: {
        roundCount: state.currentRound,
        artifactCount: artifacts.length,
        acceptedCount: artifacts.filter((a) => a.status === "accepted").length,
      },
    });
  } catch (error) {
    return NextResponse.json(
      { error: "Failed to fetch session results" },
      { status: 500 }
    );
  }
}
