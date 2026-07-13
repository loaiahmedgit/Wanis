/**
 * Pure decision + framing math for the semantic camera (see StrokeProgram.
 * focusRegions). No DOM. The runtime supplies the actually-rendered SVG CSS
 * size; this decides whether a scene is readable whole or must be taught region
 * by region, and computes each frame's padded, aspect-matched viewBox.
 */
import type { StrokeProgram, FocusRegion } from "./strokeProgram";

/** Below this projected CSS-pixel height, an essential label is unreadable. */
export const READABLE_PX = 14;
/** Fallback essential-label height (viewBox units) if a program omits it. */
export const DEFAULT_LABEL_SIZE = 14;

export interface RenderedSize {
  /** The SVG's rendered CSS width/height in CSS pixels (device pixel ratio is irrelevant). */
  w: number;
  h: number;
}

/**
 * Projected CSS-pixel height of the smallest ESSENTIAL label when the whole
 * viewBox is fit into the rendered box. preserveAspectRatio="xMidYMid meet"
 * uses a single uniform scale = min(w/vbW, h/vbH).
 */
export function projectedLabelPx(program: StrokeProgram, rendered: RenderedSize): number {
  const [, , vbW, vbH] = program.viewBox;
  const scale = Math.min(rendered.w / vbW, rendered.h / vbH);
  return (program.minLabelSize ?? DEFAULT_LABEL_SIZE) * scale;
}

export type CameraDecision = "whole" | "focus" | "needed-but-unavailable";

/**
 * - "whole": the scene reads fine at this size — no camera.
 * - "focus": too small to read whole AND focus regions exist — teach them.
 * - "needed-but-unavailable": too small but NO regions — the runtime must log
 *   `cameraNeededButUnavailable` (a benchmark signal) rather than pretend it is fine.
 */
export function decideCamera(program: StrokeProgram, rendered: RenderedSize): CameraDecision {
  if (projectedLabelPx(program, rendered) >= READABLE_PX) return "whole";
  return program.focusRegions && program.focusRegions.length > 0 ? "focus" : "needed-but-unavailable";
}

/**
 * A focus region's camera viewBox: expand the semantic bounds by safe padding,
 * then grow the shorter axis so the aspect matches the rendered box — the region
 * fills the frame, centered, with NO distortion (uniform scale is preserved).
 */
export function regionViewBox(region: FocusRegion, rendered: RenderedSize, padFrac = 0.08): [number, number, number, number] {
  let [x, y, w, h] = region.bounds;
  const px = w * padFrac;
  const py = h * padFrac;
  x -= px;
  y -= py;
  w += 2 * px;
  h += 2 * py;
  const targetAspect = rendered.w / Math.max(1, rendered.h);
  const curAspect = w / h;
  if (curAspect < targetAspect) {
    const nw = h * targetAspect;
    x -= (nw - w) / 2;
    w = nw;
  } else {
    const nh = w / targetAspect;
    y -= (nh - h) / 2;
    h = nh;
  }
  return [x, y, w, h];
}
