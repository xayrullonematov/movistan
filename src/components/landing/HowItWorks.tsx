"use client";

import { PenLine, GitBranch, FileText } from "lucide-react";

interface Step {
  icon: typeof PenLine;
  title: string;
  description: string;
}

const steps: Step[] = [
  {
    icon: PenLine,
    title: "Frame the decision",
    description:
      "Capture the decision, constraints, and what a usable recommendation must answer.",
  },
  {
    icon: GitBranch,
    title: "Run structured review",
    description:
      "Architecture, security, performance, and product lenses pressure-test the options.",
  },
  {
    icon: FileText,
    title: "Share the report",
    description:
      "Review the recommendation, risks, open questions, and next steps in one report.",
  },
];

export default function HowItWorks() {
  return (
    <section id="how-it-works" className="px-4 py-14 sm:px-6 sm:py-24">
      <div className="max-w-5xl mx-auto">
        <h2 className="mb-8 text-center text-2xl font-bold text-gray-50 sm:mb-16 sm:text-3xl">
          How It Works
        </h2>

        <div className="relative grid grid-cols-1 gap-4 md:grid-cols-3 md:gap-8">
          {/* Connecting lines (desktop only) */}
          <div className="hidden md:block absolute top-12 left-[calc(16.67%+24px)] right-[calc(16.67%+24px)] h-0.5 bg-gradient-to-r from-emerald-500/35 via-gray-700 to-amber-500/35" />

          {steps.map((step, index) => {
            const Icon = step.icon;
            return (
              <div key={index} className="relative flex items-center gap-3 rounded-lg border border-[#34362f] bg-[#151712]/70 p-3 text-left md:flex-col md:border-0 md:bg-transparent md:p-0 md:text-center">
                {/* Step number + icon */}
                <div className="relative z-10 flex h-12 w-12 shrink-0 items-center justify-center rounded-full border border-[#3f4338] bg-[#1f211b] md:mb-6 md:h-24 md:w-24">
                  <Icon className="h-6 w-6 text-gray-300 md:h-10 md:w-10" strokeWidth={1.5} />
                </div>

                {/* Step number badge */}
                <div className="absolute left-10 top-2 z-20 flex h-5 w-5 items-center justify-center rounded-full border border-gray-600 bg-gray-900 text-xs font-bold text-gray-300 md:left-auto md:right-[calc(50%-48px)] md:top-0 md:h-7 md:w-7 md:text-sm">
                  {index + 1}
                </div>

                <div className="min-w-0 md:text-center">
                  <h3 className="mb-1 text-base font-semibold text-gray-100 md:mb-2 md:text-lg">
                    {step.title}
                  </h3>
                  <p className="max-w-xs text-sm leading-relaxed text-gray-400">
                    {step.description}
                  </p>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
