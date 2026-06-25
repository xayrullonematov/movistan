"use client";

import { MessageSquare, FileText, BarChart3 } from "lucide-react";

interface Tab {
  id: string;
  label: string;
  badge?: number;
}

interface MobileTabBarProps {
  tabs: Tab[];
  activeTab: string;
  onTabChange: (id: string) => void;
}

const iconFor = (id: string) => {
  if (id === "debate") return MessageSquare;
  if (id === "artifacts") return FileText;
  if (id === "results") return BarChart3;
  return MessageSquare;
};

export default function MobileTabBar({
  tabs,
  activeTab,
  onTabChange,
}: MobileTabBarProps) {
  return (
    <nav
      role="tablist"
      aria-label="Workspace tabs"
      className="grid grid-cols-3 border-t border-gray-800 bg-gray-950/95 backdrop-blur"
    >
      {tabs.map((tab) => {
        const Icon = iconFor(tab.id);
        const active = activeTab === tab.id;
        return (
          <button
            key={tab.id}
            role="tab"
            aria-selected={active}
            onClick={() => onTabChange(tab.id)}
            className={`relative flex flex-col items-center justify-center gap-0.5 py-2.5 text-xs transition-colors ${
              active ? "text-white" : "text-gray-500 hover:text-gray-300"
            }`}
          >
            <Icon size={18} className={active ? "text-blue-400" : ""} />
            <span className="font-medium">{tab.label}</span>
            {tab.badge !== undefined && tab.badge > 0 && (
              <span className="absolute right-[24%] top-1 inline-flex h-4 min-w-[16px] items-center justify-center rounded-full bg-blue-500/90 px-1 text-xs font-medium text-white">
                {tab.badge}
              </span>
            )}
            {active && (
              <span className="absolute left-1/3 right-1/3 top-0 h-0.5 rounded-b-full bg-blue-500" />
            )}
          </button>
        );
      })}
    </nav>
  );
}
