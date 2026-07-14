/**
 * The deterministic geometry compiler: scene graph in, timed stroke program
 * out. All coordinates, sizes, spacing, and stroke order are decided HERE,
 * in code — the model only ever declared objects and relations.
 *
 * v1 layout is a deterministic ordered pass, not a constraint solver:
 * placeable objects get intrinsic sizes, constraints adjust positions in
 * declaration order, attached objects (points, projections, arrows, labels)
 * derive their geometry from their hosts afterward. A real solver
 * (MagicGeo-style) is the upgrade path if relational constraints outgrow
 * this — don't start there.
 */
import type { SceneGraph, SceneObject, Constraint, ContainerObject, LeverObject } from "./sceneGraph";
import type { StrokeProgram, StrokeGroup, StrokeItem, TextItem, FocusRegion } from "./strokeProgram";

interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

const GAP = 70;
const MARGIN = 60;
/** Smallest essential label height in viewBox units — matches `.vp-text` (14px)
 * in App.css; used by the semantic camera's readability test. */
const LABEL_FONT_UNITS = 14;

const SIZES: Record<string, { w: number; h: number }> = {
  box: { w: 150, h: 64 },
  circleShape: { w: 120, h: 120 },
  unitCircle: { w: 260, h: 260 },
  waveGraph: { w: 340, h: 260 },
  freeSketch: { w: 220, h: 180 },
};

function isPlaceable(o: SceneObject): boolean {
  return o.type in SIZES;
}

function center(b: Box): { x: number; y: number } {
  return { x: b.x + b.w / 2, y: b.y + b.h / 2 };
}

const CHAR_W = 8; // rough advance per character at the ~14px label size
/**
 * Anchor-aware text bounds — the single source of truth for both label
 * de-collision and viewBox framing. The x position is the anchor point, so
 * the horizontal span depends on whether the text is start/middle/end
 * anchored; using a fixed ±40 (as an earlier version did) both missed
 * collisions and clipped long side-labels off the edge of the frame.
 */
function textBounds(t: TextItem): { l: number; r: number; t: number; b: number } {
  const w = Math.max(CHAR_W, t.text.length * CHAR_W);
  const anchor = t.anchor ?? "middle";
  const l = anchor === "start" ? t.x : anchor === "end" ? t.x - w : t.x - w / 2;
  return { l, r: l + w, t: t.y - 13, b: t.y + 4 };
}

