import { useEffect, useLayoutEffect, useRef, useState } from "react";
import type { ExplanationStep } from "../explain/types";
import { lineDurationMs } from "../explain/timing";

interface LineProps {
  step: ExplanationStep;
  /** True only for the single line currently being written — shows the pen. */
  isWriting: boolean;
}

export function Line({ step, isWriting }: LineProps) {
  const spanRef = useRef<HTMLSpanElement>(null);
  const [targetWidth, setTargetWidth] = useState<number | null>(null);
  const [revealed, setRevealed] = useState(!isWriting);

  // Measure the line's natural width before it's ever shown, so the reveal
  // has a real pixel value to transition to (CSS can't animate to "auto").
  useLayoutEffect(() => {
    if (spanRef.current) setTargetWidth(spanRef.current.scrollWidth);
  }, [step.content]);

  useEffect(() => {
    if (!isWriting || targetWidth === null || revealed) return;
    // Flip to the revealed state on the next frame so the browser registers
    // the starting width:0 first — otherwise the transition never plays.
    const id = requestAnimationFrame(() => setRevealed(true));
    return () => cancelAnimationFrame(id);
  }, [isWriting, targetWidth, revealed]);

  const duration = lineDurationMs(step.content);
  const width = revealed && targetWidth !== null ? targetWidth : 0;

  return (
    <div className={`line line-${step.kind}`}>
      <div
        className="line-clip"
        style={{ width, transitionDuration: `${duration}ms` }}
      >
        <span className="line-text" ref={spanRef}>
          {step.content}
        </span>
        {isWriting && <span className="pen-icon" aria-hidden="true">✏️</span>}
      </div>
    </div>
  );
}
