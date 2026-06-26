/**
 * Session Export API Route
 *
 * GET /api/sessions/[sessionId]/export - Export session as markdown report
 *
 * Returns a complete markdown report of the session's review results,
 * findings, agent agreement, and cost breakdown.
 *
 * Query param: ?format=json returns { markdown, filename }
 * Default: returns Content-Type: text/markdown with the export string
 */

import { NextResponse } from "next/server";
import { generateSessionExport } from "@/lib/export";

// =============================================================================
// GET /api/sessions/[sessionId]/export
// =============================================================================

export async function GET(
  request: Request,
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

    const { markdown, filename } = await generateSessionExport(sessionId);

    // Check if JSON format is requested
    const url = new URL(request.url);
    const format = url.searchParams.get("format");

    if (format === "json") {
      return NextResponse.json({ markdown, filename });
    }

    // Default: return as text/markdown with Content-Disposition
    return new NextResponse(markdown, {
      status: 200,
      headers: {
        "Content-Type": "text/markdown; charset=utf-8",
        "Content-Disposition": `attachment; filename="${filename}"`,
      },
    });
  } catch (error) {
    console.error("GET /api/sessions/[sessionId]/export error:", error);
    return NextResponse.json(
      { error: "Failed to export session" },
      { status: 500 }
    );
  }
}