/** Ordered layout pass: seed placeables left-to-right, then apply constraints in order. */
function layout(graph: SceneGraph): Map<string, Box> {
  const boxes = new Map<string, Box>();
  let cursorX = 0;
  for (const o of graph.objects) {
    if (!isPlaceable(o)) continue;
    const base = SIZES[o.type];
    const scale = o.type === "circleShape" && o.size ? o.size : 1;
    const w = base.w * scale;
    const h = base.h * scale;
    boxes.set(o.id, { x: cursorX, y: 0, w, h });
    cursorX += w + GAP;
  }

  const apply = ([kind, aId, bId]: Constraint) => {
    const a = boxes.get(aId);
    const b = boxes.get(bId);
    if (!a || !b) return;
    if (kind === "rightOf") a.x = b.x + b.w + GAP;
    else if (kind === "leftOf") a.x = b.x - a.w - GAP;
    else if (kind === "below") {
      a.y = b.y + b.h + GAP;
      a.x = b.x + (b.w - a.w) / 2;
    } else if (kind === "above") {
      a.y = b.y - a.h - GAP;
      a.x = b.x + (b.w - a.w) / 2;
    } else if (kind === "alignedY") a.y = b.y + (b.h - a.h) / 2;
    else if (kind === "alignedX") a.x = b.x + (b.w - a.w) / 2;
  };
  // Two passes so later-declared boxes referenced by earlier constraints settle.
  graph.constraints.forEach(apply);
  graph.constraints.forEach(apply);

  // Cycles override their members' positions onto a ring — applied AFTER
  // constraints so the loop layout always wins (constraints on cycle members
  // are effectively superseded, which is what we want). Each cycle rings
  // around its own center, offset so multiple cycles / other content don't
  // stack on top of each other.
  let cycleOffsetX = 0;
  for (const o of graph.objects) {
    if (o.type !== "cycle") continue;
    const members = o.members.map((id) => boxes.get(id)).filter((b): b is Box => !!b);
    const n = members.length;
    if (n < 2) continue;
    const maxDim = Math.max(...members.map((b) => Math.max(b.w, b.h)));
    // Radius large enough that adjacent ring nodes don't touch.
    const minR = (maxDim + GAP + 30) / (2 * Math.sin(Math.PI / n));
    const R = Math.max(150, minR);
    const cx = cycleOffsetX + R + maxDim;
    const cy = R + maxDim;
    for (let i = 0; i < n; i++) {
      // Start at top (-90deg); clockwise = increasing angle in SVG's y-down space.
      const dir = o.direction === "counterclockwise" ? -1 : 1;
      const ang = -Math.PI / 2 + dir * i * ((Math.PI * 2) / n);
      const px = cx + R * Math.cos(ang);
      const py = cy + R * Math.sin(ang);
      const b = members[i];
      b.x = px - b.w / 2;
      b.y = py - b.h / 2;
    }
    cycleOffsetX = cx + R + maxDim + GAP * 2;
  }

  // Containers: nested enclosure, sized BOTTOM-UP (deepest container first) so a
  // parent sees each child container at its final size, then each top-level
  // container's whole subtree is positioned as a unit. Members that have sibling
  // relations keep the arrangement the constraints gave them; otherwise they are
  // grid-packed collision-free. All geometry is computed here.
  const containerObjs = graph.objects.filter((o): o is ContainerObject => o.type === "container");
  if (containerObjs.length) {
    const childrenOf = new Map<string, string[]>();
    const parentOf = new Map<string, string>();
    for (const c of containerObjs) {
      childrenOf.set(c.id, c.members);
      for (const m of c.members) parentOf.set(m, c.id);
    }
    const depthOf = (id: string) => {
      let d = 1;
      let cur = parentOf.get(id);
      let g = 0;
      while (cur && g++ < 16) {
        d++;
        cur = parentOf.get(cur);
      }
      return d;
    };
    // Move a member and, if it is itself a container, its entire subtree.
    const translateSubtree = (id: string, dx: number, dy: number) => {
      const b = boxes.get(id);
      if (b) {
        b.x += dx;
        b.y += dy;
      }
      const kids = childrenOf.get(id);
      if (kids) for (const k of kids) translateSubtree(k, dx, dy);
    };
    const PAD = 28; // gap between members and the boundary
    const INNER_GAP = 26; // gap between packed members
    const LABEL_BAND = 34; // top band reserved for the container's own label
    const membersConstrainedTogether = (members: string[]) => {
      const set = new Set(members);
      return graph.constraints.some(([, a, b]) => set.has(a) && set.has(b));
    };

    // Size deepest containers first.
    for (const c of [...containerObjs].sort((a, b) => depthOf(b.id) - depthOf(a.id))) {
      const ids = c.members.filter((m) => boxes.get(m));
      // A rectangular boundary can reserve a top band for its label; a rounded
      // one (ellipse/organic) instead gets extra size and floats the label in
      // the space its curve already opens up above the members.
      const topBand = c.label && c.boundary === "box" ? LABEL_BAND : 0;
      if (!ids.length) {
        boxes.set(c.id, { x: 0, y: 0, w: 170, h: 90 + topBand });
        continue;
      }
      const mb = ids.map((m) => boxes.get(m)!);
      if (!membersConstrainedTogether(c.members)) {
        // Grid-pack near-square, row-major, collision-free.
        const cols = Math.ceil(Math.sqrt(ids.length));
        const cellW = Math.max(...mb.map((b) => b.w)) + INNER_GAP;
        const cellH = Math.max(...mb.map((b) => b.h)) + INNER_GAP;
        ids.forEach((m, i) => {
          const b = boxes.get(m)!;
          const cx = (i % cols) * cellW + cellW / 2;
          const cy = topBand + Math.floor(i / cols) * cellH + cellH / 2;
          translateSubtree(m, cx - (b.x + b.w / 2), cy - (b.y + b.h / 2));
        });
      } else if (topBand) {
        // Preserve the constrained relative arrangement; drop it below the label.
        const minY0 = Math.min(...mb.map((b) => b.y));
        ids.forEach((m) => translateSubtree(m, 0, topBand + PAD - minY0));
      }
      const minX = Math.min(...mb.map((b) => b.x));
      const minY = Math.min(...mb.map((b) => b.y));
      const maxX = Math.max(...mb.map((b) => b.x + b.w));
      const maxY = Math.max(...mb.map((b) => b.y + b.h));
      if (c.boundary === "box") {
        boxes.set(c.id, {
          x: minX - PAD,
          y: minY - PAD - topBand,
          w: maxX - minX + PAD * 2,
          h: maxY - minY + PAD * 2 + topBand,
        });
      } else {
        // Ellipse/organic must be bigger than the members' bounding rectangle to
        // clear its corners (a rectangle's minimal enclosing ellipse is ~1.41x
        // its half-extents); use a small extra margin so an organic wobble that
        // dips inward still encloses everything.
        const grow = c.boundary === "organic" ? 1.6 : 1.5;
        const rx = (maxX - minX) / 2 + PAD;
        const ry = (maxY - minY) / 2 + PAD;
        const midX = (minX + maxX) / 2;
        const midY = (minY + maxY) / 2;
        boxes.set(c.id, { x: midX - rx * grow, y: midY - ry * grow, w: rx * grow * 2, h: ry * grow * 2 });
      }
    }

    // Position top-level containers left-to-right, after any non-container content.
    let contOffX = Math.max(
      0,
      ...[...boxes.entries()].filter(([id]) => !parentOf.has(id) && !childrenOf.has(id)).map(([, b]) => b.x + b.w),
    );
    if (contOffX > 0) contOffX += GAP;
    for (const c of containerObjs) {
      if (parentOf.has(c.id)) continue; // only top-level containers get re-homed
      const b = boxes.get(c.id)!;
      translateSubtree(c.id, contOffX - b.x, MARGIN - b.y);
      contOffX += b.w + GAP;
    }
  }

  // Levers: a self-contained composite. Reserve each one's bounding box (its
  // intrinsic size comes from computeLever) so framing includes it; emit draws
  // the detail from the same function at this origin.
  const leverObjs = graph.objects.filter((o): o is LeverObject => o.type === "lever");
  if (leverObjs.length) {
    let leverOffX = boxes.size ? Math.max(...[...boxes.values()].map((b) => b.x + b.w)) + GAP : 0;
    for (const o of leverObjs) {
      const { w, h } = computeLever(o, 0, 0);
      boxes.set(o.id, { x: leverOffX, y: MARGIN, w, h });
      leverOffX += w + GAP;
    }
  }

  return boxes;
}

function circlePath(cx: number, cy: number, r: number): string {
  return `M ${cx + r} ${cy} A ${r} ${r} 0 1 1 ${cx - r} ${cy} A ${r} ${r} 0 1 1 ${cx + r} ${cy}`;
}

function ellipsePath(cx: number, cy: number, rx: number, ry: number): string {
  return `M ${cx - rx} ${cy} A ${rx} ${ry} 0 1 0 ${cx + rx} ${cy} A ${rx} ${ry} 0 1 0 ${cx - rx} ${cy} Z`;
}

/**
 * A gently-lobed closed blob for an "organic" container boundary (a cell
 * membrane, an amoeba). Deterministic — the wobble is a fixed function of the
 * angle, not noise — so the same container always draws the same outline.
 */
function organicPath(cx: number, cy: number, rx: number, ry: number): string {
  const N = 16;
  const ks: number[] = [];
  for (let i = 0; i < N; i++) {
    const a = (i / N) * Math.PI * 2;
    ks.push(1 + 0.06 * Math.sin(3 * a) + 0.035 * Math.cos(5 * a + 1.3));
  }
  // Normalize so the largest lobe just reaches rx/ry — the blob fits its box
  // exactly and never clips at the frame edge.
  const maxK = Math.max(...ks);
  const pts: { x: number; y: number }[] = [];
  for (let i = 0; i < N; i++) {
    const a = (i / N) * Math.PI * 2;
    const k = ks[i] / maxK;
    pts.push({ x: cx + rx * k * Math.cos(a), y: cy + ry * k * Math.sin(a) });
  }
  const mid = (p: { x: number; y: number }, q: { x: number; y: number }) => ({ x: (p.x + q.x) / 2, y: (p.y + q.y) / 2 });
  const start = mid(pts[N - 1], pts[0]);
  let d = `M ${start.x.toFixed(1)} ${start.y.toFixed(1)}`;
  for (let i = 0; i < N; i++) {
    const cur = pts[i];
    const m = mid(cur, pts[(i + 1) % N]);
    d += ` Q ${cur.x.toFixed(1)} ${cur.y.toFixed(1)} ${m.x.toFixed(1)} ${m.y.toFixed(1)}`;
  }
  return d + " Z";
}

