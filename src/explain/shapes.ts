export interface CircleShape {
  type: "circle";
  cx: number;
  cy: number;
  r: number;
}
export interface RectShape {
  type: "rect";
  x: number;
  y: number;
  w: number;
  h: number;
}
export interface LineShape {
  type: "line";
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}
export interface ArrowShape {
  type: "arrow";
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}
export interface LabelShape {
  type: "label";
  x: number;
  y: number;
  text: string;
}
export interface PolygonShape {
  type: "polygon";
  points: [number, number][];
}

export type Shape = CircleShape | RectShape | LineShape | ArrowShape | LabelShape | PolygonShape;

export interface DrawingSpec {
  shapes: Shape[];
}

const isNum = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);

function cross(o: [number, number], a: [number, number], b: [number, number]): number {
  return (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
}

function segmentsIntersect(a1: [number, number], a2: [number, number], b1: [number, number], b2: [number, number]): boolean {
  const d1 = cross(b1, b2, a1);
  const d2 = cross(b1, b2, a2);
  const d3 = cross(a1, a2, b1);
  const d4 = cross(a1, a2, b2);
  return (d1 > 0 !== d2 > 0) && (d3 > 0 !== d4 > 0);
}

/**
 * Small LLMs frequently pick polygon corner points in the wrong winding
 * order, which silently renders as a self-crossing "bowtie" shape instead
 * of the simple polygon they meant — a triangle can't do this (3 points
 * can't cross), but anything with 4+ points can and regularly does. Reject
 * rather than render garbage geometry.
 */
function isSelfIntersecting(points: [number, number][]): boolean {
  const n = points.length;
  if (n < 4) return false;
  for (let i = 0; i < n; i++) {
    const a1 = points[i];
    const a2 = points[(i + 1) % n];
    for (let j = i + 1; j < n; j++) {
      const sharesVertex = j === i || j === (i + 1) % n || (j + 1) % n === i;
      if (sharesVertex) continue;
      if (segmentsIntersect(a1, a2, points[j], points[(j + 1) % n])) return true;
    }
  }
  return false;
}

/** Parses & loosely validates a "drawing" step's JSON content. Returns null on any failure. */
export function parseDrawingSpec(content: string): DrawingSpec | null {
  try {
    const data = JSON.parse(content) as { shapes?: unknown[] };
    if (!data || !Array.isArray(data.shapes)) return null;

    const shapes: Shape[] = [];
    for (const raw of data.shapes) {
      const s = raw as Record<string, unknown>;
      if (!s || typeof s.type !== "string") continue;

      if (s.type === "circle" && isNum(s.cx) && isNum(s.cy) && isNum(s.r)) {
        shapes.push({ type: "circle", cx: s.cx, cy: s.cy, r: s.r });
      } else if (s.type === "rect" && isNum(s.x) && isNum(s.y) && isNum(s.w) && isNum(s.h)) {
        shapes.push({ type: "rect", x: s.x, y: s.y, w: s.w, h: s.h });
      } else if ((s.type === "line" || s.type === "arrow") && isNum(s.x1) && isNum(s.y1) && isNum(s.x2) && isNum(s.y2)) {
        shapes.push({ type: s.type, x1: s.x1, y1: s.y1, x2: s.x2, y2: s.y2 });
      } else if (s.type === "label" && isNum(s.x) && isNum(s.y) && typeof s.text === "string") {
        shapes.push({ type: "label", x: s.x, y: s.y, text: s.text.slice(0, 24) });
      } else if (s.type === "polygon" && Array.isArray(s.points)) {
        const points = (s.points as unknown[])
          .filter((p): p is [number, number] => Array.isArray(p) && isNum(p[0]) && isNum(p[1]))
          .map((p) => [p[0], p[1]] as [number, number]);
        if (points.length >= 3 && !isSelfIntersecting(points)) {
          shapes.push({ type: "polygon", points });
        }
      }
    }
    return shapes.length ? { shapes } : null;
  } catch {
    return null;
  }
}
