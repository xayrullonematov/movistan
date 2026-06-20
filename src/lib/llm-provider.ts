/**
 * LLM Provider — Abstraction layer over OpenAI-compatible API calls,
 * with an optional AWS Bedrock branch.
 *
 * Implements the LLMProvider interface with:
 * - Model tier support (different models for different stages)
 * - Retry logic with exponential backoff
 * - Rate-limit handling (Retry-After header)
 * - Timeout support (30s default)
 * - AbortController support for cancellation
 *
 * Backend selection (env):
 * - LLM_PROVIDER=bedrock → AWS Bedrock via ConverseCommand; credentials come
 *   from the standard AWS chain (env vars / ~/.aws/credentials / IAM role).
 * - anything else (default) → OpenAI-compatible HTTP at LLM_API_ENDPOINT.
 */

import {
  BedrockRuntimeClient,
  ConverseCommand,
} from "@aws-sdk/client-bedrock-runtime";
import type {
  LLMProvider,
  LLMRequest,
  LLMResponse,
  LLMProviderConfig,
  ModelTierConfig,
  ToolCallRequest,
} from "@/types/domain";

// =============================================================================
// REQUEST BUILDERS (shared between cancellable + non-cancellable providers)
// =============================================================================

type OpenAIMessage =
  | { role: "system" | "user"; content: string }
  | {
      role: "assistant";
      content: string | null;
      tool_calls?: Array<{
        id: string;
        type: "function";
        function: { name: string; arguments: string };
      }>;
    }
  | {
      role: "tool";
      content: string;
      tool_call_id: string;
      name?: string;
    };

/**
 * Build the OpenAI-compatible request body. When tools are provided, the
 * `response_format: json_object` flag is intentionally suppressed so the
 * model can emit `tool_calls`. JSON-schema enforcement happens on the final
 * non-tool response inside the tool-call loop.
 */
function buildOpenAIBody(
  request: LLMRequest,
  model: string,
  temperature: number,
  maxTokens: number
): Record<string, unknown> {
  const messages: OpenAIMessage[] = [
    { role: "system", content: request.systemPrompt },
    { role: "user", content: request.userMessage },
  ];
  if (request.extraMessages?.length) {
    for (const m of request.extraMessages) {
      if (m.role === "assistant") {
        messages.push({
          role: "assistant",
          content: m.content,
          tool_calls: m.tool_calls,
        });
      } else {
        messages.push({
          role: "tool",
          content: m.content ?? "",
          tool_call_id: m.tool_call_id ?? "",
          name: m.name,
        });
      }
    }
  }

  const body: Record<string, unknown> = {
    model,
    messages,
    temperature,
    max_tokens: maxTokens,
  };

  if (request.tools?.length) {
    body.tools = request.tools.map((t) => ({
      type: "function",
      function: {
        name: t.name,
        description: t.description,
        parameters: t.parameters,
      },
    }));
    if (request.toolChoice) {
      if (request.toolChoice === "auto" || request.toolChoice === "none") {
        body.tool_choice = request.toolChoice;
      } else {
        body.tool_choice = {
          type: "function",
          function: { name: request.toolChoice.name },
        };
      }
    }
    // NOTE: do NOT set response_format when tools are active.
  } else if (request.responseFormat === "json") {
    body.response_format = { type: "json_object" };
  }

  return body;
}

/**
 * Parse an OpenAI-compatible chat-completion response. Returns content,
 * usage, and (when the model invoked tools) a structured tool_calls list.
 */
