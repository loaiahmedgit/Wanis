/**
 * Loads a grayscale depth-map image and resamples it down to the pin-grid
 * resolution. Returns normalized brightness values in [0, 1], row-major,
 * matching the grid's (x, y) -> index = y * gridWidth + x layout.
 *
 * Phase 1 uses a manually supplied image (no AI inference yet, per the
 * project's locked decisions) — this module's only job is turning that
 * image into grid-sized samples.
 */
export async function loadDepthMap(
  url: string,
  gridWidth: number,
  gridHeight: number,
): Promise<Float32Array> {
  try {
    const image = await loadImage(url);
    return sampleImageToGrid(image, gridWidth, gridHeight);
  } catch (err) {
    console.warn(
      `Perception Field: failed to load depth map "${url}" (${String(err)}). ` +
        "Falling back to a procedurally generated placeholder so the field still forms something.",
    );
    return generateFallbackDepthMap(gridWidth, gridHeight);
  }
}

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`could not load image at ${url}`));
    img.src = url;
  });
}

function sampleImageToGrid(
  image: HTMLImageElement,
  gridWidth: number,
  gridHeight: number,
): Float32Array {
  const canvas = document.createElement("canvas");
  canvas.width = gridWidth;
  canvas.height = gridHeight;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("2D canvas context unavailable");

  // Draw scaled directly to grid resolution — the browser's image
  // downscaling does a reasonable box-filter-ish average for our purposes.
  ctx.drawImage(image, 0, 0, gridWidth, gridHeight);
  const { data } = ctx.getImageData(0, 0, gridWidth, gridHeight);

  const out = new Float32Array(gridWidth * gridHeight);
  for (let i = 0; i < out.length; i++) {
    const r = data[i * 4];
    const g = data[i * 4 + 1];
    const b = data[i * 4 + 2];
    // Standard luminance weighting; source is grayscale so r≈g≈b, but this
    // stays correct even if a color image is dropped in later.
    const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
    out[i] = luminance;
  }
  return out;
}

/** A smooth radial bump — not meant to resemble anything specific, just
 * proof that the field still animates if the real asset fails to load. */
function generateFallbackDepthMap(gridWidth: number, gridHeight: number): Float32Array {
  const out = new Float32Array(gridWidth * gridHeight);
  const cx = gridWidth / 2;
  const cy = gridHeight / 2;
  const maxDist = Math.sqrt(cx * cx + cy * cy);
  for (let y = 0; y < gridHeight; y++) {
    for (let x = 0; x < gridWidth; x++) {
      const dx = x - cx;
      const dy = y - cy;
      const dist = Math.sqrt(dx * dx + dy * dy) / maxDist;
      out[y * gridWidth + x] = Math.max(0, 1 - dist);
    }
  }
  return out;
}
