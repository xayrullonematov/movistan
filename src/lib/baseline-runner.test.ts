import { describe, it, expect, vi, beforeEach } from "vitest";
import { runBaseline, type BaselineRunnerConfig } from "./baseline-runner";
import type { LLMProvider, LLMResponse, ToolCallRequest } from "@/types/domain";
import { MAX_TOOL_CALLS_PER_AGENT } from "./agent-tool-loop";

// =============================================================================
// HELPERS
// =============================================================================

/** A valid ProposalOutput matching the schema */
const VALID_PROPOSAL = {
  summary: "A comprehensive engineering assessment covering all disciplines.",
  recommendations: [
    "Refactor authentication module for better separation of concerns",
    "Add rate limiting to public API endpoints",
    "Implement connection pooling for database access",
  ],
  risks: [
    {
      description: "SQL injection vulnerability in query builder",
      severity: "high",
      mitigation: "Use parameterized queries consistently",
    },
    {
      description: "No horizontal scaling strategy",
      severity: "medium",
      mitigation: "Introduce stateless session handling",
    },
  ],
  assumptions: [
    "The application runs behind a reverse proxy",
    "Database is PostgreSQL 14+",
  ],
  confidence: 0.82,
  artifactSuggestions: [
    {
      type: "recommendation" as const,
      title: "Migrate to parameterized queries",
      content: "Replace string concatenation in query builder with parameterized queries.",
    },
  ],
  references: [
    { description: "src/db/query-builder.ts line 45 - raw SQL concatenation" },
  ],
  needsClarification: false,
};

function makeToolCall(
  name: string,
  args: object,
  id = `call_${name}`
): ToolCallRequest {
  return { id, name, arguments: args as Record<string, unknown> };
}

function makeProvider(scripted: LLMResponse[]): LLMProvider {
  let idx = 0;
  return {
    complete: vi.fn(async () => {
      const r = scripted[idx];
      idx++;
      if (!r) throw new Error(`No scripted response at index ${idx - 1}`);
      return r;
    }),
  };
}

function makeConfig(provider: LLMProvider): BaselineRunnerConfig {
  return {
    repoOwner: "test-owner",
    repo: "test-repo",
    branch: "main",
    problemDescription: "Should we adopt a microservices architecture?",
    model: "test-model",
    entries: [
      { path: "README.md", size: 100 },
      { path: "src/index.ts", size: 200 },
      { path: "src/db/query-builder.ts", size: 500 },
    ],
    llmProvider: provider,
  };
}

// =============================================================================
// TESTS
// =============================================================================

describe("runBaseline - successful run", () => {
  it("produces valid ProposalOutput when LLM returns correct JSON on first try", async () => {
    const provider = makeProvider([
      {
        content: JSON.stringify(VALID_PROPOSAL),
        inputTokens: 500,
        outputTokens: 200,
        model: "test-model",
      },
    ]);

    const result = await runBaseline(makeConfig(provider));

    expect(result.output).toEqual(VALID_PROPOSAL);
    expect(result.output.summary).toBe(VALID_PROPOSAL.summary);
    expect(result.output.recommendations).toHaveLength(3);
    expect(result.output.risks).toHaveLength(2);
    expect(result.output.confidence).toBe(0.82);
    expect(result.output.needsClarification).toBe(false);
  });

  it("returns correct token usage from tool loop", async () => {
    const provider = makeProvider([
      {
        content: JSON.stringify(VALID_PROPOSAL),
        inputTokens: 500,
        outputTokens: 200,
        model: "test-model",
      },
    ]);

    const result = await runBaseline(makeConfig(provider));

    expect(result.tokenUsage).toEqual({
      inputTokens: 500,
      outputTokens: 200,
      model: "test-model",
    });
  });

  it("returns toolStats with zero calls when no tools are used", async () => {
    const provider = makeProvider([
      {
        content: JSON.stringify(VALID_PROPOSAL),
        inputTokens: 500,
        outputTokens: 200,
        model: "test-model",
      },
    ]);

    const result = await runBaseline(makeConfig(provider));

    expect(result.toolStats).toEqual({
      toolCallCount: 0,
      capHit: false,
      filesRead: [],
    });
  });
});

