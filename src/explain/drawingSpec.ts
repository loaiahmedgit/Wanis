import { parseDrawingSpec, type Shape } from "./shapes";
import { getSceneTemplate } from "./sceneTemplates";

export interface ShapesSpec {
  mode: "shapes";
  shapes: Shape[];
}

export interface SceneSpec {
  mode: "scene";
  scene: string;
  params: Record<string, unknown>;
}

export type DrawingContent = ShapesSpec | SceneSpec;

/**
 * A "drawing" step's content is one of two things: the existing static
 * shape list, or a reference to a hand-built, professionally-animated
 * "scene" template with a few parameters. Small LLMs are bad at freely
 * composing shape coordinates into good diagrams (that's why the old
 * system looked cheap) but are fine at picking a named template and
 * filling in 1-2 values — so live/animated content goes through curated
 * scenes we control, not LLM-authored geometry.
 *
 * Same null-on-any-failure contract as parseDrawingSpec, so a bad or
 * unknown scene degrades to "render nothing for this step" rather than
 * breaking the board.
 */
export function parseDrawingContent(content: string): DrawingContent | null {
  let data: unknown;
  try {
    data = JSON.parse(content);
  } catch {
    return null;
  }
  if (!data || typeof data !== "object") return null;
  const obj = data as Record<string, unknown>;

  if (typeof obj.scene === "string") {
    const template = getSceneTemplate(obj.scene);
    if (!template) return null;
    const rawParams = obj.params && typeof obj.params === "object" ? (obj.params as Record<string, unknown>) : {};
    const validated = template.validateParams(rawParams);
    if (!validated) return null;
    return { mode: "scene", scene: obj.scene, params: validated as Record<string, unknown> };
  }

  if (Array.isArray(obj.shapes)) {
    const spec = parseDrawingSpec(content);
    if (!spec) return null;
    return { mode: "shapes", shapes: spec.shapes };
  }

  return null;
}