function roundedRectPath(b: Box, rad: number): string {
  const { x, y, w, h } = b;
  const r = Math.min(rad, w / 2, h / 2);
  return (
    `M ${x + r} ${y} L ${x + w - r} ${y} Q ${x + w} ${y} ${x + w} ${y + r} ` +
    `L ${x + w} ${y + h - r} Q ${x + w} ${y + h} ${x + w - r} ${y + h} ` +
    `L ${x + r} ${y + h} Q ${x} ${y + h} ${x} ${y + h - r} ` +
    `L ${x} ${y + r} Q ${x} ${y} ${x + r} ${y} Z`
  );
}

/**
 * A lever / force diagram, computed entirely from the declared points — bar,
 * fulcrum wedge, force arrows, and moment-arm dimension lines. Returns
 * self-contained strokes + texts offset by (ox, oy) plus the intrinsic size, so
 * the SAME function drives both sizing (called at 0,0 during layout) and drawing
 * (called at the placed origin during emit). The only quantitative input is each
 * point's dimensionless `spanToNext` ratio; never any coordinate.
 */
interface SubGroup {
  meaning: string;
  members: string[];
  strokes: StrokeItem[];
  texts: TextItem[];
}
interface RawFocus {
  meaning: string;
  members: string[];
  groupStart: number;
  groupCount: number;
  bounds: [number, number, number, number];
  kind: "teach" | "overview";
}

/** 1D interval subtraction: parts of [lo,hi] not covered by any drawn interval. */
function subtractIntervals(lo: number, hi: number, drawn: [number, number][]): [number, number][] {
  let segs: [number, number][] = [[lo, hi]];
  for (const [dl, dr] of drawn) {
    const next: [number, number][] = [];
    for (const [a, b] of segs) {
      if (dr <= a || dl >= b) next.push([a, b]);
      else {
        if (a < dl) next.push([a, dl]);
        if (dr < b) next.push([dr, b]);
      }
    }
    segs = next;
  }
  return segs.filter(([a, b]) => b - a > 0.5);
}

/**
 * A lever / force diagram. Emits region-ALIGNED stroke groups so the semantic
 * camera can teach it a frame at a time: shared context (bar title + fulcrum)
 * first and persistent, then the effort arm, then the load arm — the bar is
 * split at the fulcrum via interval subtraction so no bar stroke is ever drawn
 * outside the active frame. Returns groups + focus regions + size; the SAME
 * function drives sizing (at 0,0) and drawing (at the placed origin).
 */
