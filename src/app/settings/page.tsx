import { Suspense } from "react";
import type { Metadata } from "next";
import SettingsLayout from "@/components/settings/SettingsLayout";
import SettingsLoadingState from "@/components/settings/LoadingState";

export const metadata: Metadata = {
  title: "Settings - RepoScope",
  description: "Configure models, providers, budgets, and appearance.",
};

export default function SettingsPage() {
  return (
    <Suspense fallback={<div className="mx-auto max-w-6xl px-4 py-10"><SettingsLoadingState /></div>}>
      <SettingsLayout />
    </Suspense>
  );
}
