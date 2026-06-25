"use client";

import { useState } from "react";

export default function HeroSection() {
  const [repoInput, setRepoInput] = useState("");

  const scrollToForm = () => {
    document.getElementById("form")?.scrollIntoView({ behavior: "smooth" });
  };

  const handleHeroSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    scrollToForm();
  };

  return (
    <section className="flex min-h-[calc(100svh-4rem)] flex-col items-center justify-center bg-[var(--background)] px-4 py-10 sm:px-6 sm:py-16">
      <div className="mx-auto max-w-3xl space-y-6 text-center sm:space-y-8">
        {/* Tagline */}
        <p className="text-sm font-medium tracking-wide text-[var(--text-muted)] uppercase">
          Scope your repo before you ship.
        </p>

        {/* Headline */}
        <h1 className="text-3xl font-bold leading-tight tracking-tight text-[var(--text-primary)] sm:text-4xl md:text-5xl lg:text-6xl">
          Find bugs, risks, and fixes in{" "}
          <span className="bg-gradient-to-r from-violet-400 via-purple-300 to-violet-400 bg-clip-text text-transparent">
            any GitHub repo
          </span>
        </h1>

        {/* Subtitle */}
        <p className="mx-auto max-w-2xl text-base leading-relaxed text-[var(--text-secondary)] md:text-lg">
          Paste a repo. Pick what to check. Get a file-level report with evidence-backed fixes.
        </p>

        {/* Hero repo input */}
        <form onSubmit={handleHeroSubmit} className="mx-auto flex max-w-xl flex-col gap-3 sm:flex-row sm:gap-2">
          <input
            type="text"
            value={repoInput}
            onChange={(e) => setRepoInput(e.target.value)}
            placeholder="github.com/owner/repo"
            className="min-h-12 flex-1 rounded-lg border border-[var(--border)] bg-[var(--surface)] px-4 py-3 text-sm text-[var(--text-primary)] placeholder-[var(--text-muted)] font-mono focus:border-[var(--brand-violet)] focus:outline-none focus:ring-2 focus:ring-[var(--violet-glow)]"
            autoComplete="off"
            spellCheck={false}
          />
          <button
            type="submit"
            className="min-h-12 whitespace-nowrap rounded-lg bg-[var(--brand-violet)] px-6 py-3 text-sm font-semibold text-white transition-colors hover:bg-[var(--violet-hover)]"
          >
            Analyze repo &rarr;
          </button>
        </form>

        {/* Secondary CTA */}
        <div className="flex items-center justify-center gap-4">
          <button
            onClick={() => document.getElementById("sample-report")?.scrollIntoView({ behavior: "smooth" })}
            className="text-sm text-[var(--text-secondary)] transition-colors hover:text-[var(--text-primary)] underline underline-offset-4 decoration-[var(--border)]"
          >
            View sample report
          </button>
        </div>
      </div>
    </section>
  );
}