function parseOpenAIResponse(
  data: unknown,
  model: string
): LLMResponse {
  const d = data as {
    choices?: Array<{
      message?: {
        content?: string | null;
        tool_calls?: Array<{
          id?: string;
          function?: { name?: string; arguments?: string };
        }>;
      };
      finish_reason?: string;
    }>;
    usage?: { prompt_tokens?: number; completion_tokens?: number };
  };
  const choice = d.choices?.[0];
  const content = choice?.message?.content ?? "";
  const rawToolCalls = choice?.message?.tool_calls ?? [];
  const toolCalls: ToolCallRequest[] = [];
  for (const tc of rawToolCalls) {
    if (!tc.id || !tc.function?.name) continue;
    let parsedArgs: Record<string, unknown> = {};
    if (tc.function.arguments) {
      try {
        const v = JSON.parse(tc.function.arguments);
        if (v && typeof v === "object") parsedArgs = v as Record<string, unknown>;
      } catch {
        // Leave parsedArgs empty — tool handler will fail validation
      }
    }
    toolCalls.push({ id: tc.id, name: tc.function.name, arguments: parsedArgs });
  }

  let finishReason: LLMResponse["finishReason"];
  switch (choice?.finish_reason) {
    case "stop":
      finishReason = "stop";
      break;
    case "tool_calls":
    case "function_call":
      finishReason = "tool_calls";
      break;
    case "length":
      finishReason = "length";
      break;
    default:
      finishReason = choice?.finish_reason ? "other" : undefined;
  }

  return {
    content: content ?? "",
    inputTokens: d.usage?.prompt_tokens ?? 0,
    outputTokens: d.usage?.completion_tokens ?? 0,
    model,
    toolCalls: toolCalls.length > 0 ? toolCalls : undefined,
    finishReason,
  };
}

// =============================================================================
// CONFIGURATION
// =============================================================================

/** Read LLM provider configuration from environment variables */
function loadConfig(): LLMProviderConfig {
  const apiKey = process.env.LLM_API_KEY ?? "";
  const baseUrl = process.env.LLM_API_ENDPOINT ?? "https://api.openai.com/v1";
  const defaultModel = process.env.LLM_MODEL ?? "gpt-4o";
  const summaryTier = process.env.LLM_MODEL_SUMMARY_TIER ?? "gpt-4o-mini";
  const critiqueTier = process.env.LLM_MODEL_CRITIQUE_TIER ?? "gpt-4o-mini";

  const modelTiers: ModelTierConfig = {
    proposal: defaultModel,
    critique: critiqueTier,
    revision: defaultModel,
    consensus: defaultModel,
    summary: summaryTier,
  };

  return {
    apiKey,
    baseUrl: baseUrl.replace(/\/$/, ""), // Strip trailing slash
    defaultModel,
    modelTiers,
    defaultTemperature: 0.7,
    // Sized so a complete ProposalOutput (~7 artifacts, multi-paragraph
    // content per artifact) fits in one call. 4096 was getting truncated,
    // forcing the schema validator to re-prompt — each retry shipped the
    // previous (long) response + error message back into the next call,
    // which doubled the proposal-stage spend.
    defaultMaxTokens: 12288,
  };
}

// =============================================================================
// RETRY LOGIC
// =============================================================================

/** Retry configuration */
const MAX_RETRIES = 3;
const BASE_DELAY_MS = 1000; // 1s, 2s, 4s
const REQUEST_TIMEOUT_MS = 120_000; // 120 seconds — consensus stage sends large prompts; qwen3-max needs time

/**
 * Determines if an error/response is retryable.
 * - 429 (rate limit): retryable
 * - 5xx (server error): retryable
 * - Timeout: retryable
 * - Other 4xx: NOT retryable
 */
function isRetryableStatus(status: number): boolean {
  return status === 429 || status >= 500;
}

/**
 * Calculate delay before next retry using exponential backoff.
 * Respects Retry-After header if present.
 */
function getRetryDelay(attempt: number, retryAfterHeader?: string | null): number {
  if (retryAfterHeader) {
    const retryAfterSeconds = parseInt(retryAfterHeader, 10);
    if (!isNaN(retryAfterSeconds) && retryAfterSeconds > 0) {
      return retryAfterSeconds * 1000;
    }
  }
  // Exponential backoff: 1s, 2s, 4s
  return BASE_DELAY_MS * Math.pow(2, attempt);
}

/** Sleep for a given number of milliseconds */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// =============================================================================
// LLM PROVIDER IMPLEMENTATION
// =============================================================================

/** Error thrown when LLM API call fails after all retries */
export class LLMProviderError extends Error {
  public readonly statusCode: number | null;
  public readonly retryable: boolean;

  constructor(message: string, statusCode: number | null = null, retryable = false) {
    super(message);
    this.name = "LLMProviderError";
    this.statusCode = statusCode;
    this.retryable = retryable;
  }
}

