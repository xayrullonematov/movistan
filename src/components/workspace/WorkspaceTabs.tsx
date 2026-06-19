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
    <div className="flex items-center border-b border-gray-700 px-4">
      {tabs.map((tab) => (
        <button
          key={tab.id}
          onClick={() => onTabChange(tab.id)}
          className={`
            relative px-4 py-3 text-sm font-medium transition-colors duration-200
            ${
              activeTab === tab.id
                ? "text-white"
                : "text-gray-400 hover:text-gray-200"
            }
          `}
        >
          <span className="flex items-center gap-2">
            {tab.label}
            {tab.badge !== undefined && tab.badge > 0 && (
              <span
                className={`
                  inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 text-xs rounded-full
                  ${
                    activeTab === tab.id
                      ? "bg-blue-500/20 text-blue-300"
                      : "bg-gray-700 text-gray-400"
                  }
                `}
              >
                {tab.badge}
              </span>
            )}
          </span>

          {/* Active indicator bar */}
          {activeTab === tab.id && (
            <span className="absolute bottom-0 left-2 right-2 h-0.5 bg-blue-500 rounded-full" />
          )}
        </button>
      ))}
    </div>
  );
}