describe("runBaseline - tool loop invocation", () => {
  it("invokes tool loop with correct parameters (same model, same cap)", async () => {
    // Model makes one list_files call, then returns the proposal
    const provider = makeProvider([
      {
        content: "",
        inputTokens: 100,
        outputTokens: 10,
        model: "test-model",
        toolCalls: [makeToolCall("list_files", { filter: "src/" })],
        finishReason: "tool_calls" as const,
      },
      {
        content: JSON.stringify(VALID_PROPOSAL),
        inputTokens: 400,
        outputTokens: 200,
        model: "test-model",
      },
    ]);

    const result = await runBaseline(makeConfig(provider));

    expect(result.output).toEqual(VALID_PROPOSAL);
    expect(result.toolStats.toolCallCount).toBe(1);
    expect(result.toolStats.capHit).toBe(false);

    // Verify the provider was called with tools on the first request
    const calls = (provider.complete as ReturnType<typeof vi.fn>).mock.calls;
    expect(calls.length).toBe(2);
    const firstRequest = calls[0][0];
    expect(firstRequest.tools).toBeDefined();
    expect(firstRequest.tools).toHaveLength(3); // list_files, read_file, search_code
  });

  it("uses the same 6-call cap as debate agents", async () => {
    // Simulate the model hitting the cap by making MAX_TOOL_CALLS_PER_AGENT tool calls
    const scripted: LLMResponse[] = [];
    for (let i = 0; i < MAX_TOOL_CALLS_PER_AGENT; i++) {
      scripted.push({
        content: "",
        inputTokens: 50,
        outputTokens: 10,
        model: "test-model",
        toolCalls: [makeToolCall("list_files", {}, `call_${i}`)],
        finishReason: "tool_calls" as const,
      });
    }
    // Final forced response after cap hit
    scripted.push({
      content: JSON.stringify(VALID_PROPOSAL),
      inputTokens: 200,
      outputTokens: 150,
      model: "test-model",
    });

    const provider = makeProvider(scripted);
    const result = await runBaseline(makeConfig(provider));

    expect(result.toolStats.toolCallCount).toBe(MAX_TOOL_CALLS_PER_AGENT);
    expect(result.toolStats.capHit).toBe(true);
    expect(result.output).toEqual(VALID_PROPOSAL);

    // Verify final call had no tools (forced JSON output)
    const calls = (provider.complete as ReturnType<typeof vi.fn>).mock.calls;
    const lastRequest = calls[calls.length - 1][0];
    expect(lastRequest.tools).toBeUndefined();
  });

  it("aggregates token usage across multiple tool loop turns", async () => {
    const provider = makeProvider([
      {
        content: "",
        inputTokens: 100,
        outputTokens: 20,
        model: "test-model",
        toolCalls: [makeToolCall("list_files", {})],
        finishReason: "tool_calls" as const,
      },
      {
        content: "",
        inputTokens: 150,
        outputTokens: 25,
        model: "test-model",
        toolCalls: [makeToolCall("list_files", { filter: "src/" })],
        finishReason: "tool_calls" as const,
      },
      {
        content: JSON.stringify(VALID_PROPOSAL),
        inputTokens: 300,
        outputTokens: 180,
        model: "test-model",
      },
    ]);

    const result = await runBaseline(makeConfig(provider));

    expect(result.tokenUsage.inputTokens).toBe(100 + 150 + 300);
    expect(result.tokenUsage.outputTokens).toBe(20 + 25 + 180);
  });
});

