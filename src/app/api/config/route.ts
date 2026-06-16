/**
 * Config API Route
 *
 * GET /api/config - Get current LLM configuration (never exposes API key)
 * PUT /api/config - Update LLM configuration (in-memory for MVP)
 *
 * For MVP, configuration is read from environment variables on startup
 * and can be overridden in-memory via PUT. Restarts reset to env defaults.
 */

import { NextResponse } from "next/server";
import type { ModelTierConfig } from "@/types/domain";

// =============================================================================
// IN-MEMORY CONFIG STORE (MVP — persists until server restart)
// =============================================================================

interface AppConfig {
  baseUrl: string;
  model: string;
  modelTiers: ModelTierConfig;
  temperature: number;
  maxTokens: number;
  defaultTokenBudget: number | null;
}

/** Load defaults from environment variables */
function loadDefaults(): AppConfig {
  const defaultModel = process.env.LLM_MODEL ?? "gpt-4o";
  const summaryTier = process.env.LLM_MODEL_SUMMARY_TIER ?? "gpt-4o-mini";
  const critiqueTier = process.env.LLM_MODEL_CRITIQUE_TIER ?? "gpt-4o-mini";

  return {
    baseUrl: process.env.LLM_API_ENDPOINT ?? "https://api.openai.com/v1",
    model: defaultModel,
    modelTiers: {
      proposal: defaultModel,
      critique: critiqueTier,
      revision: defaultModel,
      consensus: defaultModel,
      summary: summaryTier,
    },
    temperature: 0.7,
    maxTokens: 4096,
    defaultTokenBudget: process.env.DEFAULT_TOKEN_BUDGET
      ? parseInt(process.env.DEFAULT_TOKEN_BUDGET, 10)
      : null,
  };
}

// Initialize config from env on module load
const currentConfig: AppConfig = loadDefaults();

// =============================================================================
// GET /api/config
// =============================================================================

export async function GET() {
  try {
    // NEVER return the API key
    return NextResponse.json({
      config: {
        baseUrl: currentConfig.baseUrl,
        model: currentConfig.model,
        modelTiers: currentConfig.modelTiers,
        temperature: currentConfig.temperature,
        maxTokens: currentConfig.maxTokens,
        defaultTokenBudget: currentConfig.defaultTokenBudget,
      },
    });
  } catch (error) {
    console.error("GET /api/config error:", error);
    return NextResponse.json(
      { error: "Failed to get configuration" },
      { status: 500 }
    );
  }
}

// =============================================================================
// PUT /api/config
// =============================================================================

export async function PUT(request: Request) {
  try {
    const body = (await request.json()) as Partial<AppConfig>;

    // Update only provided fields
    if (body.baseUrl !== undefined && typeof body.baseUrl === "string") {
      currentConfig.baseUrl = body.baseUrl;
    }

    if (body.model !== undefined && typeof body.model === "string") {
      currentConfig.model = body.model;
    }

    if (body.modelTiers !== undefined && typeof body.modelTiers === "object") {
      currentConfig.modelTiers = {
        ...currentConfig.modelTiers,
        ...body.modelTiers,
      };
    }

    if (body.temperature !== undefined && typeof body.temperature === "number") {
      if (body.temperature < 0 || body.temperature > 2) {
        return NextResponse.json(
          { error: "temperature must be between 0 and 2" },
          { status: 400 }
        );
      }
      currentConfig.temperature = body.temperature;
    }

    if (body.maxTokens !== undefined && typeof body.maxTokens === "number") {
      if (body.maxTokens < 1 || body.maxTokens > 128000) {
        return NextResponse.json(
          { error: "maxTokens must be between 1 and 128000" },
          { status: 400 }
        );
      }
      currentConfig.maxTokens = body.maxTokens;
    }

    if (body.defaultTokenBudget !== undefined) {
      currentConfig.defaultTokenBudget =
        body.defaultTokenBudget === null ? null : Number(body.defaultTokenBudget);
    }

    return NextResponse.json({
      config: {
        baseUrl: currentConfig.baseUrl,
        model: currentConfig.model,
        modelTiers: currentConfig.modelTiers,
        temperature: currentConfig.temperature,
        maxTokens: currentConfig.maxTokens,
        defaultTokenBudget: currentConfig.defaultTokenBudget,
      },
    });
  } catch (error) {
    console.error("PUT /api/config error:", error);
    return NextResponse.json(
      { error: "Failed to update configuration" },
      { status: 500 }
    );
  }
}
