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

/**
 * A cyclic process: the model lists the ordered member ids (each a declared
 * box/circleShape) and a direction; the compiler arranges them evenly on a
 * ring and routes the connecting arrows (including the closing last->first),
 * so the diagram reads as an actual loop instead of a cramped row. The model
 * never supplies coordinates or arrow geometry.
 */
/** A named transition on the arrow between two consecutive cycle members. */
export interface CycleTransition {
  from: string;
  to: string;
  label: string;
}

export interface CycleObject {
  id: string;
  type: "cycle";
  members: string[];
  direction: "clockwise" | "counterclockwise";
  label?: string;
  /** Optional labels for the generated arrows; each must connect consecutive members. */
  transitions?: CycleTransition[];
}

/**
 * Nested enclosure: a visible parent boundary that CONTAINS its declared
 * members (placeable objects, or another container up to depth 2). The model
 * declares only membership + the semantic boundary style; the compiler sizes
 * the boundary, packs the members inside, and frames everything — the model
 * never supplies any geometry. Members render as their own objects, inside.
 */
export type ContainerBoundary = "box" | "ellipse" | "organic";

export interface ContainerObject {
  id: string;
  type: "container";
  label?: string;
  boundary: ContainerBoundary;
  members: string[];
}

/**
 * A lever / force system (a simple machine). The model declares the ordered
 * points along the bar and their ROLES + force directions; the compiler
 * computes the bar, fulcrum wedge, force arrows, moment-arm dimension lines, and
 * all placement. `spanToNext` is a DIMENSIONLESS ratio of the gap to the next
 * point (never pixels) — the only quantitative input, so arm-length differences
 * (mechanical advantage) can be shown. No coordinates ever come from the model.
 */
export interface LeverPoint {
  id: string;
  role: "effort" | "load" | "fulcrum";
  label?: string;
  /** Direction of the force arrow at this point (omit for no arrow, e.g. the fulcrum). */
  force?: "up" | "down";
  forceLabel?: string;
  /** Relative gap to the NEXT point in order; ignored on the last point. Default 1, clamped 0.25-6. */
  spanToNext?: number;
}

export interface LeverDistanceMarker {
  from: string;
  to: string;
  label: string;
}

export interface LeverObject {
  id: string;
  type: "lever";
  barLabel?: string;
  /** Points in order along the bar, left -> right. */
  points: LeverPoint[];
  distanceMarkers?: LeverDistanceMarker[];
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
  | FreeSketchObject
  | CycleObject
  | ContainerObject
  | LeverObject;

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
    } else if (s.type === "cycle" && Array.isArray(s.members)) {
      const members = (s.members as unknown[]).filter(isStr).slice(0, 8);
      const direction = s.direction === "counterclockwise" ? "counterclockwise" : "clockwise";
      const transitions = Array.isArray(s.transitions)
        ? (s.transitions as unknown[])
            .map((t) => t as Record<string, unknown>)
            .filter((t) => t && isStr(t.from) && isStr(t.to) && isStr(t.label))
            .map((t) => ({ from: t.from as string, to: t.to as string, label: (t.label as string).slice(0, 20) }))
        : undefined;
      // Need >= 3 to form a real ring; a 2-member "cycle" is just A<->B.
      if (members.length >= 3) {
        objects.push({ id, type: "cycle", members, direction, label: isStr(s.label) ? s.label.slice(0, 24) : undefined, transitions });
      }
    } else if (s.type === "container" && Array.isArray(s.members)) {
      const members = (s.members as unknown[]).filter(isStr).slice(0, 8);
      const boundary: ContainerBoundary = s.boundary === "ellipse" ? "ellipse" : s.boundary === "organic" ? "organic" : "box";
      if (members.length >= 1) {
        objects.push({ id, type: "container", label: isStr(s.label) ? s.label.slice(0, 24) : undefined, boundary, members });
      }
    } else if (s.type === "lever" && Array.isArray(s.points)) {
      const points: LeverPoint[] = [];
      const seen = new Set<string>();
      for (const p of s.points as unknown[]) {
        const pr = p as Record<string, unknown>;
        if (!pr || !isStr(pr.id) || seen.has(pr.id)) continue;
        const role = pr.role === "effort" || pr.role === "load" || pr.role === "fulcrum" ? pr.role : null;
        if (!role) continue; // an unknown role is unusable — drop just this point
        seen.add(pr.id);
        points.push({
          id: pr.id.slice(0, 24),
          role,
          label: isStr(pr.label) ? pr.label.slice(0, 20) : undefined,
          // Invalid force value defaults safely to "no arrow" rather than failing.
          force: pr.force === "up" || pr.force === "down" ? pr.force : undefined,
          forceLabel: isStr(pr.forceLabel) ? pr.forceLabel.slice(0, 12) : undefined,
          // Positive finite only; default 1; clamp to a readable, bounded range.
          spanToNext: isNum(pr.spanToNext) && pr.spanToNext > 0 ? clamp(pr.spanToNext, 0.25, 6) : 1,
        });
      }
      const fulcra = points.filter((p) => p.role === "fulcrum").length;
      const efforts = points.filter((p) => p.role === "effort").length;
      const loads = points.filter((p) => p.role === "load").length;
      // A well-formed lever: 3-5 points, exactly one fulcrum, >=1 effort, >=1 load.
      if (points.length >= 3 && points.length <= 5 && fulcra === 1 && efforts >= 1 && loads >= 1) {
        const pids = new Set(points.map((p) => p.id));
        const markers = Array.isArray(s.distanceMarkers)
          ? (s.distanceMarkers as unknown[])
              .map((m) => m as Record<string, unknown>)
              .filter(
                (m) =>
                  m && isStr(m.from) && isStr(m.to) && m.from !== m.to && pids.has(m.from as string) && pids.has(m.to as string) && isStr(m.label),
              )
              .map((m) => ({ from: m.from as string, to: m.to as string, label: (m.label as string).slice(0, 16) }))
              .slice(0, 4)
          : undefined;
        objects.push({
          id,
          type: "lever",
          barLabel: isStr(s.barLabel) ? s.barLabel.slice(0, 20) : undefined,
          points,
          distanceMarkers: markers && markers.length ? markers : undefined,
        });
      }
      // else: malformed lever is dropped (not pushed) — never crashes the graph.
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

  // A member is "placeable" if it's a box/circleShape/unitCircle/waveGraph —
  // the types the ring can actually position. (Kept in sync with compiler
  // SIZES; freeSketch excluded so a cycle can't try to ring-arrange a sketch.)
  const RING_MEMBER_TYPES = new Set(["box", "circleShape", "unitCircle", "waveGraph"]);
  const placeableIds = new Set(objects.filter((o) => RING_MEMBER_TYPES.has(o.type)).map((o) => o.id));

  // No object may belong to two cycles — the ring positions would fight. Claim
  // members greedily in declaration order; a later cycle can't reuse them.
  const claimedByCycle = new Set<string>();

  // Drop reference objects whose targets don't exist rather than failing whole graph.
  const valid = objects
    .map((o): SceneObject | null => {
      if (o.type === "cycle") {
        const members = o.members.filter((m) => placeableIds.has(m) && !claimedByCycle.has(m));
        if (members.length < 3) return null;
        members.forEach((m) => claimedByCycle.add(m));
        // Keep only transitions that connect CONSECUTIVE members (incl. the
        // closing last->first edge); the arrows only exist between those.
        const pairs = new Set(members.map((m, i) => `${m}|${members[(i + 1) % members.length]}`));
        const transitions = o.transitions?.filter((t) => pairs.has(`${t.from}|${t.to}`));
        const cycle: CycleObject = { ...o, members };
        if (transitions && transitions.length) cycle.transitions = transitions;
        else delete cycle.transitions;
        return cycle;
      }
      return o;
    })
    .filter((o): o is SceneObject => o !== null)
    .filter((o) => {
      if (o.type === "pointOnCircle") return ids.has(o.on);
      if (o.type === "projection") return ids.has(o.from) && ids.has(o.to);
      if (o.type === "arrowBetween") return ids.has(o.from) && ids.has(o.to);
      if (o.type === "label") return ids.has(o.near);
      return true;
    });
  if (!valid.length) return null;

  resolveContainment(valid);

  return { objects: valid, constraints };
}

