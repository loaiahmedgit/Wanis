/**
 * Deterministic shelf/row packer for a lesson board. Pure geometry: given each
 * section's already-measured intrinsic size, it assigns invisible layout
 * regions on one board coordinate space. No model input, no DOM — unit-testable.
 *
 * Rules (locked with the reviewer):
 *  - headings take their own full-width row (content centered within it);
 *  - ordinary sections flow in reading order and wrap deterministically at the
 *    board width;
 *  - a wide sceneGraph gets its own row at its natural size rather than being
 *    shrunk below a readable minimum;
 *  - a targeted callout flows inline (it lands adjacent to its target, which in
 *    practice is the section just before it; the camera frames their union);
 *  - items in a row are top-aligned; there is compiler-owned padding (`gap`);
 *  - reading direction only mirrors the horizontal flow (RTL), never geometry.
 */
import type { SectionRole, ReadingDirection } from "../explain/lessonBoard";

export interface MeasuredSection {
  id: string;
  role: SectionRole;
  /** Intrinsic content size in board units. */
  w: number;
  h: number;
  /** A callout's target section id, if any (affects camera framing, not packing). */
  target?: string;
}

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface Region {
  id: string;
  role: SectionRole;
  target?: string;
  /** The invisible layout area. */
  x: number;
  y: number;
  w: number;
  h: number;
  /** The actual content rect within the area (== area, except a centered heading). */
  content: Rect;
}

export interface BoardLayout {
  regions: Region[];
  width: number;
  height: number;
}

export interface PackOptions {
  boardWidth: number;
  gap: number;
  dir: ReadingDirection;
  /** A sceneGraph wider than this fraction of the board gets its own row. */
  wideFrac?: number;
}

export function packBoard(items: MeasuredSection[], opts: PackOptions): BoardLayout {
  const { boardWidth, gap } = opts;
  const wideFrac = opts.wideFrac ?? 0.7;
  const regions: Region[] = [];
  let x = 0;
  let rowY = 0;
  let rowH = 0;
  const flush = () => {
    if (rowH > 0) rowY += rowH + gap;
    x = 0;
    rowH = 0;
  };

  for (const m of items) {
    const ownRow = m.role === "heading" || (m.role === "sceneGraph" && m.w > wideFrac * boardWidth);
    if (ownRow) {
      if (x > 0) flush();
      if (m.role === "heading") {
        // Full-width row; the heading text is centered as the content rect.
        regions.push({
          id: m.id,
          role: m.role,
          x: 0,
          y: rowY,
          w: boardWidth,
          h: m.h,
          content: { x: (boardWidth - m.w) / 2, y: rowY, w: m.w, h: m.h },
        });
      } else {
        regions.push({ id: m.id, role: m.role, x: 0, y: rowY, w: m.w, h: m.h, content: { x: 0, y: rowY, w: m.w, h: m.h }, target: m.target });
      }
      rowH = m.h;
      flush();
      continue;
    }
    if (x > 0 && x + m.w > boardWidth) flush();
    regions.push({ id: m.id, role: m.role, x, y: rowY, w: m.w, h: m.h, content: { x, y: rowY, w: m.w, h: m.h }, target: m.target });
    x += m.w + gap;
    rowH = Math.max(rowH, m.h);
  }
  flush();

  const width = Math.max(boardWidth, ...regions.map((r) => r.x + r.w));
  const height = Math.max(0, ...regions.map((r) => r.y + r.h));

  // RTL: mirror the horizontal flow within the final board width (reading
  // semantics only — the compiler still owns every coordinate).
  if (opts.dir === "rtl") {
    for (const r of regions) {
      r.x = width - (r.x + r.w);
      r.content.x = width - (r.content.x + r.content.w);
    }
  }

  return { regions, width, height };
}

/** Smallest rect covering both inputs (for framing a callout with its target). */
export function unionRect(a: Rect, b: Rect): Rect {
  const x = Math.min(a.x, b.x);
  const y = Math.min(a.y, b.y);
  return { x, y, w: Math.max(a.x + a.w, b.x + b.w) - x, h: Math.max(a.y + a.h, b.y + b.h) - y };
}
