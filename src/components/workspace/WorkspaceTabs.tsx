"use client";

interface Tab {
  id: string;
  label: string;
  badge?: number;
}

interface WorkspaceTabsProps {
  activeTab: string;
  onTabChange: (tabId: string) => void;
  tabs: Tab[];
}

export default function WorkspaceTabs({
  activeTab,
  onTabChange,
  tabs,
}: WorkspaceTabsProps) {
  return (
    <div className="flex items-center gap-1 px-3 py-2 sm:px-4">
      {tabs.map((tab) => (
        <button
          key={tab.id}
          onClick={() => onTabChange(tab.id)}
          className={`
            px-3 py-1.5 text-xs font-medium rounded-md transition-colors
            ${
              activeTab === tab.id
                ? "bg-emerald-500/15 text-emerald-200 border border-emerald-500/30"
                : "text-gray-400 hover:text-gray-200 hover:bg-gray-800 border border-transparent"
            }
          `}
        >
          {tab.label}
          {tab.badge !== undefined && tab.badge > 0 && (
            <span className="ml-1.5 text-[10px] text-gray-500">{tab.badge}</span>
          )}
        </button>
      ))}
    </div>
  );
}
