import type { ExplanationStep } from "./types";
import { parseDrawingSpec } from "./shapes";

/**
 * How long a single text/equation line takes to "write" itself out. Paced
 * deliberately slow — this is what a future voice narration will sync
 * against, so it needs room to breathe rather than racing across the board.
 */
export function lineDurationMs(content: string): number {
  return Math.min(3200, Math.max(1000, content.length * 75));
}

/** Pause after a step finishes before the next one starts. */
export const LINE_PAUSE_MS = 550;

/** How long a small illustration takes to sketch, based on its shape count. */
export function drawingDurationMs(shapeCount: number): number {
  return Math.min(7000, Math.max(1600, 900 + shapeCount * 750));
}

export function stepDurationMs(step: ExplanationStep): number {
  if (step.kind === "drawing") {
    const spec = parseDrawingSpec(step.content);
    return drawingDurationMs(spec?.shapes.length ?? 1);
  }
  return lineDurationMs(step.content);
}

/**
 * A real hand doesn't move at constant speed — it starts a stroke quickly
 * and settles into the curve. Used to shape the per-frame progress value
 * driving stroke-dashoffset, instead of raw linear time.
 */
export function easeOutCubic(t: number): number {
  return 1 - Math.pow(1 - t, 3);
}
