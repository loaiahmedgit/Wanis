import type { Font } from "opentype.js";

export interface GlyphPath {
  d: string;
}

export interface LineLayout {
  glyphs: GlyphPath[];
  /** Cursor x position after the last glyph — used as the line's ink width. */
  width: number;
}

/**
 * Lays out glyphs manually instead of using font.getPaths()/getPath() on the
 * whole string. opentype.js's curve flattening hits a floating-point edge
 * case at certain fractional x offsets (divide-by-zero in specific
 * quadratic segments) that corrupts a glyph's path into "NaN" coordinates —
 * rounding each glyph's x position to a whole unit avoids it entirely.
 */
export function layoutGlyphs(font: Font, text: string, x0: number, y: number, fontSize: number): LineLayout {
  const scale = fontSize / font.unitsPerEm;
  let x = x0;
  let prevGlyph: ReturnType<Font["charToGlyph"]> | null = null;
  const glyphs: GlyphPath[] = [];

  for (const ch of text) {
    const glyph = font.charToGlyph(ch);
    if (prevGlyph) {
      x += font.getKerningValue(prevGlyph, glyph) * scale;
    }
    const path = glyph.getPath(Math.round(x), y, fontSize);
    glyphs.push({ d: path.toPathData(2) });
    x += (glyph.advanceWidth ?? 0) * scale;
    prevGlyph = glyph;
  }

  return { glyphs, width: x };
}