function computeLever(o: LeverObject, ox: number, oy: number): { groups: SubGroup[]; focus: RawFocus[]; w: number; h: number } {
  const pts = o.points;
  const n = pts.length;
  const BAR_BASE = 520;
  const MIN_GAP = 100;
  const OVERHANG = 34;
  const SIDE = 46;
  const FORCE_LEN = 62;
  const FULCRUM_H = 34;
  const FULCRUM_HW = 26;
  const LABEL_H = 20;
  const MARKER_GAP0 = 30;
  const MARKER_STEP = 28;

  const gaps = pts.slice(0, n - 1).map((p) => p.spanToNext ?? 1);
  const total = gaps.reduce((a, b) => a + b, 0) || 1;
  const minGapFrac = Math.min(...gaps) / total;
  const barLen = Math.max(BAR_BASE, MIN_GAP / minGapFrac);

  const startX = SIDE + OVERHANG;
  const xs: number[] = [startX];
  for (let i = 0; i < n - 1; i++) xs.push(xs[i] + (gaps[i] / total) * barLen);

  const hasUp = pts.some((p) => p.force === "up");
  const barTitleH = o.barLabel ? LABEL_H + 4 : 0;
  const barY = barTitleH + LABEL_H + (hasUp ? FORCE_LEN + LABEL_H : 0) + 6;
  const belowBand = Math.max(pts.some((p) => p.force === "down") ? FORCE_LEN + LABEL_H : 0, FULCRUM_H + LABEL_H, LABEL_H);
  const nMarkers = o.distanceMarkers?.length ?? 0;
  const markersTop = barY + belowBand;
  const totalH = markersTop + (nMarkers ? MARKER_GAP0 + nMarkers * MARKER_STEP : 0) + 10;
  const totalW = startX + barLen + OVERHANG + SIDE;
  const barLeft = SIDE;
  const barRight = startX + barLen + OVERHANG;

  const X = (x: number) => x + ox;
  const Y = (y: number) => y + oy;
  const idToX = new Map<string, number>();
  pts.forEach((p, i) => idToX.set(p.id, xs[i]));

  const barStroke = (lo: number, hi: number): StrokeItem => ({ d: `M ${X(lo)} ${Y(barY)} L ${X(hi)} ${Y(barY)}`, css: "vp-primary" });
  const drawnBar: [number, number][] = [];

  // Strokes + texts for one point's force arrow and labels.
  const pointArt = (p: (typeof pts)[number]): { strokes: StrokeItem[]; texts: TextItem[] } => {
    const px = idToX.get(p.id)!;
    const s: StrokeItem[] = [];
    const t: TextItem[] = [];
    if (p.force === "up") {
      const tipY = barY - FORCE_LEN;
      s.push({ d: `M ${X(px)} ${Y(barY)} L ${X(px)} ${Y(tipY)}`, css: "vp-primary" });
      s.push({ d: arrowHeadPath(X(px), Y(tipY), -Math.PI / 2), css: "vp-primary" });
      if (p.forceLabel) t.push({ x: X(px), y: Y(tipY - 8), text: p.forceLabel, css: "vp-label", anchor: "middle" });
      if (p.label) t.push({ x: X(px), y: Y(barY + LABEL_H), text: p.label, css: "vp-label", anchor: "middle" });
    } else if (p.force === "down") {
      const tipY = barY + FORCE_LEN;
      s.push({ d: `M ${X(px)} ${Y(barY)} L ${X(px)} ${Y(tipY)}`, css: "vp-primary" });
      s.push({ d: arrowHeadPath(X(px), Y(tipY), Math.PI / 2), css: "vp-primary" });
      if (p.forceLabel) t.push({ x: X(px), y: Y(tipY + 14), text: p.forceLabel, css: "vp-label", anchor: "middle" });
      if (p.label) t.push({ x: X(px), y: Y(barY - 10), text: p.label, css: "vp-label", anchor: "middle" });
    } else if (p.label) {
      t.push({ x: X(px), y: Y(barY - 10), text: p.label, css: "vp-label", anchor: "middle" });
    }
    return { strokes: s, texts: t };
  };

  const markerArt = (m: NonNullable<LeverObject["distanceMarkers"]>[number], k: number): { strokes: StrokeItem[]; texts: TextItem[] } => {
    const x1 = idToX.get(m.from);
    const x2 = idToX.get(m.to);
    if (x1 === undefined || x2 === undefined) return { strokes: [], texts: [] };
    const y = markersTop + MARKER_GAP0 + k * MARKER_STEP;
    const lo = Math.min(x1, x2);
    const hi = Math.max(x1, x2);
    return {
      strokes: [
        { d: `M ${X(lo)} ${Y(y)} L ${X(hi)} ${Y(y)}`, css: "vp-axis" },
        { d: `M ${X(lo)} ${Y(y - 5)} L ${X(lo)} ${Y(y + 5)}`, css: "vp-axis" },
        { d: `M ${X(hi)} ${Y(y - 5)} L ${X(hi)} ${Y(y + 5)}`, css: "vp-axis" },
      ],
      texts: [{ x: X((lo + hi) / 2), y: Y(y - 6), text: m.label, css: "vp-label", anchor: "middle" }],
    };
  };

  // Draw one point's art (fulcrum wedge, or force arrow + labels) once.
  const drawnPts = new Set<string>();
  const drawPoint = (g: SubGroup, p: (typeof pts)[number]) => {
    if (drawnPts.has(p.id)) return;
    drawnPts.add(p.id);
    const px = idToX.get(p.id)!;
    if (p.role === "fulcrum") {
      g.strokes.push({
        d: `M ${X(px)} ${Y(barY)} L ${X(px - FULCRUM_HW)} ${Y(barY + FULCRUM_H)} L ${X(px + FULCRUM_HW)} ${Y(barY + FULCRUM_H)} Z`,
        css: "vp-outline",
      });
      if (p.label) g.texts.push({ x: X(px), y: Y(barY + FULCRUM_H + LABEL_H), text: p.label, css: "vp-label", anchor: "middle" });
    } else {
      const art = pointArt(p);
      g.strokes.push(...art.strokes);
      g.texts.push(...art.texts);
    }
  };

  // Teaching frames = a sliding window over ADJACENT points in bar order. Each
  // frame is a readable local window (works for every lever class, and reduces
  // to effort+fulcrum then fulcrum+load for a class-1 seesaw). Each frame draws
  // the bar segment between its two points (no bar stroke ever outside the
  // active frame), any newly-introduced point, and any distance marker that
  // fits entirely inside it. Markers spanning multiple frames (the long arm)
  // are drawn at the final overview where both arms compare.
  const groups: SubGroup[] = [];
  const focus: RawFocus[] = [];
  const usedMarkers = new Set<number>();
  const frameBounds = (lo: number, hi: number): [number, number, number, number] => [X(lo), Y(0), hi - lo, totalH];

  for (let i = 0; i < n - 1; i++) {
    const aX = xs[i];
    const bX = xs[i + 1];
    const lo = i === 0 ? barLeft : aX;
    const hi = i === n - 2 ? barRight : bX;
    const g: SubGroup = { meaning: `${pts[i].label ?? pts[i].role} & ${pts[i + 1].label ?? pts[i + 1].role}`, members: [pts[i].id, pts[i + 1].id], strokes: [], texts: [] };
    if (i === 0 && o.barLabel) g.texts.push({ x: X(startX + barLen / 2), y: Y(13), text: o.barLabel, css: "vp-label", anchor: "middle" });
    for (const [s, e] of subtractIntervals(lo, hi, drawnBar)) g.strokes.push(barStroke(s, e));
    drawnBar.push([lo, hi]);
    drawPoint(g, pts[i]);
    drawPoint(g, pts[i + 1]);
    (o.distanceMarkers ?? []).forEach((m, k) => {
      if (usedMarkers.has(k)) return;
      const m1 = idToX.get(m.from);
      const m2 = idToX.get(m.to);
      if (m1 === undefined || m2 === undefined) return;
      if (Math.min(m1, m2) >= lo - 1 && Math.max(m1, m2) <= hi + 1) {
        const art = markerArt(m, k);
        g.strokes.push(...art.strokes);
        g.texts.push(...art.texts);
        usedMarkers.add(k);
      }
    });
    groups.push(g);
    focus.push({ meaning: g.meaning, members: g.members, groupStart: i, groupCount: 1, bounds: frameBounds(lo, hi), kind: "teach" });
  }

  // Overview group: any wide (multi-frame) markers, drawn when the camera pulls
  // back so both arms are seen together.
  const overview: SubGroup = { meaning: "whole lever", members: pts.map((p) => p.id), strokes: [], texts: [] };
  (o.distanceMarkers ?? []).forEach((m, k) => {
    if (usedMarkers.has(k)) return;
    const art = markerArt(m, k);
    overview.strokes.push(...art.strokes);
    overview.texts.push(...art.texts);
  });
  groups.push(overview);
  focus.push({ meaning: "whole lever", members: pts.map((p) => p.id), groupStart: n - 1, groupCount: 1, bounds: [X(0), Y(0), totalW, totalH], kind: "overview" });

  return { groups, focus, w: totalW, h: totalH };
}

/** Two short strokes forming an arrowhead at `tip`, pointing along `angle`. */
function arrowHeadPath(tipX: number, tipY: number, angle: number, len = 11): string {
  const a1 = angle + Math.PI * 0.82;
  const a2 = angle - Math.PI * 0.82;
  return (
    `M ${tipX} ${tipY} L ${tipX + len * Math.cos(a1)} ${tipY + len * Math.sin(a1)} ` +
    `M ${tipX} ${tipY} L ${tipX + len * Math.cos(a2)} ${tipY + len * Math.sin(a2)}`
  );
}

function anchorOnBoxEdge(b: Box, towards: { x: number; y: number }): { x: number; y: number } {
  const c = center(b);
  const dx = towards.x - c.x;
  const dy = towards.y - c.y;
  if (Math.abs(dx) * b.h > Math.abs(dy) * b.w) {
    return { x: c.x + (dx > 0 ? b.w / 2 : -b.w / 2), y: c.y };
  }
  return { x: c.x, y: c.y + (dy > 0 ? b.h / 2 : -b.h / 2) };
}

