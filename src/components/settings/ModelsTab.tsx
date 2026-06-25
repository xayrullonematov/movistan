"use client";

import { useState } from "react";
import { useConfig, type AppConfig } from "@/hooks/useConfig";
import { toast } from "@/hooks/useToast";
import FormShell, { Field, inputClass } from "./FormShell";
import SettingsLoadingState from "./LoadingState";

const tierFields = [
  { key: "proposal", label: "Proposal", hint: "Used when an agent drafts a fresh idea." },
  { key: "critique", label: "Critique", hint: "Critique passes — defaults to a cheaper tier." },
  { key: "revision", label: "Revision", hint: "Revising a proposal after critique." },
  { key: "consensus", label: "Consensus", hint: "Synthesising the final decisions." },
  { key: "summary", label: "Summary", hint: "Round and workspace summarisation." },
] as const;

type TierKey = (typeof tierFields)[number]["key"];

export default function ModelsTab() {
  const { config, isLoading, error, update } = useConfig();

  if (isLoading || !config) return <SettingsLoadingState />;
  if (error) {
    return (
      <div className="rounded-md border border-red-500/30 bg-red-500/10 p-3 text-xs text-red-200">
        Failed to load configuration: {error.message}
      </div>
    );
  }

  return <ModelsForm initial={config} update={update} />;
}

interface ModelsFormProps {
  initial: AppConfig;
  update: (patch: Partial<AppConfig>) => Promise<AppConfig>;
}

function ModelsForm({ initial, update }: ModelsFormProps) {
  const [model, setModel] = useState(initial.model);
  const [tiers, setTiers] = useState<Record<TierKey, string>>({
    proposal: initial.modelTiers.proposal,
    critique: initial.modelTiers.critique,
    revision: initial.modelTiers.revision,
    consensus: initial.modelTiers.consensus,
    summary: initial.modelTiers.summary,
  });
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  return (
    <FormShell
      title="Model selection"
      description="The default model is used for any stage that doesn't have an override."
      saving={saving}
      error={saveError}
      footer="Changes are stored in-memory until the server restarts."
      onSubmit={async (e) => {
        e.preventDefault();
        setSaveError(null);
        if (!model.trim()) {
          setSaveError("Default model is required.");
          return;
        }
        setSaving(true);
        try {
          await update({
            model: model.trim(),
            modelTiers: {
              proposal: tiers.proposal.trim() || model.trim(),
              critique: tiers.critique.trim() || model.trim(),
              revision: tiers.revision.trim() || model.trim(),
              consensus: tiers.consensus.trim() || model.trim(),
              summary: tiers.summary.trim() || model.trim(),
            },
          });
          toast.success({ message: "Models updated", description: "New configuration takes effect immediately." });
        } catch (err) {
          const message = err instanceof Error ? err.message : "Save failed";
          setSaveError(message);
          toast.error({ message: "Could not save models", description: message });
        } finally {
          setSaving(false);
        }
      }}
    >
      <Field label="Default model" htmlFor="model-default" hint="e.g. gpt-4o, claude-opus-4-7">
        <input
          id="model-default"
          value={model}
          onChange={(e) => setModel(e.target.value)}
          placeholder="gpt-4o"
          className={inputClass()}
          autoComplete="off"
        />
      </Field>

      <fieldset className="space-y-3 rounded-lg border border-gray-800 bg-gray-950/40 p-3">
        <legend className="px-1 text-xs font-semibold uppercase tracking-wide text-gray-400">
          Per-stage overrides
        </legend>
        {tierFields.map((tier) => (
          <Field key={tier.key} label={tier.label} htmlFor={`tier-${tier.key}`} hint={tier.hint}>
            <input
              id={`tier-${tier.key}`}
              value={tiers[tier.key]}
              onChange={(e) =>
                setTiers((prev) => ({ ...prev, [tier.key]: e.target.value }))
              }
              placeholder={model || "Inherit default"}
              className={inputClass()}
              autoComplete="off"
            />
          </Field>
        ))}
      </fieldset>
    </FormShell>
  );
}
