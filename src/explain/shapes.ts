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
        if (points.length >= 3) shapes.push({ type: "polygon", points });
      }
    }
    return shapes.length ? { shapes } : null;
  } catch {
    return null;
  }
}
