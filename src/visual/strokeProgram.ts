/**
 * Layer 3 — the compiled, timed stroke program. Entirely produced by our
 * deterministic compiler; models never touch this layer. The player traces
 * each stroke with the pen (measuring real path length at runtime via
 * getTotalLength, same technique as the handwriting system), fades texts in,
 * and executes motions.
 */

export interface StrokeItem {
  /** Absolute SVG path data in program viewBox coordinates. */
  d: string;
  /** CSS class controlling the stroke's visual register. */
  css: string;
}

export interface TextItem {
  x: number;
  y: number;
  text: string;
  css: string;
  anchor?: "start" | "middle" | "end";
}

export type Motion =
  | { kind: "highlight"; x: number; y: number }
  | { kind: "zoomTo"; viewBox: [number, number, number, number] }
  | { kind: "zoomReset" };

export interface StrokeGroup {
  /** What this group of strokes semantically represents. */
  meaning: string;
  strokes: StrokeItem[];
  texts: TextItem[];
  motion?: Motion;
}

export interface StrokeProgram {
  viewBox: [number, number, number, number];
  /** Groups play strictly in order; strokes within a group trace in order. */
  groups: StrokeGroup[];
}
