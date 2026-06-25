"use client";

import { useEffect, useRef, useState, forwardRef, useImperativeHandle } from "react";
import { Download, FileText, FileJson, Link2, Loader2 } from "lucide-react";
import { toast } from "@/hooks/useToast";
import type { SessionState } from "@/types/domain";

interface ExportMenuProps {
  sessionId: string;
  session: SessionState;
}

export interface ExportMenuHandle {
  /** Open the menu — used by the `e` keyboard shortcut. */
  open: () => void;
}

function downloadBlob(content: string, mime: string, filename: string) {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

async function copy(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

const ExportMenu = forwardRef<ExportMenuHandle, ExportMenuProps>(function ExportMenu(
  { sessionId, session },
  ref,
) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  useImperativeHandle(ref, () => ({ open: () => setOpen(true) }), []);

  useEffect(() => {
    if (!open) return;
    function onDocClick(e: MouseEvent) {
      if (!containerRef.current?.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, [open]);

  async function fetchMarkdown(): Promise<string> {
    const res = await fetch(`/api/sessions/${sessionId}/export`);
    if (!res.ok) throw new Error("Export failed. Please try again.");
    return res.text();
  }

  function sessionJson(): string {
    return JSON.stringify(session, null, 2);
  }

  async function withBusy<T>(label: string, fn: () => Promise<T> | T): Promise<T | null> {
    setBusy(label);
    try {
      return await fn();
    } catch (err) {
      toast.error({
        message: "Export failed",
        description: err instanceof Error ? err.message : "Something went wrong",
      });
      return null;
    } finally {
      setBusy(null);
    }
  }

  async function handleDownloadMd() {
    await withBusy("md-dl", async () => {
      const md = await fetchMarkdown();
      downloadBlob(md, "text/markdown", `session-${sessionId}.md`);
      toast.success({ message: "Downloaded Markdown" });
    });
    setOpen(false);
  }

  async function handleDownloadJson() {
    await withBusy("json-dl", () => {
      downloadBlob(sessionJson(), "application/json", `session-${sessionId}.json`);
      toast.success({ message: "Downloaded JSON" });
    });
    setOpen(false);
  }

  async function handleCopyMd() {
    await withBusy("md-copy", async () => {
      const md = await fetchMarkdown();
      const ok = await copy(md);
      if (ok) toast.success({ message: "Copied Markdown to clipboard" });
      else throw new Error("Clipboard write was blocked");
    });
    setOpen(false);
  }

  async function handleCopyJson() {
    await withBusy("json-copy", async () => {
      const ok = await copy(sessionJson());
      if (ok) toast.success({ message: "Copied JSON to clipboard" });
      else throw new Error("Clipboard write was blocked");
    });
    setOpen(false);
  }

  async function handleCopyLink() {
    await withBusy("link", async () => {
      const url = `${window.location.origin}/sessions/${sessionId}`;
      const ok = await copy(url);
      if (ok) toast.success({ message: "Copied share link", description: url });
      else throw new Error("Clipboard write was blocked");
    });
    setOpen(false);
  }

  const items: { id: string; label: string; icon: typeof Download; onClick: () => void }[] = [
    { id: "md-dl",   label: "Download Markdown", icon: Download, onClick: handleDownloadMd },
    { id: "json-dl", label: "Download JSON",     icon: Download, onClick: handleDownloadJson },
    { id: "md-copy", label: "Copy Markdown",     icon: FileText, onClick: handleCopyMd },
    { id: "json-copy", label: "Copy JSON",       icon: FileJson, onClick: handleCopyJson },
    { id: "link",    label: "Copy share link",   icon: Link2,    onClick: handleCopyLink },
  ];

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        disabled={busy !== null}
        className="flex items-center gap-1.5 rounded-lg border border-gray-700 bg-gray-800 px-3 py-1.5 text-xs text-gray-300 transition-colors hover:bg-gray-700 hover:text-white disabled:opacity-50"
        aria-haspopup="menu"
        aria-expanded={open}
      >
        {busy ? <Loader2 size={12} className="animate-spin" /> : <Download size={12} />}
        <span className="hidden sm:inline">Export</span>
      </button>

      {open && (
        <div
          role="menu"
          className="absolute right-0 z-30 mt-1 w-52 overflow-hidden rounded-md border border-gray-700 bg-gray-900 shadow-xl"
        >
          {items.map((item) => {
            const Icon = item.icon;
            const isBusy = busy === item.id;
            return (
              <button
                key={item.id}
                role="menuitem"
                type="button"
                onClick={item.onClick}
                disabled={busy !== null}
                className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs text-gray-200 transition-colors hover:bg-gray-800 disabled:opacity-50"
              >
                {isBusy ? <Loader2 size={12} className="animate-spin text-gray-400" /> : <Icon size={12} className="text-gray-400" />}
                {item.label}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
});

export default ExportMenu;
