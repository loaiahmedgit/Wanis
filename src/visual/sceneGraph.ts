/**
 * Layer 2 — the semantic scene graph. The LLM's output vocabulary: objects,
 * relations, constraints. NO coordinates, NO timing, NO colors — those are
 * all decided by the deterministic compiler (compiler.ts). This boundary is
 * the whole point: models are good at semantic composition and bad at
 * globally-consistent geometry (the bowtie-polygon lesson).
 */

export interface BoxObject {
  id: string;
  type: "box";
  label?: string;
}

export interface CircleObject {
  id: string;
  type: "circleShape";
  label?: string;
  /** relative size hint: 1 = default. Clamped by the parser. */
  size?: number;
}

export interface UnitCircleObject {
  id: string;
  type: "unitCircle";
}

export interface PointOnCircleObject {
  id: string;
  type: "pointOnCircle";
  /** id of a unitCircle or circleShape */
  on: string;
  angleDeg: number;
}

export interface WaveGraphObject {
  id: string;
  type: "waveGraph";
  fn: "sin" | "cos";
  cycles: number;
}

export interface ProjectionObject {
  id: string;
  type: "projection";
  /** id of the object whose position is projected */
  from: string;
  /** id of the object it projects onto */
  to: string;
}

export interface ArrowObject {
  id: string;
  type: "arrowBetween";
  from: string;
  to: string;
  label?: string;
}

export interface LabelObject {
  id: string;
  type: "label";
  text: string;
  /** id of the object this label names */
  near: string;
  placement?: "above" | "below" | "left" | "right";
}

/**
 * The bounded escape hatch: model-generated strokes for something the
 * primitive set can't express. Strokes are normalized 0-1 path data and get
 * scaled into a compiler-allocated box — the model still never controls
 * global layout, only the interior of its own sandbox.
 */
export interface FreeSketchObject {
  id: string;
  type: "freeSketch";
  meaning: string;
  /** SVG path data in 0-1 normalized coordinates */
  strokes: string[];
}

export type SceneObject =
  | BoxObject
  | CircleObject
  | UnitCircleObject
  | PointOnCircleObject
  | WaveGraphObject
  | ProjectionObject
  | ArrowObject
  | LabelObject
  | FreeSketchObject;

export type ConstraintKind = "rightOf" | "leftOf" | "above" | "below" | "alignedY" | "alignedX";
export type Constraint = [ConstraintKind, string, string];

export interface SceneGraph {
  objects: SceneObject[];
  constraints: Constraint[];
}

const isStr = (v: unknown): v is string => typeof v === "string" && v.trim().length > 0;
const isNum = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);
const clamp = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v));

const CONSTRAINT_KINDS: ConstraintKind[] = ["rightOf", "leftOf", "above", "below", "alignedY", "alignedX"];

/**
 * Path data allowed inside a freeSketch: UPPERCASE (absolute) M/L/C/Q/Z
 * commands + numbers only. Lowercase (relative) commands are rejected —
 * the compiler rescales coordinates as if they were absolute positions in
 * the sketch's 0-1 box, so a relative command would land somewhere
 * unintended. Arcs are excluded too (their rx/ry/rotation/flag syntax
 * doesn't alternate x/y). Every coordinate must fall inside [0, 1], or the
 * stroke could escape its allocated box once scaled — the whole point of
 * the sandbox is that freeSketch never controls global layout.
 */
const SAFE_PATH_CHARS = /^[MLCQZ0-9\s,.-]+$/;

function isSafeFreeSketchPath(d: string): boolean {
  if (!SAFE_PATH_CHARS.test(d) || d.length >= 2000) return false;
  // Every numeric coordinate must be within the 0-1 sandbox box.
  for (const m of d.matchAll(/-?\d*\.?\d+/g)) {
    const n = parseFloat(m[0]);
    if (!Number.isFinite(n) || n < 0 || n > 1) return false;
  }
  return true;
}

