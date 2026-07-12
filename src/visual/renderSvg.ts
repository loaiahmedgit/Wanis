import type { StrokeProgram } from "./strokeProgram";

/**
 * Renders a compiled StrokeProgram to a standalone SVG string showing its
 * FINAL drawn state (all strokes complete, all texts visible). Used to
 * rasterize a scene for the vision critic — outside the app, so it inlines
 * the styles the `.vp-*` CSS classes would otherwise supply (a bare SVG has
 * no App.css). This is the same geometry StrokePlayer animates, frozen at
 * the end. Deliberately faithful to the on-screen look, not pixel-identical
 * (fonts fall back to a system sans — fine for legibility judgement).
 */

const STROKE_STYLE: Record<string, string> = {
  "vp-primary": 'fill="none" stroke="#b3541e" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"',
  "vp-outline": 'fill="none" stroke="#b3541e" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"',
  "vp-axis": 'fill="none" stroke="#9a9488" stroke-width="1.2"',
  "vp-projector": 'fill="none" stroke="#9a9488" stroke-width="1" stroke-dasharray="3 4" opacity="0.7"',
  "vp-dot": 'fill="#b3541e" stroke="#b3541e"',
};

const TEXT_STYLE = 'font-family="Space Grotesk, Arial, sans-serif" font-weight="600" font-size="14" fill="#5a5a66"';

function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

export function renderProgramToSvgString(program: StrokeProgram): string {
  const [vx, vy, vw, vh] = program.viewBox;
  const parts: string[] = [];
  parts.push(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${vx} ${vy} ${vw} ${vh}" width="${Math.round(vw)}" height="${Math.round(vh)}">`,
  );
  parts.push(`<rect x="${vx}" y="${vy}" width="${vw}" height="${vh}" fill="#f4f1ea"/>`);

  for (const group of program.groups) {
    for (const s of group.strokes) {
      const style = STROKE_STYLE[s.css.trim()] ?? STROKE_STYLE["vp-primary"];
      parts.push(`<path d="${s.d}" ${style}/>`);
    }
  }
  for (const group of program.groups) {
    for (const t of group.texts) {
      const anchor = t.anchor ?? "middle";
      parts.push(`<text x="${t.x}" y="${t.y}" text-anchor="${anchor}" ${TEXT_STYLE}>${esc(t.text)}</text>`);
    }
  }
  parts.push("</svg>");
  return parts.join("");
}
