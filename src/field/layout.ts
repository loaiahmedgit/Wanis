import type { ExplanationPlan, ExplanationStep } from "../explain/types";
import { rasterizeText } from "./rasterize";

export interface LaidOutStep {
  step: ExplanationStep;
  /** This step's own rasterized text, full-grid-sized, everything else 0. */
  layer: Float32Array;
}

const KIND_ROW_HEIGHT_FRACTION: Record<ExplanationStep["kind"], number> = {
  title: 0.095,
  equation: 0.085,
  text: 0.066,
};

/**
 * Lays out each step as its own horizontal band on the board (top to
 * bottom, in the order the plan specifies) and rasterizes it. Returns one
 * layer per step — the caller (PinField) merges them in as it reveals each
 * step, so earlier steps stay visible while later ones are added.
 */
export function layoutPlan(
  plan: ExplanationPlan,
  gridWidth: number,
  gridHeight: number,
): LaidOutStep[] {
  const topMargin = gridHeight * 0.08;
  const bottomMargin = gridHeight * 0.06;
  const usable = gridHeight - topMargin - bottomMargin;

  const heights = plan.steps.map((s) => gridHeight * KIND_ROW_HEIGHT_FRACTION[s.kind]);
  const gap = plan.steps.length > 1
    ? (usable - heights.reduce((a, b) => a + b, 0)) / (plan.steps.length - 1 || 1)
    : 0;
  const clampedGap = Math.max(gridHeight * 0.02, Math.min(gap, gridHeight * 0.09));

  let cursor = topMargin;
  const laidOut: LaidOutStep[] = [];

  for (let i = 0; i < plan.steps.length; i++) {
    const step = plan.steps[i];
    const rowHeight = heights[i];
    const rowCenter = cursor + rowHeight / 2;

    const layer = rasterizeText(step.content, gridWidth, gridHeight, {
      rowCenter,
      rowHeight,
      bold: step.kind !== "text",
    });

    laidOut.push({ step, layer });
    cursor += rowHeight + clampedGap;
  }

  return laidOut;
}
