/**
 * Baseline vs Debate Comparison Script
 *
 * A standalone script that:
 * 1. Runs the baseline (single-pass LLM) against a GitHub repo
 * 2. Accepts a pre-computed ConsensusOutput JSON file for the debate arm
 * 3. Generates a comparison report (JSON + markdown)
 *
 * Usage:
 *   npx tsx scripts/run-comparison.ts --repo owner/repo --branch main \
 *     --problem "Evaluate engineering quality" \
 *     --consensus path/to/consensus.json \
 *     --debate-tokens path/to/debate-tokens.json
 *
 *   Or run baseline only (output results for manual comparison):
 *   npx tsx scripts/run-comparison.ts --repo owner/repo --branch main \
 *     --problem "Evaluate engineering quality" \
 *     --baseline-only
 *
 * Environment variables:
 *   LLM_API_KEY      - API key for the LLM provider
 *   LLM_API_ENDPOINT - API endpoint URL
 *   LLM_MODEL        - Model to use (optional)
 *   GITHUB_TOKEN     - GitHub token for repo access (optional but recommended)
 */

import * as fs from "node:fs";
import * as path from "node:path";

// Since this script runs standalone with tsx, we use relative imports
// that tsx resolves via tsconfig paths

interface ScriptArgs {
  repo: string; // "owner/repo" format
  branch: string;
  problem: string;
  consensusFile?: string;
  debateTokensFile?: string;
  baselineOnly: boolean;
  outputDir: string;
}

function parseArgs(): ScriptArgs {
  const args = process.argv.slice(2);
  const parsed: ScriptArgs = {
    repo: "",
    branch: "main",
    problem: "",
    baselineOnly: false,
    outputDir: "./comparison-output",
  };

  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case "--repo":
        parsed.repo = args[++i] || "";
        break;
      case "--branch":
        parsed.branch = args[++i] || "main";
        break;
      case "--problem":
        parsed.problem = args[++i] || "";
        break;
      case "--consensus":
        parsed.consensusFile = args[++i];
        break;
      case "--debate-tokens":
        parsed.debateTokensFile = args[++i];
        break;
      case "--baseline-only":
        parsed.baselineOnly = true;
        break;
      case "--output-dir":
        parsed.outputDir = args[++i] || "./comparison-output";
        break;
      case "--help":
        printHelp();
        process.exit(0);
        break;
      default:
        console.error(`Unknown argument: ${args[i]}`);
        printHelp();
        process.exit(1);
    }
  }

  return parsed;
}

function printHelp(): void {
  console.log(`
Baseline vs Debate Comparison Script

Usage:
  npx tsx scripts/run-comparison.ts [options]

Options:
  --repo <owner/repo>      GitHub repository (required)
  --branch <branch>        Branch to analyze (default: main)
  --problem <description>  Problem/question to evaluate (required)
  --consensus <file>       Path to pre-computed ConsensusOutput JSON
  --debate-tokens <file>   Path to debate token usage JSON ({inputTokens, outputTokens})
  --baseline-only          Run only the baseline and output results
  --output-dir <dir>       Output directory (default: ./comparison-output)
  --help                   Show this help message

Examples:
  # Run baseline only
  npx tsx scripts/run-comparison.ts --repo owner/repo --branch main \\
    --problem "Evaluate engineering quality" --baseline-only

  # Full comparison with pre-computed debate results
  npx tsx scripts/run-comparison.ts --repo owner/repo --branch main \\
    --problem "Evaluate engineering quality" \\
    --consensus debate-consensus.json \\
    --debate-tokens debate-tokens.json
  `);
}

function validateArgs(args: ScriptArgs): void {
  if (!args.repo) {
    console.error("Error: --repo is required (format: owner/repo)");
    process.exit(1);
  }
  if (!args.repo.includes("/")) {
    console.error("Error: --repo must be in owner/repo format");
    process.exit(1);
  }
  if (!args.problem) {
    console.error("Error: --problem is required");
    process.exit(1);
  }
  if (!args.baselineOnly && !args.consensusFile) {
    console.error(
      "Error: either --baseline-only or --consensus must be provided"
    );
    process.exit(1);
  }
}

