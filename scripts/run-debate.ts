/**
 * One-shot debate runner for the Phase 3 comparison.
 *
 * Creates a fresh session pointed at a GitHub repo, drives one round through
 * proposal -> critique -> revision -> consensus via the orchestrator, then
 * dumps consensus.json + debate-tokens.json so scripts/run-comparison.ts can
 * compare them against a baseline-result.json.
 */

import "dotenv/config";
import * as fs from "node:fs";
import * as path from "node:path";

import { prisma } from "../src/lib/db";
import { eventStore } from "../src/lib/event-store";
import { roundOrchestrator } from "../src/lib/round-orchestrator";
import { tokenBudgetManager } from "../src/lib/token-budget-manager";

interface Args {
  repo: string;
  branch: string;
  problem: string;
  outputDir: string;
}

function parseArgs(): Args {
  const a = process.argv.slice(2);
  const out: Args = { repo: "", branch: "main", problem: "", outputDir: "./comparison-output" };
  for (let i = 0; i < a.length; i++) {
    switch (a[i]) {
      case "--repo": out.repo = a[++i] ?? ""; break;
      case "--branch": out.branch = a[++i] ?? "main"; break;
      case "--problem": out.problem = a[++i] ?? ""; break;
      case "--output-dir": out.outputDir = a[++i] ?? out.outputDir; break;
    }
  }
  if (!out.repo.includes("/") || !out.problem) {
    console.error("Usage: --repo owner/repo --branch main --problem '...'");
    process.exit(1);
  }
  return out;
}

async function main() {
  const args = parseArgs();
  const [owner, repo] = args.repo.split("/");

  fs.mkdirSync(args.outputDir, { recursive: true });

  console.log(`=== Debate run: ${args.repo}@${args.branch} ===`);

  const config = {
    githubRepo: { owner, repo, branch: args.branch, rawUrl: args.repo },
    clarificationPolicy: "suppress" as const,
  };

  const session = await prisma.session.create({
    data: {
      title: args.problem.slice(0, 100),
      problemDescription: args.problem,
      status: "active",
      currentRound: 0,
      tokenBudget: null,
      config: JSON.stringify(config),
    },
  });
  console.log(`Created session ${session.id}`);

  await eventStore.appendEvent({
    sessionId: session.id,
    type: "session-created",
    agentId: null,
    round: 0,
    stage: null,
    content: {
      sessionId: session.id,
      problemDescription: args.problem,
      constraints: [],
      priorSessionSummary: null,
    },
  });

  console.log("Starting round 1 (proposal -> critique -> revision -> consensus)...");
  const t0 = Date.now();
  await roundOrchestrator.startRound(session.id);
  const elapsed = ((Date.now() - t0) / 1000).toFixed(1);
  console.log(`Round complete in ${elapsed}s`);

  const events = await eventStore.getRoundEvents(session.id, 1);
  const consensusEvent = events.find((e) => e.type === "consensus-update");
  if (!consensusEvent) {
    console.error("No consensus event found. Round did not complete consensus stage.");
    const stages = events.map((e) => `${e.type}/${e.stage ?? "-"}`).join(", ");
    console.error(`Events seen: ${stages}`);
    process.exit(2);
  }

  const consensus = consensusEvent.content;
  const consensusPath = path.join(args.outputDir, "debate-consensus.json");
  fs.writeFileSync(consensusPath, JSON.stringify(consensus, null, 2));
  console.log(`Consensus -> ${consensusPath}`);

  const usage = await tokenBudgetManager.getSessionUsage(session.id);
  const tokens = { inputTokens: usage.totalInputTokens, outputTokens: usage.totalOutputTokens };
  const tokensPath = path.join(args.outputDir, "debate-tokens.json");
  fs.writeFileSync(tokensPath, JSON.stringify(tokens, null, 2));
  console.log(`Tokens -> ${tokensPath} (in=${tokens.inputTokens}, out=${tokens.outputTokens})`);

  fs.writeFileSync(
    path.join(args.outputDir, "debate-session-meta.json"),
    JSON.stringify({ sessionId: session.id, repo: args.repo, problem: args.problem, elapsedSeconds: Number(elapsed) }, null, 2)
  );

  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error(e);
  try { await prisma.$disconnect(); } catch {}
  process.exit(1);
});
