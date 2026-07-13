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

/**
 * A readable teaching frame over a sub-region of the diagram, for the semantic
 * camera. The model never supplies these — the compiler derives them from
 * object bounds + relationships so a too-wide diagram can be taught region by
 * region on a small viewport instead of shrunk into unreadability. Each region
 * owns a CONTIGUOUS range of stroke groups (so the pen never draws a major
 * stroke outside the active frame), plus the bounds the camera should frame.
 */
export interface FocusRegion {
  /** Sub-rect of the program viewBox: [x, y, w, h]. */
  bounds: [number, number, number, number];
  /** Semantic object ids this region teaches. */
  members: string[];
  /** Inclusive group index range drawn while this region is framed. */
  startGroup: number;
  endGroup: number;
  kind: "teach" | "overview";
  meaning: string;
}

export interface StrokeProgram {
  viewBox: [number, number, number, number];
  /** Groups play strictly in order; strokes within a group trace in order. */
  groups: StrokeGroup[];
  /**
   * Ordered focus regions for the semantic camera (teaching frames then a final
   * overview). Absent/empty when the scene is compact enough to read whole.
   */
  focusRegions?: FocusRegion[];
  /** Smallest ESSENTIAL label height in viewBox units, for the activation test. */
  minLabelSize?: number;
}
