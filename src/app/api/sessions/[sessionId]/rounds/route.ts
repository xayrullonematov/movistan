/**
 * Round Start API Route
 *
 * POST /api/sessions/[sessionId]/rounds - Start a new debate round
 *
 * Checks budget, acquires session lock, estimates cost, and starts
 * the round orchestrator. For MVP, blocks until round completes.
 */

import { NextResponse } from "next/server";
import { tokenBudgetManager } from "@/lib/token-budget-manager";
import { roundOrchestrator } from "@/lib/round-orchestrator";
import { prisma } from "@/lib/db";

// =============================================================================
// POST /api/sessions/[sessionId]/rounds
//
// Locking is owned by roundOrchestrator.startRound — it acquires, runs the
// round, and releases in its own finally block. The route only translates
// the orchestrator's "is locked" error into a 409.
// =============================================================================

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ sessionId: string }> }
) {
  try {
    const { sessionId } = await params;

    if (!sessionId) {
      return NextResponse.json(
        { error: "sessionId is required" },
        { status: 400 }
      );
    }

    // Check budget status — warn at 80%, block at 100%
    const budgetStatus = await tokenBudgetManager.checkBudget(sessionId);

    if (budgetStatus.isOverBudget) {
      return NextResponse.json(
        {
          error: "Token budget exceeded",
          budgetStatus,
        },
        { status: 402 }
      );
    }

    const costEstimate = await tokenBudgetManager.estimateRoundCost(sessionId);

    const session = await prisma.session.findUniqueOrThrow({
      where: { id: sessionId },
      select: { currentRound: true },
    });

    const nextRound = session.currentRound + 1;

    // For MVP this blocks until the round completes. The frontend polls
    // session detail + events endpoints for stage-progress updates.
    await roundOrchestrator.startRound(sessionId);

    return NextResponse.json({
      round: nextRound,
      stage: "proposal",
      costEstimate,
      budgetStatus,
    });
  } catch (error) {
    if (error instanceof Error && error.message.includes("Session is locked")) {
      return NextResponse.json({ error: "Session is locked" }, { status: 409 });
    }

    console.error("POST /api/sessions/[sessionId]/rounds error:", error);
    return NextResponse.json(
      { error: "Failed to start round" },
      { status: 500 }
    );
  }
}