const boxBounds = (b: Box): [number, number, number, number] => [b.x, b.y, b.w, b.h];
function unionBoxBounds(bs: Box[]): [number, number, number, number] {
  const x = Math.min(...bs.map((b) => b.x));
  const y = Math.min(...bs.map((b) => b.y));
  const r = Math.max(...bs.map((b) => b.x + b.w));
  const bt = Math.max(...bs.map((b) => b.y + b.h));
  return [x, y, r - x, bt - y];
}

/**
 * Focus regions for a CONTAINER (boundary/context first, then nested member
 * chunks in semantic order, then overview) or a wide ROW (frame each adjacent
 * source+destination pair together with their connecting arrow). Returns the
 * possibly-reordered groups + the regions, or null when the scene isn't one of
 * these (compact scenes and cycles read whole). Every group runs exactly once.
 */
function deriveContainerRowFocus(
  graph: SceneGraph,
  groups: StrokeGroup[],
  boxes: Map<string, Box>,
  groupIndexOf: Map<string, number>,
): { groups: StrokeGroup[]; focusRegions: FocusRegion[] } | null {
  const containers = graph.objects.filter((o) => o.type === "container");
  if (containers.length) {
    const memberSet = new Set<string>();
    containers.forEach((c) => (c as ContainerObject).members.forEach((m) => memberSet.add(m)));
    const containerIds = new Set(containers.map((c) => c.id));
    const tops = containers.filter((c) => !memberSet.has(c.id));
    if (tops.length !== 1) return null; // v1: a single top-level container
    const top = tops[0] as ContainerObject;
    const topBox = boxes.get(top.id);
    if (!topBox) return null;
    const containerIdxs = containers.map((c) => groupIndexOf.get(c.id)).filter((i): i is number => i !== undefined);
    if (!containerIdxs.length) return null;
    const boundaryEnd = Math.max(...containerIdxs);

    const regions: FocusRegion[] = [];
    // Boundary/context — all container outlines, framing the whole enclosure.
    // This is an establishing CONTEXT shot (the whole enclosure, so its labels
    // are necessarily small); the detailed teaching is the member chunks below.
    // Judge it contextually (structure only), like the overview — never as a
    // strict teaching frame.
    regions.push({ meaning: top.label ?? "enclosure", members: containers.map((c) => c.id), startGroup: 0, endGroup: boundaryEnd, kind: "overview", bounds: boxBounds(topBox) });
    // Nested member chunks in semantic (group) order.
    const leaves = graph.objects
      .filter((o) => memberSet.has(o.id) && !containerIds.has(o.id) && groupIndexOf.has(o.id) && boxes.has(o.id))
      .map((o) => ({ id: o.id, gi: groupIndexOf.get(o.id)!, box: boxes.get(o.id)! }))
      .sort((a, b) => a.gi - b.gi);
    const CHUNK = 2;
    let lastEnd = boundaryEnd;
    for (let i = 0; i < leaves.length; i += CHUNK) {
      const chunk = leaves.slice(i, i + CHUNK);
      const gis = chunk.map((c) => c.gi);
      regions.push({ meaning: "parts", members: chunk.map((c) => c.id), startGroup: Math.min(...gis), endGroup: Math.max(...gis), kind: "teach", bounds: unionBoxBounds(chunk.map((c) => c.box)) });
      lastEnd = Math.max(...gis);
    }
    // Overview: whatever remains (stray labels) + the whole enclosure.
    regions.push({ meaning: "overview", members: containers.map((c) => c.id), startGroup: lastEnd + 1, endGroup: groups.length - 1, kind: "overview", bounds: boxBounds(topBox) });
    return { groups, focusRegions: regions };
  }

  // ROW: >=3 boxes in a horizontal chain connected by arrows.
  const boxObjs = graph.objects.filter((o) => o.type === "box");
  const arrows = graph.objects.filter((o) => o.type === "arrowBetween") as { id: string; from: string; to: string; label?: string }[];
  if (boxObjs.length < 3 || arrows.length < boxObjs.length - 1) return null;
  const ordered = boxObjs
    .map((o) => ({ id: o.id, box: boxes.get(o.id) }))
    .filter((x): x is { id: string; box: Box } => !!x.box)
    .sort((a, b) => a.box.x - b.box.x);
  const ys = ordered.map((x) => x.box.y + x.box.h / 2);
  if (Math.max(...ys) - Math.min(...ys) > 40) return null; // not a clean horizontal row
  const pairArrow = (a: string, b: string) => arrows.find((ar) => (ar.from === a && ar.to === b) || (ar.from === b && ar.to === a));
  const chain: { id: string }[] = [];
  for (let i = 0; i < ordered.length - 1; i++) {
    const ar = pairArrow(ordered[i].id, ordered[i + 1].id);
    if (!ar) return null;
    chain.push(ar);
  }

  // Interleave groups: box0, arrow01, box1, arrow12, box2, ... then leftovers.
  const newGroups: StrokeGroup[] = [];
  const newIndex = new Map<string, number>();
  const push = (id: string) => {
    const gi = groupIndexOf.get(id);
    if (gi === undefined || newIndex.has(id)) return;
    newIndex.set(id, newGroups.length);
    newGroups.push(groups[gi]);
  };
  push(ordered[0].id);
  for (let i = 0; i < chain.length; i++) {
    push(chain[i].id);
    push(ordered[i + 1].id);
  }
  for (const o of graph.objects) if (!newIndex.has(o.id) && groupIndexOf.has(o.id)) push(o.id);

  const regions: FocusRegion[] = [];
  for (let i = 0; i < ordered.length - 1; i++) {
    const startId = i === 0 ? ordered[0].id : chain[i].id;
    regions.push({
      meaning: `${ordered[i].id} -> ${ordered[i + 1].id}`,
      members: [ordered[i].id, chain[i].id, ordered[i + 1].id],
      startGroup: newIndex.get(startId)!,
      endGroup: newIndex.get(ordered[i + 1].id)!,
      kind: "teach",
      bounds: unionBoxBounds([ordered[i].box, ordered[i + 1].box]),
    });
  }
  const lastWindowEnd = newIndex.get(ordered[ordered.length - 1].id)!;
  regions.push({ meaning: "overview", members: ordered.map((x) => x.id), startGroup: lastWindowEnd + 1, endGroup: newGroups.length - 1, kind: "overview", bounds: unionBoxBounds(ordered.map((x) => x.box)) });
  return { groups: newGroups, focusRegions: regions };
}

