"use client";

import AgentAvatar from "@/components/workspace/AgentAvatar";
import type { AgentType } from "@/types/domain";

interface AgentCard {
  agent: AgentType;
  name: string;
  role: string;
  objective: string;
  accentColor: string;
}

const agentCards: AgentCard[] = [
  {
    agent: "senior-engineer",
    name: "Architect",
    role: "Senior Engineer",
    objective: "Maximize system maintainability and architectural coherence",
    accentColor: "border-t-emerald-500",
  },
  {
    agent: "security-engineer",
    name: "Guardian",
    role: "Security Engineer",
    objective: "Identify and mitigate security vulnerabilities and compliance risks",
    accentColor: "border-t-red-500",
  },
  {
    agent: "performance-engineer",
    name: "Optimizer",
    role: "Performance Engineer",
    objective: "Optimize system performance, scalability, and resource efficiency",
    accentColor: "border-t-amber-500",
  },
  {
    agent: "product-engineer",
    name: "Advocate",
    role: "Product Engineer",
    objective: "Ensure solutions align with user needs and business objectives",
    accentColor: "border-t-cyan-500",
  },
];

export default function AgentShowcase() {
  return (
    <section className="px-4 py-14 sm:px-6 sm:py-24">
      <div className="max-w-5xl mx-auto">
        <h2 className="mb-3 text-center text-2xl font-bold text-gray-50 sm:mb-4 sm:text-3xl">
          Four review lenses
        </h2>
        <p className="mx-auto mb-7 max-w-2xl text-center text-sm text-gray-400 sm:mb-12 sm:text-base">
          Architecture, security, performance, and product perspectives pressure-test the same decision from different angles.
        </p>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 sm:gap-6 lg:grid-cols-4">
          {agentCards.map((card) => (
            <div
              key={card.agent}
              className={`rounded-lg border border-[#34362f] border-t-2 bg-[#151712] ${card.accentColor} p-4 hover:-translate-y-1 hover:shadow-lg transition-all duration-300 sm:rounded-xl sm:p-6`}
            >
              <div className="mb-3 flex justify-center sm:mb-4">
                <AgentAvatar agent={card.agent} size="lg" />
              </div>
              <h3 className="text-base font-semibold text-gray-100 text-center">
                {card.name}
              </h3>
              <p className="text-xs text-gray-500 text-center mt-0.5 mb-3">
                {card.role}
              </p>
              <p className="line-clamp-2 text-center text-sm leading-relaxed text-gray-400 sm:line-clamp-none">
                {card.objective}
              </p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
