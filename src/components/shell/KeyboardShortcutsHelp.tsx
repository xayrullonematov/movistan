"use client";

import { useSyncExternalStore } from "react";
import { Keyboard } from "lucide-react";
import Sheet from "@/components/ui/Sheet";
import { KEYBOARD_SHORTCUTS, type ShortcutScope } from "@/lib/shortcuts";
import { useKeyboardShortcuts } from "@/hooks/useKeyboardShortcuts";

const scopeLabel: Record<ShortcutScope, string> = {
  global: "Global",
  workspace: "Workspace",
};

// Tiny external store so the open-button and the sheet itself can live in
// different parts of the tree (button in AppHeader; sheet in root layout so it
// works on the workspace page where the header is hidden).
class HelpStore {
  private open = false;
  private listeners = new Set<() => void>();
  subscribe = (l: () => void) => {
    this.listeners.add(l);
    return () => this.listeners.delete(l);
  };
  getSnapshot = () => this.open;
  set(next: boolean) {
    if (this.open === next) return;
    this.open = next;
    for (const l of this.listeners) l();
  }
}

const store = new HelpStore();
export const shortcutsHelp = {
  open: () => store.set(true),
  close: () => store.set(false),
  toggle: () => store.set(!store.getSnapshot()),
};
function useHelpOpen() {
  return useSyncExternalStore(store.subscribe, store.getSnapshot, () => false);
}

/** Mounted once in root layout — wires the `?` shortcut and renders the sheet. */
export function KeyboardShortcutsHelpProvider() {
  const open = useHelpOpen();
  useKeyboardShortcuts({ help: () => shortcutsHelp.toggle() });

  const grouped = (Object.keys(scopeLabel) as ShortcutScope[]).map((scope) => ({
    scope,
    items: KEYBOARD_SHORTCUTS.filter((s) => s.scope === scope),
  }));

  return (
    <Sheet open={open} onOpenChange={(v) => store.set(v)} title="Keyboard shortcuts" side="right">
      <div className="space-y-5 px-4 py-4">
        {grouped.map(({ scope, items }) =>
          items.length === 0 ? null : (
            <div key={scope}>
              <p className="mb-2 text-xs uppercase tracking-wider text-gray-500">
                {scopeLabel[scope]}
              </p>
              <ul className="divide-y divide-gray-800 overflow-hidden rounded-md border border-gray-800">
                {items.map((s) => (
                  <li key={s.id} className="flex items-center justify-between gap-3 px-3 py-2">
                    <span className="text-sm text-gray-300">{s.description}</span>
                    <kbd className="rounded-md border border-gray-700 bg-gray-950 px-2 py-0.5 text-xs font-mono text-gray-300">
                      {s.display}
                    </kbd>
                  </li>
                ))}
              </ul>
            </div>
          ),
        )}
        <p className="text-xs text-gray-500">
          Shortcuts are ignored while typing in inputs, textareas, or other editable fields.
        </p>
      </div>
    </Sheet>
  );
}

/** Header icon button — opens the help sheet via the shared store. */
export default function KeyboardShortcutsHelpButton() {
  return (
    <button
      type="button"
      onClick={() => shortcutsHelp.open()}
      aria-label="Keyboard shortcuts"
      title="Keyboard shortcuts (?)"
      className="rounded-md p-1.5 text-gray-400 transition-colors hover:bg-white/5 hover:text-gray-100"
    >
      <Keyboard size={16} />
    </button>
  );
}