/** Where "the point" of an object lives, for projections/arrows to target. */
function anchor(o: SceneObject, boxes: Map<string, Box>, objects: SceneObject[]): { x: number; y: number } | null {
  const box = boxes.get(o.id);
  if (o.type === "pointOnCircle") {
    const host = boxes.get(o.on);
    const hostObj = objects.find((x) => x.id === o.on);
    if (!host || !hostObj) return null;
    const c = center(host);
    const r = Math.min(host.w, host.h) / 2 - (hostObj.type === "unitCircle" ? 20 : 0);
    const rad = (o.angleDeg * Math.PI) / 180;
    return { x: c.x + r * Math.cos(rad), y: c.y - r * Math.sin(rad) };
  }
  if (box) return center(box);
  return null;
}

export function compileSceneGraph(graph: SceneGraph): StrokeProgram | null {
  const boxes = layout(graph);
  if (!boxes.size) return null;
  const groups: StrokeGroup[] = [];
  const focusRegions: FocusRegion[] = [];
  const groupIndexOf = new Map<string, number>();

  // Draw order (the StrokePlayer inks groups in sequence): container boundaries
  // first (outermost, then nested), so each enclosure is drawn before the parts
  // inside it; then everything in declared order; then cycles last (their arrows
  // must trace after the member boxes they connect). Graphs without containers
  // are unaffected — this reduces to the previous "cycles last" order.
  const containerParent = new Map<string, string>();
  for (const o of graph.objects) if (o.type === "container") for (const m of o.members) containerParent.set(m, o.id);
  const containerDepth = (id: string) => {
    let d = 1;
    let cur = containerParent.get(id);
    let g = 0;
    while (cur && g++ < 16) {
      d++;
      cur = containerParent.get(cur);
    }
    return d;
  };
  const emitPriority = (o: SceneObject) => (o.type === "container" ? -100 + containerDepth(o.id) : o.type === "cycle" ? 100 : 0);
  const emitOrder = [...graph.objects].sort((a, b) => emitPriority(a) - emitPriority(b));

  // Ring geometry per cycle member, so a BRANCH edge (an arrowBetween whose
  // endpoints are two members of the same cycle — e.g. a respiration path
  // across the carbon cycle) can be routed clear of the ring edges and the
  // center label, instead of cutting a straight chord that sits on top of them.
  interface RingInfo {
    cycleId: string;
    ringC: { x: number; y: number };
    idx: number;
    n: number;
  }
  const ringMember = new Map<string, RingInfo>();
  for (const o of graph.objects) {
    if (o.type !== "cycle") continue;
    const mb = o.members.map((id) => boxes.get(id)).filter((b): b is Box => !!b);
    const n = mb.length;
    if (n < 2) continue;
    let sx = 0;
    let sy = 0;
    for (const b of mb) {
      const c = center(b);
      sx += c.x;
      sy += c.y;
    }
    const ringC = { x: sx / n, y: sy / n };
    o.members.forEach((id, idx) => {
      if (boxes.get(id)) ringMember.set(id, { cycleId: o.id, ringC, idx, n });
    });
  }

  for (const o of emitOrder) {
    const strokes: StrokeItem[] = [];
    const texts: TextItem[] = [];
    const box = boxes.get(o.id);

    if (o.type === "cycle") {
      // The member boxes are emitted by their own object entries; the cycle
      // emits only the connecting arrows (consecutive, closing last->first)
      // and an optional center label. Arrows bow slightly outward from the
      // ring center so they read as an arc, not a chord across the middle.
      const memberBoxes = o.members.map((id) => boxes.get(id)).filter((b): b is Box => !!b);
      const n = memberBoxes.length;
      if (n >= 2) {
        let sumX = 0;
        let sumY = 0;
        for (const b of memberBoxes) {
          const c = center(b);
          sumX += c.x;
          sumY += c.y;
        }
        const ringC = { x: sumX / n, y: sumY / n };
        for (let i = 0; i < n; i++) {
          const from = memberBoxes[i];
          const to = memberBoxes[(i + 1) % n];
          const cf = center(from);
          const ct = center(to);
          const p1 = anchorOnBoxEdge(from, ct);
          const p2 = anchorOnBoxEdge(to, cf);
          // Control point: midpoint pushed outward from the ring center.
          const mx = (p1.x + p2.x) / 2;
          const my = (p1.y + p2.y) / 2;
          const ox = mx - ringC.x;
          const oy = my - ringC.y;
          const olen = Math.hypot(ox, oy) || 1;
          const bow = 26;
          const ctrl = { x: mx + (ox / olen) * bow, y: my + (oy / olen) * bow };
          strokes.push({ d: `M ${p1.x} ${p1.y} Q ${ctrl.x} ${ctrl.y} ${p2.x} ${p2.y}`, css: "vp-primary" });
          const headAngle = Math.atan2(p2.y - ctrl.y, p2.x - ctrl.x);
          strokes.push({ d: arrowHeadPath(p2.x, p2.y, headAngle), css: "vp-primary" });

          // Optional transition label, placed just outside this arrow's arc.
          const fromId = o.members[i];
          const toId = o.members[(i + 1) % n];
          const tr = o.transitions?.find((t) => t.from === fromId && t.to === toId);
          if (tr) {
            texts.push({
              x: mx + (ox / olen) * (bow + 16),
              y: my + (oy / olen) * (bow + 16),
              text: tr.label,
              css: "vp-label",
              anchor: "middle",
            });
          }
        }
        if (o.label) texts.push({ x: ringC.x, y: ringC.y, text: o.label, css: "vp-label", anchor: "middle" });
      }
    } else if (o.type === "container" && box) {
      const c = center(box);
      let labelY = box.y + 21; // box: inside the reserved top band
      if (o.boundary === "ellipse") {
        strokes.push({ d: ellipsePath(c.x, c.y, box.w / 2, box.h / 2), css: "vp-outline" });
        labelY = c.y - box.h * 0.3; // upper region, where the curve is still wide
      } else if (o.boundary === "organic") {
        strokes.push({ d: organicPath(c.x, c.y, box.w / 2, box.h / 2), css: "vp-outline" });
        labelY = c.y - box.h * 0.3;
      } else {
        strokes.push({ d: roundedRectPath(box, 16), css: "vp-outline" });
      }
      if (o.label) texts.push({ x: c.x, y: labelY, text: o.label, css: "vp-label", anchor: "middle" });
    } else if (o.type === "lever" && box) {
      // The lever emits region-aligned groups; push them directly and record its
      // focus regions with absolute group indices. (strokes/texts stay empty so
      // no extra generic group is added for this object below.)
      const g = computeLever(o, box.x, box.y);
      const base = groups.length;
      for (const sg of g.groups) groups.push({ meaning: sg.meaning, strokes: sg.strokes, texts: sg.texts });
      for (const f of g.focus) {
        focusRegions.push({
          bounds: f.bounds,
          members: f.members,
          startGroup: base + f.groupStart,
          endGroup: base + f.groupStart + f.groupCount - 1,
          kind: f.kind,
          meaning: f.meaning,
        });
      }
    } else if (o.type === "box" && box) {
      strokes.push({ d: roundedRectPath(box, 10), css: "vp-outline" });
      if (o.label) {
        const c = center(box);
        texts.push({ x: c.x, y: c.y + 5, text: o.label, css: "vp-label", anchor: "middle" });
      }
    } else if (o.type === "circleShape" && box) {
      const c = center(box);
      strokes.push({ d: circlePath(c.x, c.y, box.w / 2), css: "vp-outline" });
      if (o.label) texts.push({ x: c.x, y: box.y + box.h + 22, text: o.label, css: "vp-label", anchor: "middle" });
    } else if (o.type === "unitCircle" && box) {
      const c = center(box);
      const r = box.w / 2 - 20;
      strokes.push({ d: `M ${box.x} ${c.y} L ${box.x + box.w} ${c.y}`, css: "vp-axis" });
      strokes.push({ d: `M ${c.x} ${box.y} L ${c.x} ${box.y + box.h}`, css: "vp-axis" });
      strokes.push({ d: circlePath(c.x, c.y, r), css: "vp-primary" });
    } else if (o.type === "pointOnCircle") {
      const p = anchor(o, boxes, graph.objects);
      const host = boxes.get(o.on);
      if (p && host) {
        const c = center(host);
        strokes.push({ d: `M ${c.x} ${c.y} L ${p.x} ${p.y}`, css: "vp-primary" });
        strokes.push({ d: circlePath(p.x, p.y, 5), css: "vp-dot" });
      }
    } else if (o.type === "waveGraph" && box) {
      const originX = box.x + 14;
      const midY = box.y + box.h / 2;
      const amp = box.h / 2 - 24;
      strokes.push({ d: `M ${originX} ${box.y} L ${originX} ${box.y + box.h}`, css: "vp-axis" });
      strokes.push({ d: `M ${box.x} ${midY} L ${box.x + box.w} ${midY}`, css: "vp-axis" });
      const pts: string[] = [];
      const thetaMax = o.cycles * Math.PI * 2;
      const width = box.w - 24;
      for (let i = 0; i <= 90; i++) {
        const t = (i / 90) * thetaMax;
        const x = originX + (t / thetaMax) * width;
        const v = o.fn === "sin" ? Math.sin(t) : Math.cos(t);
        pts.push(`${x.toFixed(1)} ${(midY - amp * v).toFixed(1)}`);
      }
      strokes.push({ d: `M ${pts.join(" L ")}`, css: "vp-primary" });
      texts.push({ x: originX + 8, y: box.y + 14, text: `y = ${o.fn}(theta)`, css: "vp-label", anchor: "start" });
    } else if (o.type === "projection") {
      const fromObj = graph.objects.find((x) => x.id === o.from);
      const toBox = boxes.get(o.to);
      const p = fromObj ? anchor(fromObj, boxes, graph.objects) : null;
      if (p && toBox) {
        const target = anchorOnBoxEdge(toBox, p);
        strokes.push({ d: `M ${p.x} ${p.y} L ${target.x} ${p.y}`, css: "vp-projector" });
        void target;
      }
    } else if (o.type === "arrowBetween") {
      const fromObj = graph.objects.find((x) => x.id === o.from);
      const toObj = graph.objects.find((x) => x.id === o.to);
      const pFromC = fromObj ? anchor(fromObj, boxes, graph.objects) : null;
      const pToC = toObj ? anchor(toObj, boxes, graph.objects) : null;
      const fromBox = boxes.get(o.from);
      const toBox = boxes.get(o.to);
      if (pFromC && pToC) {
        const p1 = fromBox ? anchorOnBoxEdge(fromBox, pToC) : pFromC;
        const p2 = toBox ? anchorOnBoxEdge(toBox, pFromC) : pToC;
        const mx = (p1.x + p2.x) / 2;
        const my = (p1.y + p2.y) / 2;
        const rf = ringMember.get(o.from);
        const rt = ringMember.get(o.to);

        if (rf && rt && rf.cycleId === rt.cycleId) {
          // BRANCH edge across a cycle ring — route it as a bowed arc so it
          // clears the ring's own arrows and its center label (a straight
          // chord sits on top of both, and text de-collision can't move
          // strokes). Adjacent members share a ring edge that already bows
          // OUTWARD, so bow this one INWARD to separate them; non-adjacent
          // members' chord passes near the center, so bow it PERPENDICULAR to
          // arc around the center label.
          const ringC = rf.ringC;
          const rx = mx - ringC.x;
          const ry = my - ringC.y;
          const rlen = Math.hypot(rx, ry);
          const dIdx = Math.abs(rf.idx - rt.idx);
          const adjacent = dIdx === 1 || dIdx === rf.n - 1;
          let cx: number;
          let cy: number;
          let lx: number;
          let ly: number;
          if (adjacent && rlen > 1) {
            const ux = rx / rlen;
            const uy = ry / rlen;
            const bow = 34;
            cx = mx - ux * bow;
            cy = my - uy * bow;
            lx = mx - ux * (bow + 16);
            ly = my - uy * (bow + 16);
          } else {
            const dx = p2.x - p1.x;
            const dy = p2.y - p1.y;
            const dlen = Math.hypot(dx, dy) || 1;
            let px = -dy / dlen;
            let py = dx / dlen;
            // Point the bow to the side away from the ring center when the
            // chord is off-center (keeps the arc clear of the middle label).
            if (px * rx + py * ry < 0) {
              px = -px;
              py = -py;
            }
            const bow = 52;
            cx = mx + px * bow;
            cy = my + py * bow;
            lx = mx + px * (bow + 16);
            ly = my + py * (bow + 16);
          }
          strokes.push({ d: `M ${p1.x} ${p1.y} Q ${cx} ${cy} ${p2.x} ${p2.y}`, css: "vp-primary" });
          strokes.push({ d: arrowHeadPath(p2.x, p2.y, Math.atan2(p2.y - cy, p2.x - cx)), css: "vp-primary" });
          if (o.label) texts.push({ x: lx, y: ly, text: o.label, css: "vp-label", anchor: "middle" });
        } else {
          strokes.push({ d: `M ${p1.x} ${p1.y} L ${p2.x} ${p2.y}`, css: "vp-primary" });
          strokes.push({ d: arrowHeadPath(p2.x, p2.y, Math.atan2(p2.y - p1.y, p2.x - p1.x)), css: "vp-primary" });
          if (o.label) texts.push({ x: mx, y: my - 10, text: o.label, css: "vp-label", anchor: "middle" });
        }
      }
    } else if (o.type === "label") {
      const nearObj = graph.objects.find((x) => x.id === o.near);
      const nearBox = boxes.get(o.near);
      const p = nearObj ? anchor(nearObj, boxes, graph.objects) : null;
      if (p) {
        const placement = o.placement ?? "below";
        const halfH = nearBox ? nearBox.h / 2 : 12;
        const halfW = nearBox ? nearBox.w / 2 : 12;
        let x = p.x;
        let y = p.y;
        let anchorPos: TextItem["anchor"] = "middle";
        if (placement === "below") y = p.y + halfH + 24;
        else if (placement === "above") y = p.y - halfH - 12;
        else if (placement === "left") {
          x = p.x - halfW - 10;
          anchorPos = "end";
        } else {
          x = p.x + halfW + 10;
          anchorPos = "start";
        }
        texts.push({ x, y, text: o.text, css: "vp-label", anchor: anchorPos });
      }
    } else if (o.type === "freeSketch" && box) {
      // Scale normalized 0-1 strokes into the allocated sandbox box by
      // rewriting every number: even index = x, odd index = y within each
      // coordinate pair stream. Conservative but works for M/L/C/Q data.
      for (const raw of o.strokes) {
        let idx = 0;
        const d = raw.replace(/-?\d*\.?\d+/g, (numStr) => {
          const n = parseFloat(numStr);
          const scaled = idx % 2 === 0 ? box.x + n * box.w : box.y + n * box.h;
          idx++;
          return scaled.toFixed(1);
        });
        strokes.push({ d, css: "vp-primary" });
      }
      texts.push({
        x: box.x + box.w / 2,
        y: box.y + box.h + 22,
        text: o.meaning,
        css: "vp-label",
        anchor: "middle",
      });
    }

    if (strokes.length || texts.length) {
      const meaning =
        o.type === "label" ? `label: ${o.text}` : o.type === "freeSketch" ? o.meaning : `${o.type} ${o.id}`;
      groupIndexOf.set(o.id, groups.length);
      groups.push({ meaning, strokes, texts });
    }
  }

  if (!groups.length) return null;

  // If no construct emitted its own focus regions (only the lever does), try to
  // derive them for a container or a wide row so the semantic camera can teach
  // the scene region-by-region on a small viewport.
  if (!focusRegions.length) {
    const derived = deriveContainerRowFocus(graph, groups, boxes, groupIndexOf);
    if (derived) {
      // The row path returns a reordered NEW array; the container path returns
      // the same array unchanged — only swap contents when it actually differs.
      if (derived.groups !== groups) {
        const reordered = derived.groups.slice();
        groups.length = 0;
        groups.push(...reordered);
      }
      focusRegions.push(...derived.focusRegions);
    }
  }

  // De-collide labels: the LLM commonly puts two labels near the same point
  // (an object's own label + a separate label targeting it, or an arrow
  // label crossing a node label), which the layout can't foresee. Nudge
  // overlapping text items apart vertically so none stack on each other.
  const allTexts = groups.flatMap((g) => g.texts);
  const overlaps = (a: TextItem, b: TextItem) => {
    const ba = textBounds(a);
    const bb = textBounds(b);
    return ba.l < bb.r && ba.r > bb.l && ba.t < bb.b && ba.b > bb.t;
  };
  // Process in reading order (top-to-bottom); push any colliding later text down.
  allTexts.sort((a, b) => a.y - b.y || a.x - b.x);
  for (let i = 0; i < allTexts.length; i++) {
    for (let pass = 0; pass < 6; pass++) {
      let moved = false;
      for (let j = 0; j < i; j++) {
        if (overlaps(allTexts[i], allTexts[j])) {
          allTexts[i].y = textBounds(allTexts[j]).b + 15;
          moved = true;
        }
      }
      if (!moved) break;
    }
  }

  // Overall bounding box -> viewBox with margin. Computed from the layout
  // boxes and anchor points, NOT by parsing numbers out of emitted path
  // data — circle arcs (A rx ry rot flag flag x y) don't alternate x/y, so
  // a naive numeric scan mis-assigns axes and corrupts the framing.
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  const considerPoint = (x: number, y: number) => {
    minX = Math.min(minX, x);
    maxX = Math.max(maxX, x);
    minY = Math.min(minY, y);
    maxY = Math.max(maxY, y);
  };
  for (const b of boxes.values()) {
    considerPoint(b.x, b.y);
    considerPoint(b.x + b.w, b.y + b.h);
  }
  for (const o of graph.objects) {
    if (!isPlaceable(o)) {
      const p = anchor(o, boxes, graph.objects);
      if (p) considerPoint(p.x, p.y);
    }
  }
  for (const g of groups) {
    for (const t of g.texts) {
      const tb = textBounds(t);
      considerPoint(tb.l, tb.t);
      considerPoint(tb.r, tb.b);
    }
  }
  if (!Number.isFinite(minX) || maxX <= minX || maxY <= minY) return null;

  // Expand each focus region to include the ACTUAL text extents drawn in its
  // groups (using final, de-collided positions) so a teaching frame never clips
  // a label at its edge.
  for (const r of focusRegions) {
    let rx0 = r.bounds[0];
    let ry0 = r.bounds[1];
    let rx1 = r.bounds[0] + r.bounds[2];
    let ry1 = r.bounds[1] + r.bounds[3];
    for (let gi = r.startGroup; gi <= r.endGroup; gi++) {
      const g = groups[gi];
      if (!g) continue;
      for (const t of g.texts) {
        const tb = textBounds(t);
        rx0 = Math.min(rx0, tb.l);
        ry0 = Math.min(ry0, tb.t);
        rx1 = Math.max(rx1, tb.r);
        ry1 = Math.max(ry1, tb.b);
      }
    }
    r.bounds = [rx0, ry0, rx1 - rx0, ry1 - ry0];
  }

  return {
    viewBox: [minX - MARGIN, minY - MARGIN, maxX - minX + MARGIN * 2, maxY - minY + MARGIN * 2],
    groups,
    ...(focusRegions.length ? { focusRegions, minLabelSize: LABEL_FONT_UNITS } : {}),
  };
}