async function main(): Promise<void> {
  const args = parseArgs();
  validateArgs(args);

  const [repoOwner, repo] = args.repo.split("/");

  // Ensure output directory exists
  if (!fs.existsSync(args.outputDir)) {
    fs.mkdirSync(args.outputDir, { recursive: true });
  }

  console.log("=== Baseline vs Debate Comparison ===");
  console.log(`Repository: ${args.repo}@${args.branch}`);
  console.log(`Problem: ${args.problem}`);
  console.log("");

  // Dynamic imports to support path aliases via tsx
  const { runBaseline } = await import("../src/lib/baseline-runner");
  const { fetchRepoTree, GithubError } = await import("../src/lib/github-fetcher");
  const { generateComparisonReport, formatComparisonMarkdown } = await import(
    "../src/lib/baseline-comparison"
  );

  // Fetch repository tree for the baseline
  console.log("Fetching repository file tree...");
  const treeResult = await fetchRepoTree(repoOwner, repo, args.branch);
  if (treeResult instanceof GithubError) {
    console.error(`Error fetching repo tree: ${treeResult.message}`);
    process.exit(1);
  }
  const entries = treeResult.entries;
  console.log(`Found ${entries.length} files in the repository.`);
  console.log("");

  // Run baseline
  console.log("Running baseline assessment...");
  const baselineResult = await runBaseline({
    repoOwner,
    repo,
    branch: args.branch,
    problemDescription: args.problem,
    entries,
  });
  console.log("Baseline complete.");
  console.log(
    `  Tool calls: ${baselineResult.toolStats.toolCallCount} (cap hit: ${baselineResult.toolStats.capHit})`
  );
  console.log(
    `  Tokens: ${baselineResult.tokenUsage.inputTokens} input, ${baselineResult.tokenUsage.outputTokens} output`
  );
  console.log(
    `  Risks found: ${baselineResult.output.risks.length}`
  );
  console.log(
    `  Recommendations: ${baselineResult.output.recommendations.length}`
  );
  console.log("");

  // Save baseline result
  const baselineOutputPath = path.join(args.outputDir, "baseline-result.json");
  fs.writeFileSync(
    baselineOutputPath,
    JSON.stringify(baselineResult, null, 2)
  );
  console.log(`Baseline result saved to: ${baselineOutputPath}`);

  if (args.baselineOnly) {
    console.log("");
    console.log(
      "Baseline-only mode. To run the comparison, re-run with:"
    );
    console.log(
      `  --consensus <path-to-consensus.json> --debate-tokens <path-to-tokens.json>`
    );
    return;
  }

  // Load pre-computed debate results
  console.log("");
  console.log("Loading pre-computed debate results...");

  if (!args.consensusFile || !fs.existsSync(args.consensusFile)) {
    console.error(`Error: consensus file not found: ${args.consensusFile}`);
    process.exit(1);
  }

  const debateConsensus = JSON.parse(
    fs.readFileSync(args.consensusFile, "utf-8")
  );

  let debateTokenUsage = { inputTokens: 0, outputTokens: 0 };
  if (args.debateTokensFile && fs.existsSync(args.debateTokensFile)) {
    debateTokenUsage = JSON.parse(
      fs.readFileSync(args.debateTokensFile, "utf-8")
    );
  } else {
    console.warn(
      "Warning: no debate token usage file provided. Token comparison will show 0 for debate."
    );
  }

  // Generate comparison
  console.log("Generating comparison report...");
  const report = generateComparisonReport({
    baselineResult,
    debateConsensus,
    debateTokenUsage,
    baselineTokenUsage: {
      inputTokens: baselineResult.tokenUsage.inputTokens,
      outputTokens: baselineResult.tokenUsage.outputTokens,
    },
  });

  // Output results
  const reportJsonPath = path.join(args.outputDir, "comparison-report.json");
  fs.writeFileSync(reportJsonPath, JSON.stringify(report, null, 2));
  console.log(`Report JSON saved to: ${reportJsonPath}`);

  const markdown = formatComparisonMarkdown(report);
  const reportMdPath = path.join(args.outputDir, "comparison-report.md");
  fs.writeFileSync(reportMdPath, markdown);
  console.log(`Report markdown saved to: ${reportMdPath}`);

  console.log("");
  console.log("=== Comparison Complete ===");
  console.log("");
  console.log(markdown);
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
