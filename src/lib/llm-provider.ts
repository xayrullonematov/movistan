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
} from "@/types/domain";

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
const REQUEST_TIMEOUT_MS = 30_000; // 30 seconds

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

    // Build request body
    const messages: { role: string; content: string }[] = [
      { role: "system", content: request.systemPrompt },
      { role: "user", content: request.userMessage },
    ];

    const body: Record<string, unknown> = {
      model,
      messages,
      temperature,
      max_tokens: maxTokens,
    };

    if (request.responseFormat === "json") {
      body.response_format = { type: "json_object" };
    }

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

        const content = data.choices?.[0]?.message?.content ?? "";
        const inputTokens = data.usage?.prompt_tokens ?? 0;
        const outputTokens = data.usage?.completion_tokens ?? 0;

        return {
          content,
          inputTokens,
          outputTokens,
          model,
        };
      } catch (error) {
        // Handle AbortError (timeout)
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

    const messages: { role: string; content: string }[] = [
      { role: "system", content: request.systemPrompt },
      { role: "user", content: request.userMessage },
    ];

    const body: Record<string, unknown> = {
      model,
      messages,
      temperature,
      max_tokens: maxTokens,
    };

    if (request.responseFormat === "json") {
      body.response_format = { type: "json_object" };
    }

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

        const content = data.choices?.[0]?.message?.content ?? "";
        const inputTokens = data.usage?.prompt_tokens ?? 0;
        const outputTokens = data.usage?.completion_tokens ?? 0;

        return {
          content,
          inputTokens,
          outputTokens,
          model,
        };
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

    const command = new ConverseCommand({
      modelId,
      system: systemBlocks,
      messages: [
        { role: "user", content: [{ text: request.userMessage }] },
      ],
      inferenceConfig: { temperature, maxTokens },
    });

    try {
      const response = await client.send(command);

      // ConverseCommand returns output.message.content as an array of blocks;
      // for text-only responses there's a single text block.
      const blocks = response.output?.message?.content ?? [];
      const content = blocks
        .map((b) => ("text" in b && typeof b.text === "string" ? b.text : ""))
        .join("");

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
