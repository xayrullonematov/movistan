"use client";

import { useMemo, useState } from "react";
import { useConfig, type AppConfig } from "@/hooks/useConfig";
import { toast } from "@/hooks/useToast";
import FormShell, { Field, inputClass } from "./FormShell";
import SettingsLoadingState from "./LoadingState";

const providerPresets = [
  {
    id: "openai",
    label: "OpenAI compatible",
    description: "OpenAI's API or any OpenAI-compatible endpoint (Together, Groq, vLLM, etc.).",
    baseUrl: "https://api.openai.com/v1",
  },
  {
    id: "bedrock",
    label: "AWS Bedrock (proxy)",
    description: "Bedrock fronted by an OpenAI-compatible proxy. The default uses the LiteLLM-style path.",
    baseUrl: "https://bedrock.litellm.proxy/v1",
  },
  {
    id: "custom",
    label: "Custom endpoint",
    description: "A self-hosted or otherwise non-listed endpoint.",
    baseUrl: "",
  },
] as const;

type ProviderId = (typeof providerPresets)[number]["id"];

function detectProvider(baseUrl: string): ProviderId {
  const url = baseUrl.toLowerCase();
  if (url.includes("openai.com")) return "openai";
  if (url.includes("bedrock")) return "bedrock";
  return "custom";
}

export default function ProvidersTab() {
  const { config, isLoading, error, update } = useConfig();

  if (isLoading || !config) return <SettingsLoadingState />;
  if (error) {
    return (
      <div className="rounded-md border border-red-500/30 bg-red-500/10 p-3 text-xs text-red-200">
        Failed to load configuration: {error.message}
      </div>
    );
  }

  return <ProvidersForm initial={config} update={update} />;
}

interface ProvidersFormProps {
  initial: AppConfig;
  update: (patch: Partial<AppConfig>) => Promise<AppConfig>;
}

function ProvidersForm({ initial, update }: ProvidersFormProps) {
  const [provider, setProvider] = useState<ProviderId>(detectProvider(initial.baseUrl));
  const [baseUrl, setBaseUrl] = useState(initial.baseUrl);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const activePreset = useMemo(
    () => providerPresets.find((p) => p.id === provider)!,
    [provider],
  );

  return (
    <FormShell
      title="Provider endpoint"
      description="Choose where agent calls are sent. The API key is read from server-side environment variables and is never sent to the browser."
      saving={saving}
      error={saveError}
      footer="Pick a preset to suggest a base URL — you can still edit it."
      onSubmit={async (e) => {
        e.preventDefault();
        setSaveError(null);
        const trimmed = baseUrl.trim();
        if (!trimmed) {
          setSaveError("Base URL is required.");
          return;
        }
        try {
          new URL(trimmed);
        } catch {
          setSaveError("Base URL must be a valid URL (including https://).");
          return;
        }
        setSaving(true);
        try {
          await update({ baseUrl: trimmed });
          toast.success({ message: "Provider updated", description: "Agents will use the new endpoint on next call." });
        } catch (err) {
          const message = err instanceof Error ? err.message : "Save failed";
          setSaveError(message);
          toast.error({ message: "Could not save provider", description: message });
        } finally {
          setSaving(false);
        }
      }}
    >
      <fieldset className="space-y-2">
        <legend className="block text-xs font-medium text-gray-200">Preset</legend>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
          {providerPresets.map((preset) => {
            const selected = provider === preset.id;
            return (
              <label
                key={preset.id}
                className={`cursor-pointer rounded-lg border px-3 py-2.5 text-xs transition-colors ${
                  selected
                    ? "border-blue-500/60 bg-blue-500/10 text-blue-100"
                    : "border-gray-800 bg-gray-950/40 text-gray-300 hover:border-gray-700"
                }`}
              >
                <input
                  type="radio"
                  name="provider"
                  value={preset.id}
                  checked={selected}
                  onChange={() => {
                    setProvider(preset.id);
                    if (preset.baseUrl) setBaseUrl(preset.baseUrl);
                  }}
                  className="sr-only"
                />
                <div className="font-medium text-gray-100">{preset.label}</div>
                <div className="mt-1 text-xs leading-snug text-gray-400">{preset.description}</div>
              </label>
            );
          })}
        </div>
      </fieldset>

      <Field
        label="Base URL"
        htmlFor="provider-base-url"
        hint={activePreset.id === "custom" ? "Full URL including version path, e.g. https://my.proxy/v1" : "Edit if your endpoint differs from the preset default."}
      >
        <input
          id="provider-base-url"
          value={baseUrl}
          onChange={(e) => setBaseUrl(e.target.value)}
          placeholder="https://api.openai.com/v1"
          className={inputClass()}
          autoComplete="off"
          spellCheck={false}
        />
      </Field>

      <Field
        label="API key"
        htmlFor="provider-api-key"
        hint="API keys live in the server's LLM_API_KEY env var — they're never editable from the browser."
      >
        <input
          id="provider-api-key"
          type="password"
          value="••••••••••••"
          disabled
          readOnly
          className={inputClass("cursor-not-allowed opacity-60")}
          autoComplete="off"
        />
      </Field>

      <div className="rounded-lg border border-gray-700 bg-gray-950/50 px-4 py-3">
        <h4 className="text-sm font-semibold text-gray-100">Trust and privacy</h4>
        <p className="mt-1 text-sm leading-relaxed text-gray-300">
          Provider settings are stored server-side for this workspace. API keys stay in environment variables, and GitHub grounding uses read-only repo access scoped to the repository you enter for a session.
        </p>
      </div>
    </FormShell>
  );
}
