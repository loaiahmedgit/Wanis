/**
 * How long a single line takes to "write" itself out, based on its length —
 * shared by Board (which schedules when the next line starts) and Line
 * (whose CSS transition duration must match exactly, or the pen icon and
 * the reveal edge drift apart).
 */
export function lineDurationMs(content: string): number {
  return Math.min(2200, Math.max(700, content.length * 55));
}

/** Pause after a line finishes writing before the next one starts. */
export const LINE_PAUSE_MS = 350;
