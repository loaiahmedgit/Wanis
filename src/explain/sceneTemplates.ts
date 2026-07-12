import type { ComponentType } from "react";
import { UnitCircleWave, type UnitCircleWaveParams } from "../components/scenes/UnitCircleWave";
import { ProcessFlow, type ProcessFlowParams } from "../components/scenes/ProcessFlow";
import { RightTriangle, type RightTriangleParams } from "../components/scenes/RightTriangle";

export interface SceneComponentProps<P> {
  params: P;
  /** True only while this is the single step currently being animated. */
  isWriting: boolean;
  /** How long the scene has to complete its animation, in ms. */
  durationMs: number;
}

export interface SceneTemplate<P = unknown> {
  name: string;
  component: ComponentType<SceneComponentProps<P>>;
  /** Normalizes + validates raw LLM-supplied params. Returns null if unusable. */
  validateParams: (raw: Record<string, unknown>) => P | null;
  /** Natural animation length for these params, in ms. */
  durationMs: (params: P) => number;
  /** One-line description injected into the system prompt so the LLM knows this exists. */
  promptHint: string;
}

const isNum = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);
const clamp = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v));

const unitCircleWaveTemplate: SceneTemplate<UnitCircleWaveParams> = {
  name: "unit-circle-wave",
  component: UnitCircleWave,
  validateParams: (raw) => {
    const fn = raw.function === "cos" ? "cos" : raw.function === "sin" ? "sin" : null;
    if (!fn) return null;
    const cyclesRaw = isNum(raw.cycles) ? raw.cycles : 1;
    const cycles = Math.round(clamp(cyclesRaw, 1, 3));
    return { function: fn, cycles };
  },
  // Total scene time: the full-stage intro choreography (circle draw-in, radius
  // grow, guides, camera pull-back — ~3.4s) + the rotation itself + a settle beat.
  durationMs: (params) => 3400 + clamp(params.cycles * 4500, 4000, 14000) + 1200,
  promptHint:
    '"unit-circle-wave" {"function":"sin"|"cos","cycles":1-3} — a point sweeps around a unit circle while ' +
    "its height live-draws the sin or cos wave next to it. Use for trigonometry, circular motion, or how a " +
    "periodic wave is generated from rotation.",
};

const processFlowTemplate: SceneTemplate<ProcessFlowParams> = {
  name: "process-flow",
  component: ProcessFlow,
  validateParams: (raw) => {
    if (!Array.isArray(raw.stages)) return null;
    const stages = raw.stages
      .filter((s): s is { label: unknown } => !!s && typeof s === "object")
      .map((s) => ({ label: typeof (s as { label: unknown }).label === "string" ? (s as { label: string }).label.slice(0, 20) : "" }))
      .filter((s) => s.label.length > 0)
      .slice(0, 6);
    if (stages.length < 3) return null;
    const connector = raw.connector === "line" ? "line" : "arrow";
    const layout = raw.layout === "vertical" ? "vertical" : "horizontal";
    return { stages, connector, layout };
  },
  durationMs: (params) => clamp(900 + params.stages.length * 1100, 3500, 9000),
  promptHint:
    '"process-flow" {"stages":[{"label":"..."},...] (3-6 stages),"connector":"arrow"|"line","layout":' +
    '"horizontal"|"vertical"} — clean labeled stages connected in sequence. Use for a process or system ' +
    "with clear steps: DNA replication, cell division, a circuit, a timeline, how something is built or flows.",
};

const rightTriangleTemplate: SceneTemplate<RightTriangleParams> = {
  name: "right-triangle",
  component: RightTriangle,
  validateParams: (raw) => {
    const str = (v: unknown, fallback: string) => (typeof v === "string" && v.trim() ? v.slice(0, 14) : fallback);
    const legLabel1 = str(raw.legLabel1, "a");
    const legLabel2 = str(raw.legLabel2, "b");
    const hypotenuseLabel = str(raw.hypotenuseLabel, "c");
    const angleLabel = typeof raw.angleLabel === "string" && raw.angleLabel.trim() ? raw.angleLabel.slice(0, 6) : undefined;
    return { legLabel1, legLabel2, hypotenuseLabel, angleLabel };
  },
  durationMs: (params) => (params.angleLabel ? 2600 : 2200),
  promptHint:
    '"right-triangle" {"legLabel1":"...","legLabel2":"...","hypotenuseLabel":"...","angleLabel":"..." (optional)} ' +
    "— a correctly-drawn right triangle with clean, non-overlapping labels on each side, and an angle arc " +
    "if angleLabel is given. Always use this instead of freehand \"shapes\" for ANY right triangle — the " +
    "Pythagorean theorem (legLabel1: \"a\", legLabel2: \"b\", hypotenuseLabel: \"c\"), or trig ratios " +
    "(legLabel1: \"opposite\", legLabel2: \"adjacent\", hypotenuseLabel: \"hypotenuse\", angleLabel: \"θ\").",
};

export const SCENE_TEMPLATES: Record<string, SceneTemplate<any>> = {
  "unit-circle-wave": unitCircleWaveTemplate,
  "process-flow": processFlowTemplate,
  "right-triangle": rightTriangleTemplate,
};

export function getSceneTemplate(name: string): SceneTemplate<any> | undefined {
  return SCENE_TEMPLATES[name];
}

export function sceneListForPrompt(): string {
  return Object.values(SCENE_TEMPLATES)
    .map((t) => `  - ${t.promptHint}`)
    .join("\n");
}
