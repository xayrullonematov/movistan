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
    name: "The Architect",
    role: "Senior Engineer",
    objective: "Maximize system maintainability and architectural coherence",
    accentColor: "border-t-blue-500",
  },
  {
    agent: "security-engineer",
    name: "The Guardian",
    role: "Security Engineer",
    objective: "Identify and mitigate security vulnerabilities and compliance risks",
    accentColor: "border-t-red-500",
  },
  {
    agent: "performance-engineer",
    name: "The Optimizer",
    role: "Performance Engineer",
    objective: "Optimize system performance, scalability, and resource efficiency",
    accentColor: "border-t-amber-500",
  },
  {
    agent: "product-engineer",
    name: "The Advocate",
    role: "Product Engineer",
    objective: "Ensure solutions align with user needs and business objectives",
    accentColor: "border-t-violet-500",
  },
];

export default function AgentShowcase() {
  return (
    <section className="py-24 px-6">
      <div className="max-w-5xl mx-auto">
        <h2 className="text-3xl font-bold text-gray-50 text-center mb-4">
          Meet Your AI Engineering Team
        </h2>
        <p className="text-gray-400 text-center mb-12 max-w-2xl mx-auto">
          Each agent brings a different perspective, creating productive tension that surfaces
          risks and tradeoffs you might miss.
        </p>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
          {agentCards.map((card) => (
            <div
              key={card.agent}
              className={`rounded-xl bg-gray-900 border border-gray-700 border-t-2 ${card.accentColor} p-6 hover:-translate-y-1 hover:shadow-lg transition-all duration-300`}
            >
              <div className="flex justify-center mb-4">
                <AgentAvatar agent={card.agent} size="lg" />
              </div>
              <h3 className="text-base font-semibold text-gray-100 text-center">
                {card.name}
              </h3>
              <p className="text-xs text-gray-500 text-center mt-0.5 mb-3">
                {card.role}
              </p>
              <p className="text-sm text-gray-400 text-center leading-relaxed">
                {card.objective}
              </p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