/**
 * Parses + validates a raw LLM-supplied scene graph. Same contract as every
 * other parser in this app: null on anything unusable, clamp/trim what's
 * salvageable, never render garbage.
 */
export function parseSceneGraph(raw: unknown): SceneGraph | null {
  if (!raw || typeof raw !== "object") return null;
  const data = raw as { objects?: unknown[]; constraints?: unknown[] };
  if (!Array.isArray(data.objects)) return null;

  const objects: SceneObject[] = [];
  const ids = new Set<string>();

  for (const o of data.objects) {
    const s = o as Record<string, unknown>;
    if (!s || !isStr(s.id) || !isStr(s.type) || ids.has(s.id)) continue;
    const id = s.id.slice(0, 32);

    if (s.type === "box") {
      objects.push({ id, type: "box", label: isStr(s.label) ? s.label.slice(0, 24) : undefined });
    } else if (s.type === "circleShape") {
      objects.push({
        id,
        type: "circleShape",
        label: isStr(s.label) ? s.label.slice(0, 24) : undefined,
        size: isNum(s.size) ? clamp(s.size, 0.4, 2.5) : undefined,
      });
    } else if (s.type === "unitCircle") {
      objects.push({ id, type: "unitCircle" });
    } else if (s.type === "pointOnCircle" && isStr(s.on)) {
      objects.push({ id, type: "pointOnCircle", on: s.on, angleDeg: isNum(s.angleDeg) ? s.angleDeg : 0 });
    } else if (s.type === "waveGraph") {
      const fn = s.fn === "cos" ? "cos" : "sin";
      objects.push({ id, type: "waveGraph", fn, cycles: isNum(s.cycles) ? Math.round(clamp(s.cycles, 1, 3)) : 1 });
    } else if (s.type === "projection" && isStr(s.from) && isStr(s.to)) {
      objects.push({ id, type: "projection", from: s.from, to: s.to });
    } else if (s.type === "arrowBetween" && isStr(s.from) && isStr(s.to)) {
      objects.push({
        id,
        type: "arrowBetween",
        from: s.from,
        to: s.to,
        label: isStr(s.label) ? s.label.slice(0, 20) : undefined,
      });
    } else if (s.type === "label" && isStr(s.text) && isStr(s.near)) {
      const placement =
        s.placement === "above" || s.placement === "below" || s.placement === "left" || s.placement === "right"
          ? s.placement
          : undefined;
      objects.push({ id, type: "label", text: s.text.slice(0, 28), near: s.near, placement });
    } else if (s.type === "freeSketch" && isStr(s.meaning) && Array.isArray(s.strokes)) {
      const strokes = (s.strokes as unknown[])
        .filter((p): p is string => typeof p === "string" && isSafeFreeSketchPath(p))
        .slice(0, 12);
      if (strokes.length) objects.push({ id, type: "freeSketch", meaning: s.meaning.slice(0, 40), strokes });
    } else {
      continue;
    }
    ids.add(id);
  }
  if (!objects.length) return null;

  const constraints: Constraint[] = [];
  if (Array.isArray(data.constraints)) {
    for (const c of data.constraints) {
      if (!Array.isArray(c) || c.length !== 3) continue;
      const [kind, a, b] = c as unknown[];
      if (CONSTRAINT_KINDS.includes(kind as ConstraintKind) && isStr(a) && isStr(b) && ids.has(a) && ids.has(b)) {
        constraints.push([kind as ConstraintKind, a, b]);
      }
    }
  }

  // Drop reference objects whose targets don't exist rather than failing whole graph.
  const valid = objects.filter((o) => {
    if (o.type === "pointOnCircle") return ids.has(o.on);
    if (o.type === "projection") return ids.has(o.from) && ids.has(o.to);
    if (o.type === "arrowBetween") return ids.has(o.from) && ids.has(o.to);
    if (o.type === "label") return ids.has(o.near);
    return true;
  });
  if (!valid.length) return null;

  return { objects: valid, constraints };
}
