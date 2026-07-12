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
import type { SceneGraph, SceneObject, Constraint } from "./sceneGraph";
import type { StrokeProgram, StrokeGroup, StrokeItem, TextItem } from "./strokeProgram";

interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

const GAP = 70;
const MARGIN = 60;

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

  return boxes;
}

function circlePath(cx: number, cy: number, r: number): string {
  return `M ${cx + r} ${cy} A ${r} ${r} 0 1 1 ${cx - r} ${cy} A ${r} ${r} 0 1 1 ${cx + r} ${cy}`;
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

  // Emit member objects before cycle arrows regardless of JSON order — the
  // StrokePlayer draws groups in sequence, so a cycle declared before its
  // members would otherwise trace its arrows before the boxes they connect.
  // Stable sort: cycles last, everything else keeps its declared order.
  const emitOrder = [...graph.objects].sort((a, b) => (a.type === "cycle" ? 1 : 0) - (b.type === "cycle" ? 1 : 0));

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
        strokes.push({ d: `M ${p1.x} ${p1.y} L ${p2.x} ${p2.y}`, css: "vp-primary" });
        const ang = Math.atan2(p2.y - p1.y, p2.x - p1.x);
        const hl = 10;
        const a1 = ang + Math.PI * 0.82;
        const a2 = ang - Math.PI * 0.82;
        strokes.push({
          d:
            `M ${p2.x} ${p2.y} L ${p2.x + hl * Math.cos(a1)} ${p2.y + hl * Math.sin(a1)} ` +
            `M ${p2.x} ${p2.y} L ${p2.x + hl * Math.cos(a2)} ${p2.y + hl * Math.sin(a2)}`,
          css: "vp-primary",
        });
        if (o.label) {
          texts.push({
            x: (p1.x + p2.x) / 2,
            y: (p1.y + p2.y) / 2 - 10,
            text: o.label,
            css: "vp-label",
            anchor: "middle",
          });
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
      groups.push({ meaning, strokes, texts });
    }
  }

  if (!groups.length) return null;

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

  return {
    viewBox: [minX - MARGIN, minY - MARGIN, maxX - minX + MARGIN * 2, maxY - minY + MARGIN * 2],
    groups,
  };
}
