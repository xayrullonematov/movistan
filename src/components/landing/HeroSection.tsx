"use client";

import AgentDiagram from "./AgentDiagram";

export default function HeroSection() {
  const scrollToForm = () => {
    document.getElementById("form")?.scrollIntoView({ behavior: "smooth" });
  };

  const scrollToHowItWorks = () => {
    document.getElementById("how-it-works")?.scrollIntoView({ behavior: "smooth" });
  };

  return (
    <section className="flex min-h-[calc(100svh-4rem)] flex-col items-center justify-center bg-[#0b0d0c] px-4 py-10 sm:px-6 sm:py-16">
      <div className="mx-auto max-w-4xl space-y-5 text-center sm:space-y-8">
        {/* Hackathon badge */}
        <div className="inline-flex items-center gap-2 rounded-full border border-[#3f4338] bg-[#1a1c17] px-4 py-1.5 text-xs font-medium text-gray-300">
          <span className="inline-block h-2 w-2 rounded-full bg-emerald-400 animate-pulse" />
          Qwen Cloud Global AI Hackathon · Track 3 — Multi-Agent Collaboration
        </div>

        {/* Headline */}
        <h1 className="text-3xl font-bold leading-tight tracking-tight text-gray-50 sm:text-4xl md:text-5xl lg:text-6xl">
          Decision-ready engineering reviews.{" "}
          <span className="bg-gradient-to-r from-emerald-300 via-teal-200 to-cyan-300 bg-clip-text text-transparent">
            Clear risks before you commit.
          </span>
        </h1>

        {/* Subtitle */}
        <p className="mx-auto max-w-3xl text-base leading-relaxed text-gray-300 md:text-xl">
          Turn architecture, security, performance, and product tradeoffs into a structured report your team can act on.
        </p>

        {/* Agent Diagram */}
        <div className="py-3 sm:py-8">
          <AgentDiagram />
        </div>

        {/* CTA Buttons */}
        <div className="flex flex-col items-center justify-center gap-3 sm:flex-row sm:gap-4">
          <button
            onClick={scrollToForm}
            className="min-h-11 rounded-lg bg-emerald-500 px-6 py-2.5 text-base font-semibold text-gray-950 transition-colors hover:bg-emerald-400 sm:px-8 sm:py-3.5"
          >
            Start a review &rarr;
          </button>
          <button
            onClick={scrollToHowItWorks}
            className="min-h-11 px-5 py-2.5 rounded-lg font-medium text-gray-300 hover:text-gray-100 border border-gray-700 hover:border-gray-500 transition-all duration-300 text-base sm:px-6 sm:py-3.5"
          >
            See the workflow
          </button>
        </div>
      </div>
    </section>
  );
}
