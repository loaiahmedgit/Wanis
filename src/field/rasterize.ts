export interface TextRegion {
  /** Row (in grid units, 0 = top) where this text's vertical center sits. */
  rowCenter: number;
  /** Height of the text in grid rows — controls the starting font size. */
  rowHeight: number;
  bold?: boolean;
}

const SUPERSAMPLE = 3;
const MAX_WIDTH_FRACTION = 0.92; // leave a small margin on each side
const MIN_FONT_PX = 8;

function fontString(px: number, bold: boolean | undefined): string {
  return `${bold ? "700" : "500"} ${px}px "Space Grotesk", "Segoe UI", system-ui, sans-serif`;
}

/**
 * Rasterizes a line of text into a full-grid-sized intensity array (0..1),
 * everything outside the text is 0. Renders at a supersampled resolution
 * first and downscales, so letterforms stay smooth even though the final
 * grid is coarse.
 *
 * Font size starts from the row height but is measured and shrunk to fit
 * the available width — AI-generated lines vary in length even when asked
 * to stay short, and a fixed size that ignores actual string width just
 * overflows the canvas and clips into unreadable fragments.
 */
export function rasterizeText(
  text: string,
  gridWidth: number,
  gridHeight: number,
  region: TextRegion,
): Float32Array {
  const ssW = gridWidth * SUPERSAMPLE;
  const ssH = gridHeight * SUPERSAMPLE;
  const maxTextWidth = ssW * MAX_WIDTH_FRACTION;

  const canvas = document.createElement("canvas");
  canvas.width = ssW;
  canvas.height = ssH;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("2D canvas context unavailable");

  let fontPx = region.rowHeight * SUPERSAMPLE;
  ctx.font = fontString(fontPx, region.bold);
  const measuredWidth = ctx.measureText(text).width;

  if (measuredWidth > maxTextWidth) {
    fontPx = Math.max(MIN_FONT_PX, fontPx * (maxTextWidth / measuredWidth));
    ctx.font = fontString(fontPx, region.bold);
  }

  ctx.fillStyle = "#ffffff";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(text, ssW / 2, region.rowCenter * SUPERSAMPLE, maxTextWidth);

  const small = document.createElement("canvas");
  small.width = gridWidth;
  small.height = gridHeight;
  const sctx = small.getContext("2d");
  if (!sctx) throw new Error("2D canvas context unavailable");
  sctx.imageSmoothingEnabled = true;
  sctx.imageSmoothingQuality = "high";
  sctx.drawImage(canvas, 0, 0, gridWidth, gridHeight);

  const { data } = sctx.getImageData(0, 0, gridWidth, gridHeight);
  const out = new Float32Array(gridWidth * gridHeight);
  for (let i = 0; i < out.length; i++) {
    out[i] = data[i * 4 + 3] / 255; // alpha channel = text coverage
  }
  return out;
}

/** Merges a text layer into an existing target grid by taking the max at
 * each cell — used to accumulate multiple steps onto the same board. */
export function mergeInto(target: Float32Array, layer: Float32Array): void {
  for (let i = 0; i < target.length; i++) {
    if (layer[i] > target[i]) target[i] = layer[i];
  }
}