/**
 * Creates an LLM provider instance that implements the LLMProvider interface.
 * Uses native fetch (Node 18+) for the OpenAI-compatible path, or the AWS SDK
 * for the Bedrock path (LLM_PROVIDER=bedrock).
 */
export function createLLMProvider(configOverride?: Partial<LLMProviderConfig>): LLMProvider {
  const config = { ...loadConfig(), ...configOverride };

  if ((process.env.LLM_PROVIDER ?? "").toLowerCase() === "bedrock") {
    return createBedrockProvider(config);
  }

  async function complete(request: LLMRequest, modelOverride?: string): Promise<LLMResponse> {
    const model = modelOverride ?? config.defaultModel;
    const temperature = request.temperature ?? config.defaultTemperature;
    const maxTokens = request.maxTokens ?? config.defaultMaxTokens;

    const body = buildOpenAIBody(request, model, temperature, maxTokens);

    const url = `${config.baseUrl}/chat/completions`;
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      Authorization: `Bearer ${config.apiKey}`,
    };

    // Retry loop
    let lastError: Error | null = null;

    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
      try {
        // Create an AbortController for timeout
        const timeoutController = new AbortController();
        const timeoutId = setTimeout(() => timeoutController.abort(), REQUEST_TIMEOUT_MS);

        let response: Response;
        try {
          response = await fetch(url, {
            method: "POST",
            headers,
            body: JSON.stringify(body),
            signal: timeoutController.signal,
          });
        } finally {
          clearTimeout(timeoutId);
        }

        // Handle non-retryable 4xx errors (except 429)
        if (response.status >= 400 && response.status < 500 && response.status !== 429) {
          const errorBody = await response.text().catch(() => "Unknown error");
          throw new LLMProviderError(
            `LLM API returned ${response.status}: ${errorBody}`,
            response.status,
            false
          );
        }

        // Handle retryable errors (429, 5xx)
        if (!response.ok) {
          if (isRetryableStatus(response.status)) {
            if (attempt < MAX_RETRIES) {
              const retryAfter = response.headers.get("Retry-After");
              const delay = getRetryDelay(attempt, retryAfter);
              await sleep(delay);
              continue;
            }
            const errorBody = await response.text().catch(() => "Unknown error");
            throw new LLMProviderError(
              `LLM API returned ${response.status} after ${MAX_RETRIES} retries: ${errorBody}`,
              response.status,
              true
            );
          }
          // Unexpected status
          const errorBody = await response.text().catch(() => "Unknown error");
          throw new LLMProviderError(
            `LLM API returned unexpected status ${response.status}: ${errorBody}`,
            response.status,
            false
          );
        }

        // Parse successful response
        const data = await response.json();
        return parseOpenAIResponse(data, model);
      } catch (error) {
        // Handle AbortError (timeout) — retry once (transient slowness) then fail fast
        if (error instanceof Error && error.name === "AbortError") {
          if (attempt < 1) {
            await sleep(BASE_DELAY_MS);
            lastError = error;
            continue;
          }
          throw new LLMProviderError(
            `LLM API request timed out after ${REQUEST_TIMEOUT_MS}ms (1 retry exhausted)`,
            null,
            true
          );
        }

        // Re-throw non-retryable LLMProviderErrors immediately
        if (error instanceof LLMProviderError && !error.retryable) {
          throw error;
        }

        // For network errors and other unexpected errors, retry
        if (error instanceof Error) {
          lastError = error;
          if (attempt < MAX_RETRIES) {
            const delay = getRetryDelay(attempt);
            await sleep(delay);
            continue;
          }
        }

        // All retries exhausted
        throw error instanceof LLMProviderError
          ? error
          : new LLMProviderError(
              `LLM API request failed after ${MAX_RETRIES} retries: ${lastError?.message ?? "Unknown error"}`,
              null,
              true
            );
      }
    }

    // Should not reach here, but just in case
    throw new LLMProviderError(
      `LLM API request failed after ${MAX_RETRIES} retries: ${lastError?.message ?? "Unknown error"}`,
      null,
      true
    );
  }

  return { complete };
}

