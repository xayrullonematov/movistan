"use client";

import { useEffect, useState } from "react";
import { Moon, Sun, Monitor } from "lucide-react";
import { toast } from "@/hooks/useToast";
import { isTheme, THEME_COOKIE, type Theme } from "@/lib/theme";
import FormShell from "./FormShell";

const options: Array<{ id: Theme; label: string; description: string; Icon: typeof Sun }> = [
  { id: "dark", label: "Dark", description: "Always use the dark palette.", Icon: Moon },
  { id: "light", label: "Light", description: "Always use the light palette.", Icon: Sun },
  { id: "system", label: "System", description: "Follow the OS preference (dark fallback on first paint).", Icon: Monitor },
];

function readCookieTheme(): Theme {
  if (typeof document === "undefined") return "dark";
  const match = document.cookie.split("; ").find((row) => row.startsWith(`${THEME_COOKIE}=`));
  if (!match) return "dark";
  const value = decodeURIComponent(match.split("=")[1] ?? "");
  return isTheme(value) ? value : "dark";
}

function applyTheme(theme: Theme) {
  if (typeof document === "undefined") return;
  let resolved: "dark" | "light" = "dark";
  if (theme === "light") resolved = "light";
  else if (theme === "system") {
    resolved = window.matchMedia?.("(prefers-color-scheme: dark)").matches ? "dark" : "light";
  }
  const html = document.documentElement;
  html.dataset.theme = resolved;
  html.classList.toggle("dark", resolved === "dark");
  html.classList.toggle("light", resolved === "light");
}

export default function AppearanceTab() {
  const [theme, setTheme] = useState<Theme>(() => readCookieTheme());
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (theme !== "system") return;
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const handler = () => applyTheme("system");
    media.addEventListener("change", handler);
    return () => media.removeEventListener("change", handler);
  }, [theme]);

  return (
    <FormShell
      title="Theme"
      description="Persisted in a cookie so the server can render with the right palette."
      saving={saving}
      saveLabel="Apply theme"
      onSubmit={(e) => {
        e.preventDefault();
        setSaving(true);
        try {
          document.cookie = `${THEME_COOKIE}=${theme}; path=/; max-age=${60 * 60 * 24 * 365}; SameSite=Lax`;
          applyTheme(theme);
          toast.success({ message: "Theme updated" });
        } finally {
          setSaving(false);
        }
      }}
    >
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
        {options.map((opt) => {
          const Icon = opt.Icon;
          const selected = theme === opt.id;
          return (
            <label
              key={opt.id}
              className={`cursor-pointer rounded-lg border px-3 py-3 text-xs transition-colors ${
                selected
                  ? "border-blue-500/60 bg-blue-500/10 text-blue-100"
                  : "border-gray-800 bg-gray-950/40 text-gray-300 hover:border-gray-700"
              }`}
            >
              <input
                type="radio"
                name="theme"
                value={opt.id}
                checked={selected}
                onChange={() => setTheme(opt.id)}
                className="sr-only"
              />
              <div className="flex items-center gap-2 text-gray-100">
                <Icon size={14} className={selected ? "text-blue-300" : "text-gray-400"} />
                <span className="font-medium">{opt.label}</span>
              </div>
              <p className="mt-1.5 text-xs leading-snug text-gray-400">{opt.description}</p>
            </label>
          );
        })}
      </div>
    </FormShell>
  );
}