/**
 * Resolve container membership in place: a member must exist and be a
 * containable type, no object may contain itself, each object has at most ONE
 * direct parent (first container to claim it, in declaration order, wins), and
 * containment must be acyclic and nested at most 2 deep. Anything violating
 * these is dropped from the offending container's member list; a container left
 * empty is turned into a plain (member-less) boundary rather than failing the
 * whole graph.
 */
const CONTAINABLE_TYPES = new Set(["box", "circleShape", "unitCircle", "waveGraph", "freeSketch", "container"]);

function resolveContainment(objects: SceneObject[]): void {
  const containers = objects.filter((o): o is ContainerObject => o.type === "container");
  if (!containers.length) return;
  const byId = new Map(objects.map((o) => [o.id, o] as const));
  const isContainer = (id: string) => byId.get(id)?.type === "container";

  // 1. Existence + containable-type + no-self + single-parent (greedy claim).
  const parentOf = new Map<string, string>();
  for (const c of containers) {
    c.members = c.members.filter((m) => {
      const mo = byId.get(m);
      if (m === c.id || !mo || !CONTAINABLE_TYPES.has(mo.type) || parentOf.has(m)) return false;
      parentOf.set(m, c.id);
      return true;
    });
  }

  // 2. Break containment cycles: if walking a container's parent chain returns
  //    to itself, detach it from its parent.
  const detach = (childId: string) => {
    const p = parentOf.get(childId);
    if (!p) return;
    const pc = byId.get(p) as ContainerObject | undefined;
    if (pc) pc.members = pc.members.filter((m) => m !== childId);
    parentOf.delete(childId);
  };
  for (const c of containers) {
    const seen = new Set<string>([c.id]);
    let cur = parentOf.get(c.id);
    while (cur) {
      if (seen.has(cur)) {
        detach(c.id); // this edge closes a cycle
        break;
      }
      seen.add(cur);
      cur = parentOf.get(cur);
    }
  }

  // 3. Enforce nesting depth <= 2 (a container may hold containers, but no
  //    deeper). Promote any container whose chain of container-ancestors is too
  //    long by detaching it from its parent.
  const containerDepth = (id: string): number => {
    let d = 1;
    let cur = parentOf.get(id);
    let guard = 0;
    while (cur && isContainer(cur) && guard++ < 16) {
      d++;
      cur = parentOf.get(cur);
    }
    return d;
  };
  // Shallow-to-deep so promotions settle deterministically.
  for (const c of [...containers].sort((a, b) => containerDepth(a.id) - containerDepth(b.id))) {
    if (containerDepth(c.id) > 2) detach(c.id);
  }
}