/**
 * Creates an LLM provider with AbortSignal support for cancellation.
 * This wraps the base provider and injects the signal into fetch calls.
 */
export function createCancellableLLMProvider(
  signal?: AbortSignal,
  configOverride?: Partial<LLMProviderConfig>
): LLMProvider {
  const config = { ...loadConfig(), ...configOverride };

  async function complete(request: LLMRequest, modelOverride?: string): Promise<LLMResponse> {
    const model = modelOverride ?? config.defaultModel;
    const temperature = request.temperature ?? config.defaultTemperature;
    const maxTokens = request.maxTokens ?? config.defaultMaxTokens;

    const body = buildOpenAIBody(request, model, temperature, maxTokens);

    const url = `${config.baseUrl}/chat/completions`;
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      Authorization: `Bearer ${config.apiKey}`,
    };

    let lastError: Error | null = null;

    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
      // Check if already aborted before making request
      if (signal?.aborted) {
        throw new LLMProviderError("Request cancelled", null, false);
      }

      try {
        // Combine timeout and external abort signal
        const timeoutController = new AbortController();
        const timeoutId = setTimeout(() => timeoutController.abort(), REQUEST_TIMEOUT_MS);

        // If external signal aborts, also abort the timeout controller
        const onExternalAbort = () => timeoutController.abort();
        signal?.addEventListener("abort", onExternalAbort, { once: true });

        let response: Response;
        try {
          response = await fetch(url, {
            method: "POST",
            headers,
            body: JSON.stringify(body),
            signal: timeoutController.signal,
          });
        } finally {
          clearTimeout(timeoutId);
          signal?.removeEventListener("abort", onExternalAbort);
        }

        // Check if cancelled by external signal
        if (signal?.aborted) {
          throw new LLMProviderError("Request cancelled", null, false);
        }

        // Handle non-retryable 4xx errors (except 429)
        if (response.status >= 400 && response.status < 500 && response.status !== 429) {
          const errorBody = await response.text().catch(() => "Unknown error");
          throw new LLMProviderError(
            `LLM API returned ${response.status}: ${errorBody}`,
            response.status,
            false
          );
        }

        // Handle retryable errors (429, 5xx)
        if (!response.ok) {
          if (isRetryableStatus(response.status)) {
            if (attempt < MAX_RETRIES) {
              const retryAfter = response.headers.get("Retry-After");
              const delay = getRetryDelay(attempt, retryAfter);
              await sleep(delay);
              continue;
            }
            const errorBody = await response.text().catch(() => "Unknown error");
            throw new LLMProviderError(
              `LLM API returned ${response.status} after ${MAX_RETRIES} retries: ${errorBody}`,
              response.status,
              true
            );
          }
          const errorBody = await response.text().catch(() => "Unknown error");
          throw new LLMProviderError(
            `LLM API returned unexpected status ${response.status}: ${errorBody}`,
            response.status,
            false
          );
        }

        // Parse successful response
        const data = await response.json();
        return parseOpenAIResponse(data, model);
      } catch (error) {
        // Handle external abort
        if (signal?.aborted) {
          throw new LLMProviderError("Request cancelled", null, false);
        }

        // Handle timeout (AbortError from timeout controller)
        if (error instanceof Error && error.name === "AbortError") {
          if (attempt < MAX_RETRIES) {
            const delay = getRetryDelay(attempt);
            await sleep(delay);
            lastError = error;
            continue;
          }
          throw new LLMProviderError(
            `LLM API request timed out after ${REQUEST_TIMEOUT_MS}ms (${MAX_RETRIES} retries exhausted)`,
            null,
            true
          );
        }

        // Re-throw non-retryable errors immediately
        if (error instanceof LLMProviderError && !error.retryable) {
          throw error;
        }

        // For network errors and other unexpected errors, retry
        if (error instanceof Error) {
          lastError = error;
          if (attempt < MAX_RETRIES) {
            const delay = getRetryDelay(attempt);
            await sleep(delay);
            continue;
          }
        }

        throw error instanceof LLMProviderError
          ? error
          : new LLMProviderError(
              `LLM API request failed after ${MAX_RETRIES} retries: ${lastError?.message ?? "Unknown error"}`,
              null,
              true
            );
      }
    }

    throw new LLMProviderError(
      `LLM API request failed after ${MAX_RETRIES} retries: ${lastError?.message ?? "Unknown error"}`,
      null,
      true
    );
  }

  return { complete };
}

