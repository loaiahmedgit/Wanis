import type { ExplanationStep } from "./types";
import { parseDrawingContent } from "./drawingSpec";
import { getSceneTemplate } from "./sceneTemplates";
import type { StrokeProgram } from "../visual/strokeProgram";

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

const DEFAULT_SCENE_MS = 4500;

/** How long a live scene template's animation naturally takes for its params. */
export function sceneDurationMs(scene: string, params: Record<string, unknown>): number {
  const template = getSceneTemplate(scene);
  if (!template) return DEFAULT_SCENE_MS;
  const validated = template.validateParams(params);
  if (!validated) return DEFAULT_SCENE_MS;
  return template.durationMs(validated);
}

/** How long a compiled scene-graph program takes to draw, from its stroke count. */
export function graphDurationMs(program: StrokeProgram): number {
  const strokes = program.groups.reduce((n, g) => n + g.strokes.length, 0);
  return Math.min(11000, Math.max(2600, 1200 + strokes * 420));
}

export function stepDurationMs(step: ExplanationStep): number {
  if (step.kind === "drawing") {
    const content = parseDrawingContent(step.content);
    if (!content) return drawingDurationMs(1);
    if (content.mode === "scene") return sceneDurationMs(content.scene, content.params);
    if (content.mode === "graph") return graphDurationMs(content.program);
    return drawingDurationMs(content.shapes.length);
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
