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

  for (const o of graph.objects) {
    const strokes: StrokeItem[] = [];
    const texts: TextItem[] = [];
    const box = boxes.get(o.id);

    if (o.type === "box" && box) {
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
      considerPoint(t.x - 40, t.y - 16);
      considerPoint(t.x + 40, t.y + 8);
    }
  }
  if (!Number.isFinite(minX) || maxX <= minX || maxY <= minY) return null;

  return {
    viewBox: [minX - MARGIN, minY - MARGIN, maxX - minX + MARGIN * 2, maxY - minY + MARGIN * 2],
    groups,
  };
}