// =============================================================================
// AWS BEDROCK PROVIDER (ConverseCommand)
//
// Used when LLM_PROVIDER=bedrock. Credentials and region resolve through the
// AWS SDK default credential chain (env vars → ~/.aws/credentials → IAM role).
// AWS_REGION (or AWS_DEFAULT_REGION) selects the region; default us-east-1.
//
// JSON output: Bedrock has no native response_format flag. The agent prompts
// already include "Return ONLY valid JSON…" instructions and the validator
// retries 2× on schema failure, so this is handled at the layer above.
// =============================================================================

function createBedrockProvider(config: LLMProviderConfig): LLMProvider {
  const region =
    process.env.AWS_REGION ?? process.env.AWS_DEFAULT_REGION ?? "us-east-1";
  const client = new BedrockRuntimeClient({ region });

  async function complete(
    request: LLMRequest,
    modelOverride?: string
  ): Promise<LLMResponse> {
    const modelId = modelOverride ?? config.defaultModel;
    const temperature = request.temperature ?? config.defaultTemperature;
    const maxTokens = request.maxTokens ?? config.defaultMaxTokens;

    // Prompt-cache strategy:
    //  - If the prompt builder provided systemPromptStable +
    //    systemPromptStageSpecific, emit two cachePoints: one after the
    //    stable per-agent block (shared across proposal/critique/revision,
    //    and across rounds), one after the full system (catches within-stage
    //    retries). Anthropic on Bedrock requires the cached prefix to be
    //    ≥ 1024 tokens for Sonnet / ≥ 2048 for Haiku — falls back to a
    //    single cachePoint when only `systemPrompt` is set.
    //  - First call writes cache at ~1.25× input cost; reads cost ~10%.
    //    Net win after ≥ 1 reuse (retries, same agent in the next stage,
    //    same agent in the next round).
    const systemBlocks =
      request.systemPromptStable && request.systemPromptStageSpecific
        ? [
            { text: request.systemPromptStable },
            { cachePoint: { type: "default" as const } },
            { text: request.systemPromptStageSpecific },
            { cachePoint: { type: "default" as const } },
          ]
        : [
            { text: request.systemPrompt },
            { cachePoint: { type: "default" as const } },
          ];

    // Build the messages array. The initial turn is always [user].
    // Subsequent tool-loop turns append the assistant's prior tool_use blocks
    // and the user's tool_result blocks in OpenAI-compat shape via
    // request.extraMessages — we map them here to Bedrock content blocks.
    type BedrockBlock =
      | { text: string }
      | { toolUse: { toolUseId: string; name: string; input: unknown } }
      | {
          toolResult: {
            toolUseId: string;
            content: Array<{ text: string }>;
            status?: "success" | "error";
          };
        };
    const messages: Array<{ role: "user" | "assistant"; content: BedrockBlock[] }> = [
      { role: "user", content: [{ text: request.userMessage }] },
    ];
    if (request.extraMessages?.length) {
      for (const m of request.extraMessages) {
        if (m.role === "assistant") {
          const blocks: BedrockBlock[] = [];
          if (m.content) blocks.push({ text: m.content });
          for (const tc of m.tool_calls ?? []) {
            let input: unknown = {};
            try {
              input = tc.function.arguments ? JSON.parse(tc.function.arguments) : {};
            } catch {
              input = {};
            }
            blocks.push({
              toolUse: { toolUseId: tc.id, name: tc.function.name, input },
            });
          }
          messages.push({ role: "assistant", content: blocks });
        } else {
          // role === "tool" → folds into the next user turn
          messages.push({
            role: "user",
            content: [
              {
                toolResult: {
                  toolUseId: m.tool_call_id ?? "",
                  content: [{ text: m.content ?? "" }],
                },
              },
            ],
          });
        }
      }
    }

    // Bedrock toolConfig — only set when the caller wants tools active.
    let toolConfig:
      | {
          tools: Array<{
            toolSpec: {
              name: string;
              description: string;
              inputSchema: { json: Record<string, unknown> };
            };
          }>;
          toolChoice?: { auto: object } | { tool: { name: string } };
        }
      | undefined;
    if (request.tools?.length) {
      toolConfig = {
        tools: request.tools.map((t) => ({
          toolSpec: {
            name: t.name,
            description: t.description,
            inputSchema: { json: t.parameters as Record<string, unknown> },
          },
        })),
      };
      if (request.toolChoice && request.toolChoice !== "none") {
        toolConfig.toolChoice =
          typeof request.toolChoice === "object"
            ? { tool: { name: request.toolChoice.name } }
            : { auto: {} };
      }
    }

    // Bedrock's ContentBlock is a discriminated union with $unknown that the
    // SDK validates at the boundary; our internal BedrockBlock type is the
    // subset we actually emit (text / toolUse / toolResult). The cast is
    // safe because every block we construct above matches one of those
    // variants.
    const command = new ConverseCommand({
      modelId,
      system: systemBlocks,
      messages: messages as unknown as ConstructorParameters<
        typeof ConverseCommand
      >[0]["messages"],
      inferenceConfig: { temperature, maxTokens },
      ...(toolConfig
        ? {
            toolConfig: toolConfig as unknown as ConstructorParameters<
              typeof ConverseCommand
            >[0]["toolConfig"],
          }
        : {}),
    });

    try {
      const response = await client.send(command);

      // ConverseCommand returns output.message.content as an array of blocks;
      // for text-only responses there's a single text block. With tools active
      // the model can also return toolUse blocks alongside (or instead of) text.
      const blocks = response.output?.message?.content ?? [];
      let content = "";
      const toolCalls: ToolCallRequest[] = [];
      for (const b of blocks) {
        if ("text" in b && typeof b.text === "string") {
          content += b.text;
        } else if (
          "toolUse" in b &&
          b.toolUse &&
          typeof b.toolUse.toolUseId === "string" &&
          typeof b.toolUse.name === "string"
        ) {
          const args =
            b.toolUse.input && typeof b.toolUse.input === "object"
              ? (b.toolUse.input as Record<string, unknown>)
              : {};
          toolCalls.push({
            id: b.toolUse.toolUseId,
            name: b.toolUse.name,
            arguments: args,
          });
        }
      }

      let finishReason: LLMResponse["finishReason"];
      switch (response.stopReason) {
        case "end_turn":
        case "stop_sequence":
          finishReason = "stop";
          break;
        case "tool_use":
          finishReason = "tool_calls";
          break;
        case "max_tokens":
          finishReason = "length";
          break;
        default:
          finishReason = response.stopReason ? "other" : undefined;
      }

      // Bedrock bills cache reads at ~10% of the full input rate and cache
      // writes at ~125%. Counting them into inputTokens at full weight would
      // make the budget guardrail and the cost estimate badly over-count once
      // caching is doing its job. We weight them to their billing ratios so
      // the single inputTokens number is a billable-equivalent.
      const u = response.usage;
      const inputTokens =
        (u?.inputTokens ?? 0) +
        Math.round((u?.cacheReadInputTokens ?? 0) * 0.1) +
        Math.round((u?.cacheWriteInputTokens ?? 0) * 1.25);

      return {
        content,
        inputTokens,
        outputTokens: u?.outputTokens ?? 0,
        model: modelId,
        toolCalls: toolCalls.length > 0 ? toolCalls : undefined,
        finishReason,
      };
    } catch (error) {
      const status =
        (error as { $metadata?: { httpStatusCode?: number } })?.$metadata
          ?.httpStatusCode ?? null;
      const name = (error as Error)?.name ?? "BedrockError";
      const message = (error as Error)?.message ?? String(error);
      const retryable =
        name === "ThrottlingException" ||
        name === "ServiceUnavailableException" ||
        (status !== null && status >= 500);
      throw new LLMProviderError(
        `Bedrock ${name}${status ? ` (${status})` : ""}: ${message}`,
        status,
        retryable
      );
    }
  }

  return { complete };
}
