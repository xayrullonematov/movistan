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
    title: "Describe Your Problem",
    description:
      "Write a clear engineering problem or decision you need help with. Include context and constraints.",
  },
  {
    icon: GitBranch,
    title: "Agents Debate",
    description:
      "Four AI engineers with different priorities analyze, critique, and refine solutions.",
  },
  {
    icon: FileText,
    title: "Get Artifacts",
    description:
      "Receive structured decisions, identified risks, tradeoffs, and recommendations.",
  },
];

export default function HowItWorks() {
  return (
    <section id="how-it-works" className="py-24 px-6">
      <div className="max-w-5xl mx-auto">
        <h2 className="text-3xl font-bold text-gray-50 text-center mb-16">
          How It Works
        </h2>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-8 relative">
          {/* Connecting lines (desktop only) */}
          <div className="hidden md:block absolute top-12 left-[calc(16.67%+24px)] right-[calc(16.67%+24px)] h-0.5 bg-gradient-to-r from-blue-500/40 via-gray-700 to-violet-500/40" />

          {steps.map((step, index) => {
            const Icon = step.icon;
            return (
              <div key={index} className="flex flex-col items-center text-center relative">
                {/* Step number + icon */}
                <div className="w-24 h-24 rounded-full bg-gray-800 border border-gray-700 flex items-center justify-center mb-6 relative z-10">
                  <Icon className="w-10 h-10 text-gray-300" strokeWidth={1.5} />
                </div>

                {/* Step number badge */}
                <div className="absolute top-0 right-[calc(50%-48px)] w-7 h-7 rounded-full bg-gray-900 border border-gray-600 flex items-center justify-center text-xs font-bold text-gray-300 z-20">
                  {index + 1}
                </div>

                <h3 className="text-lg font-semibold text-gray-100 mb-2">
                  {step.title}
                </h3>
                <p className="text-sm text-gray-400 leading-relaxed max-w-xs">
                  {step.description}
                </p>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
