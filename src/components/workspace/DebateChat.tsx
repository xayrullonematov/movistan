"use client";

import { useRef, useEffect, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import type { RoundStage, PersistedEvent, AgentType } from "@/types/domain";
import { useEventStream } from "@/hooks/useEventStream";
import DebateMessage from "./DebateMessage";

interface DebateChatProps {
  sessionId: string;
  currentRound: number;
  currentStage: RoundStage | null;
}

const relevantEventTypes = ["proposal", "critique", "revision", "consensus-update"];

const stageLabels: Record<string, string> = {
  proposal: "Proposal Stage",
  critique: "Critique Stage",
  revision: "Revision Stage",
  consensus: "Consensus Stage",
};

function mapEventToMessageType(
  eventType: string
): "proposal" | "critique" | "revision" | "consensus" {
  if (eventType === "consensus-update") return "consensus";
  return eventType as "proposal" | "critique" | "revision";
}

function getTargetAgent(event: PersistedEvent): AgentType | undefined {
  if (event.type !== "critique") return undefined;
  try {
    const data = JSON.parse(event.content);
    return data.targetAgentId || undefined;
  } catch {
    return undefined;
  }
}

interface GroupedEvents {
  stage: RoundStage;
  events: PersistedEvent[];
}

function groupEventsByStage(events: PersistedEvent[]): GroupedEvents[] {
  const groups: GroupedEvents[] = [];
  let currentGroup: GroupedEvents | null = null;

  for (const event of events) {
    const stage = event.stage || "proposal";
    if (!currentGroup || currentGroup.stage !== stage) {
      currentGroup = { stage, events: [] };
      groups.push(currentGroup);
    }
    currentGroup.events.push(event);
  }

  return groups;
}

export default function DebateChat({
  sessionId,
  currentRound,
  currentStage,
}: DebateChatProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const { events, isLoading } = useEventStream(sessionId);

  // Filter events for current round and relevant types
  const filteredEvents = useMemo(() => {
    return events.filter(
      (e) =>
        e.round === currentRound && relevantEventTypes.includes(e.type)
    );
  }, [events, currentRound]);

  // Group events by stage
  const groupedEvents = useMemo(
    () => groupEventsByStage(filteredEvents),
    [filteredEvents]
  );

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [filteredEvents.length]);

  if (isLoading && filteredEvents.length === 0) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-center">
          <div className="w-6 h-6 border-2 border-blue-500 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
          <p className="text-sm text-gray-400">Loading debate...</p>
        </div>
      </div>
    );
  }

  if (filteredEvents.length === 0) {
    return (
      <div className="flex items-center justify-center h-full p-8">
        <div className="text-center max-w-sm">
          <div className="w-12 h-12 rounded-full bg-gray-800 border border-gray-700 flex items-center justify-center mx-auto mb-4">
            <svg
              className="w-6 h-6 text-gray-500"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={1.5}
                d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z"
              />
            </svg>
          </div>
          <p className="text-gray-400 text-sm">
            No debate messages yet for round {currentRound}.
          </p>
          <p className="text-gray-500 text-xs mt-1">
            Messages will appear here as agents contribute.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div ref={scrollRef} className="h-full overflow-y-auto px-4 py-4 space-y-4">
      <AnimatePresence mode="popLayout">
        {groupedEvents.map((group, groupIdx) => (
          <div key={`${group.stage}-${groupIdx}`}>
            {/* Stage separator */}
            {groupIdx > 0 && (
              <div className="flex items-center gap-3 py-3">
                <div className="flex-1 h-px bg-gray-700" />
                <span className="text-[10px] uppercase font-medium text-gray-500 tracking-wider">
                  {stageLabels[group.stage] || group.stage}
                </span>
                <div className="flex-1 h-px bg-gray-700" />
              </div>
            )}

            {/* Messages in this stage */}
            {group.events.map((event, eventIdx) => (
              <motion.div
                key={event.id}
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{
                  duration: 0.3,
                  delay: eventIdx * 0.05,
                }}
                className="mb-4"
              >
                <DebateMessage
                  type={mapEventToMessageType(event.type)}
                  agent={event.agentId || "senior-engineer"}
                  content={event.content}
                  timestamp={event.timestamp}
                  targetAgent={getTargetAgent(event)}
                />
              </motion.div>
            ))}
          </div>
        ))}
      </AnimatePresence>
    </div>
  );
}
