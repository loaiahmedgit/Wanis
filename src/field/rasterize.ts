export interface TextRegion {
  /** Row (in grid units, 0 = top) where this text's vertical center sits. */
  rowCenter: number;
  /** Height of the text in grid rows — controls font size. */
  rowHeight: number;
  bold?: boolean;
}

const SUPERSAMPLE = 3;

/**
 * Rasterizes a line of text into a full-grid-sized intensity array (0..1),
 * everything outside the text is 0. Renders at a supersampled resolution
 * first and downscales, so letterforms stay smooth even though the final
 * grid is coarse.
 */
export function rasterizeText(
  text: string,
  gridWidth: number,
  gridHeight: number,
  region: TextRegion,
): Float32Array {
  const ssW = gridWidth * SUPERSAMPLE;
  const ssH = gridHeight * SUPERSAMPLE;

  const canvas = document.createElement("canvas");
  canvas.width = ssW;
  canvas.height = ssH;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("2D canvas context unavailable");

  const fontPx = region.rowHeight * SUPERSAMPLE;
  ctx.fillStyle = "#ffffff";
  ctx.font = `${region.bold ? "700" : "500"} ${fontPx}px "Space Grotesk", "Segoe UI", system-ui, sans-serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(text, ssW / 2, region.rowCenter * SUPERSAMPLE);

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