describe("runBaseline - validation retry logic", () => {
  it("retries on malformed first response and succeeds on second attempt", async () => {
    const provider = makeProvider([
      // First response from tool loop: invalid JSON
      {
        content: "This is not valid JSON at all",
        inputTokens: 500,
        outputTokens: 50,
        model: "test-model",
      },
      // Retry response (no tools): valid JSON
      {
        content: JSON.stringify(VALID_PROPOSAL),
        inputTokens: 600,
        outputTokens: 200,
        model: "test-model",
      },
    ]);

    const result = await runBaseline(makeConfig(provider));

    expect(result.output).toEqual(VALID_PROPOSAL);
    // Token usage should be aggregated from both calls
    expect(result.tokenUsage.inputTokens).toBe(500 + 600);
    expect(result.tokenUsage.outputTokens).toBe(50 + 200);
  });

  it("retries up to 2 times on validation failure", async () => {
    const provider = makeProvider([
      // Tool loop final: invalid
      {
        content: '{"invalid": true}',
        inputTokens: 100,
        outputTokens: 10,
        model: "test-model",
      },
      // Retry 1: still invalid
      {
        content: '{"still_invalid": true}',
        inputTokens: 100,
        outputTokens: 10,
        model: "test-model",
      },
      // Retry 2: valid
      {
        content: JSON.stringify(VALID_PROPOSAL),
        inputTokens: 100,
        outputTokens: 200,
        model: "test-model",
      },
    ]);

    const result = await runBaseline(makeConfig(provider));
    expect(result.output).toEqual(VALID_PROPOSAL);
  });

  it("throws after exhausting all retries", async () => {
    const provider = makeProvider([
      // Tool loop final: invalid
      {
        content: '{"bad": 1}',
        inputTokens: 100,
        outputTokens: 10,
        model: "test-model",
      },
      // Retry 1: invalid
      {
        content: '{"bad": 2}',
        inputTokens: 100,
        outputTokens: 10,
        model: "test-model",
      },
      // Retry 2: still invalid
      {
        content: '{"bad": 3}',
        inputTokens: 100,
        outputTokens: 10,
        model: "test-model",
      },
    ]);

    await expect(runBaseline(makeConfig(provider))).rejects.toThrow(
      /Baseline validation failed after 3 attempts/
    );
  });

  it("includes error feedback in retry prompts", async () => {
    const provider = makeProvider([
      // Tool loop: invalid response
      {
        content: '{"summary": 123}', // summary should be string
        inputTokens: 100,
        outputTokens: 10,
        model: "test-model",
      },
      // Retry: valid
      {
        content: JSON.stringify(VALID_PROPOSAL),
        inputTokens: 100,
        outputTokens: 200,
        model: "test-model",
      },
    ]);

    await runBaseline(makeConfig(provider));

    // The retry call should include error feedback
    const calls = (provider.complete as ReturnType<typeof vi.fn>).mock.calls;
    expect(calls.length).toBe(2);
    const retryRequest = calls[1][0];
    expect(retryRequest.userMessage).toContain("invalid");
    expect(retryRequest.userMessage).toContain("Previous invalid response");
  });
});

describe("runBaseline - prompt content", () => {
  it("system prompt covers all four disciplines", async () => {
    const provider = makeProvider([
      {
        content: JSON.stringify(VALID_PROPOSAL),
        inputTokens: 500,
        outputTokens: 200,
        model: "test-model",
      },
    ]);

    await runBaseline(makeConfig(provider));

    const calls = (provider.complete as ReturnType<typeof vi.fn>).mock.calls;
    const systemPrompt = calls[0][0].systemPrompt;
    expect(systemPrompt).toContain("ARCHITECTURE");
    expect(systemPrompt).toContain("SECURITY");
    expect(systemPrompt).toContain("PERFORMANCE");
    expect(systemPrompt).toContain("PRODUCT");
  });

  it("user message includes the problem description", async () => {
    const provider = makeProvider([
      {
        content: JSON.stringify(VALID_PROPOSAL),
        inputTokens: 500,
        outputTokens: 200,
        model: "test-model",
      },
    ]);

    const config = makeConfig(provider);
    config.problemDescription = "Evaluate the migration to GraphQL";
    await runBaseline(config);

    const calls = (provider.complete as ReturnType<typeof vi.fn>).mock.calls;
    const userMessage = calls[0][0].userMessage;
    expect(userMessage).toContain("Evaluate the migration to GraphQL");
  });

  it("uses the same 3 tool definitions as debate agents", async () => {
    const provider = makeProvider([
      {
        content: JSON.stringify(VALID_PROPOSAL),
        inputTokens: 500,
        outputTokens: 200,
        model: "test-model",
      },
    ]);

    await runBaseline(makeConfig(provider));

    const calls = (provider.complete as ReturnType<typeof vi.fn>).mock.calls;
    const firstRequest = calls[0][0];
    // When the model can still make tool calls, tools should be defined
    expect(firstRequest.tools).toBeDefined();
    const toolNames = firstRequest.tools.map(
      (t: { name: string }) => t.name
    );
    expect(toolNames).toContain("list_files");
    expect(toolNames).toContain("read_file");
    expect(toolNames).toContain("search_code");
    expect(toolNames).toHaveLength(3);
  });
});
