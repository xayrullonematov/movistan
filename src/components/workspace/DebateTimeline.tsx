"use client";

import type { RoundStage } from "@/types/domain";
import { useEventStream } from "@/hooks/useEventStream";
import TimelineEvent from "@/components/ui/TimelineEvent";
import RoundProgressIndicator from "./RoundProgressIndicator";

interface DebateTimelineProps {
  sessionId: string;
  currentRound: number;
  currentStage: RoundStage | null;
}

export default function DebateTimeline({ sessionId, currentRound, currentStage }: DebateTimelineProps) {
  const { events, isLoading } = useEventStream(sessionId);

  return (
    <div className="space-y-3">
      <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wide">
        Timeline
      </h2>

      <RoundProgressIndicator currentStage={currentStage} />

      {isLoading ? (
        <p className="text-xs text-gray-500">Loading events...</p>
      ) : events.length === 0 ? (
        <p className="text-xs text-gray-500">No events yet.</p>
      ) : (
        <div className="space-y-1 max-h-[calc(100vh-200px)] overflow-y-auto">
          {[...events].reverse().map((event, i, arr) => {
            const nextEvent = arr[i + 1];
            const showStageMarker =
              nextEvent && nextEvent.stage !== event.stage;

            return (
              <div key={event.id}>
                {showStageMarker && (
                  <div className="py-1 px-2 my-1 bg-gray-800/50 rounded text-xs text-gray-500 text-center">
                    — {event.stage || "transition"} —
                  </div>
                )}
                <TimelineEvent event={event} />
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
