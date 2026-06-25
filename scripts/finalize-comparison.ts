/**
 * Generate comparison report from pre-computed baseline + debate results
 * (no LLM calls; just reads JSON files, runs the deterministic comparison).
 */
import "dotenv/config";
import * as fs from "node:fs";
import * as path from "node:path";
import { generateComparisonReport, formatComparisonMarkdown } from "../src/lib/baseline-comparison";

const dir = process.argv[2] ?? "./comparison-output";

const baseline = JSON.parse(fs.readFileSync(path.join(dir, "baseline-result.json"), "utf-8"));
const debateRaw = fs.readFileSync(path.join(dir, "debate-consensus.json"), "utf-8");
let debateConsensus = JSON.parse(debateRaw);
if (typeof debateConsensus === "string") debateConsensus = JSON.parse(debateConsensus);
const debateTokens = JSON.parse(fs.readFileSync(path.join(dir, "debate-tokens.json"), "utf-8"));

const report = generateComparisonReport({
  baselineResult: baseline,
  debateConsensus,
  debateTokenUsage: debateTokens,
  baselineTokenUsage: { inputTokens: baseline.tokenUsage.inputTokens, outputTokens: baseline.tokenUsage.outputTokens },
});

fs.writeFileSync(path.join(dir, "comparison-report.json"), JSON.stringify(report, null, 2));
const md = formatComparisonMarkdown(report);
fs.writeFileSync(path.join(dir, "comparison-report.md"), md);
console.log(md);
