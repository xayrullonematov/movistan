"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Search } from "lucide-react";
import AccountMenu from "./AccountMenu";
import KeyboardShortcutsHelpButton from "./KeyboardShortcutsHelp";
import { useKeyboardShortcuts } from "@/hooks/useKeyboardShortcuts";
import { useRouter } from "next/navigation";

export default function AppHeader() {
  const pathname = usePathname() ?? "";
  const router = useRouter();

  // Wire the global navigation shortcuts (g s, g ,). They live here because
  // AppHeader is mounted on every non-workspace page.
  useKeyboardShortcuts({
    "goto-sessions": () => router.push("/sessions"),
    "goto-settings": () => router.push("/settings"),
  });

  // The live workspace page (/sessions/<id> exactly) has its own chrome — suppress the global header there.
  const segments = pathname.split("/").filter(Boolean);
  const isLiveWorkspace = segments.length === 2 && segments[0] === "sessions";
  if (isLiveWorkspace) return null;

  const navLink = (href: string, label: string) => {
    const active = pathname === href || (href !== "/" && pathname.startsWith(href));
    return (
      <Link
        href={href}
        className={`rounded-md px-3 py-1.5 text-sm transition-colors ${
          active ? "bg-[var(--violet-soft-bg)] text-violet-200" : "text-gray-400 hover:text-gray-100"
        }`}
      >
        {label}
      </Link>
    );
  };

  return (
    <header className="sticky top-0 z-40 h-16 border-b border-[var(--border)] bg-[var(--background)]/85 backdrop-blur">
      <div className="mx-auto flex h-full max-w-7xl items-center justify-between gap-4 px-4 sm:px-6">
        <Link href="/" className="flex items-center gap-2.5 text-gray-50 transition-opacity hover:opacity-80">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-violet-600 to-purple-700 shadow-sm shadow-violet-500/20">
            <Search size={16} className="text-white" />
          </span>
          <span className="text-base font-semibold tracking-tight hidden sm:inline">
            RepoScope
          </span>
        </Link>
        <nav className="flex items-center gap-1">
          {navLink("/sessions", "Sessions")}
          {navLink("/settings", "Settings")}
        </nav>
        <div className="flex items-center gap-1">
          <KeyboardShortcutsHelpButton />
          <AccountMenu />
        </div>
      </div>
    </header>
  );
}
