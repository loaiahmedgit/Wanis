import { useEffect, useState } from "react";
import type { ExplanationStep } from "../explain/types";
import { lineDurationMs, LINE_PAUSE_MS } from "../explain/timing";
import { Line } from "./Line";

interface BoardProps {
  steps: ExplanationStep[];
  /** Bumped whenever a new plan should start writing from the top again. */
  planToken: number;
}

export function Board({ steps, planToken }: BoardProps) {
  const [revealedCount, setRevealedCount] = useState(0);

  // New plan: clear the board and start writing from the first line again.
  useEffect(() => {
    setRevealedCount(0);
  }, [planToken]);

  useEffect(() => {
    if (revealedCount >= steps.length) return;
    const step = steps[revealedCount];
    const wait = lineDurationMs(step.content) + LINE_PAUSE_MS;
    const timer = setTimeout(() => setRevealedCount((c) => c + 1), wait);
    return () => clearTimeout(timer);
  }, [revealedCount, steps]);

  const visibleSteps = steps.slice(0, Math.min(revealedCount + 1, steps.length));

  return (
    <div className="board">
      {visibleSteps.map((step, i) => (
        <Line key={`${planToken}-${step.id}`} step={step} isWriting={i === revealedCount} />
      ))}
    </div>
  );
}
