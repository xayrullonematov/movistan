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
    <section className="min-h-[calc(100vh-4rem)] flex flex-col items-center justify-center px-6 py-16">
      <div className="max-w-4xl mx-auto text-center space-y-8">
        {/* Headline */}
        <h1 className="text-4xl md:text-5xl lg:text-6xl font-bold text-gray-50 leading-tight tracking-tight">
          4 AI Engineers. One Engineering Problem.{" "}
          <span className="bg-gradient-to-r from-blue-500 to-violet-500 bg-clip-text text-transparent">
            Real Debate.
          </span>
        </h1>

        {/* Subtitle */}
        <p className="text-lg md:text-xl text-gray-400 max-w-3xl mx-auto leading-relaxed">
          Watch autonomous AI agents with competing objectives debate your engineering
          decisions &mdash; producing structured artifacts, surfacing risks, and reaching consensus.
        </p>

        {/* Agent Diagram */}
        <div className="py-8">
          <AgentDiagram />
        </div>

        {/* CTA Buttons */}
        <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
          <button
            onClick={scrollToForm}
            className="px-8 py-3.5 rounded-lg font-semibold text-white bg-gradient-to-r from-blue-500 to-violet-500 hover:from-blue-600 hover:to-violet-600 transition-all duration-300 shadow-lg shadow-blue-500/25 hover:shadow-blue-500/40 text-base animate-[gradient-shift_3s_ease_infinite] bg-[length:200%_200%]"
          >
            Start a Debate &rarr;
          </button>
          <button
            onClick={scrollToHowItWorks}
            className="px-6 py-3.5 rounded-lg font-medium text-gray-300 hover:text-gray-100 border border-gray-700 hover:border-gray-500 transition-all duration-300 text-base"
          >
            Watch how it works
          </button>
        </div>
      </div>
    </section>
  );
}
