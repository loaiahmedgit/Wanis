/**
 * Derives a per-pin confidence value from the depth map itself: flat regions
 * (small local gradient) are confident/stable, edges and fine detail (large
 * local gradient) are uncertain and should stay unstable until the field
 * "settles" — the depth-map analogue of the master plan's confidence map,
 * without needing a real inference pipeline yet (Phase 1/2 use manually
 * supplied / derived maps only).
 */
export function computeConfidence(
  depth: Float32Array,
  gridWidth: number,
  gridHeight: number,
): Float32Array {
  const confidence = new Float32Array(gridWidth * gridHeight);

  for (let y = 0; y < gridHeight; y++) {
    for (let x = 0; x < gridWidth; x++) {
      const i = y * gridWidth + x;
      const left = depth[y * gridWidth + Math.max(0, x - 1)];
      const right = depth[y * gridWidth + Math.min(gridWidth - 1, x + 1)];
      const up = depth[Math.max(0, y - 1) * gridWidth + x];
      const down = depth[Math.min(gridHeight - 1, y + 1) * gridWidth + x];

      const gradX = right - left;
      const gradY = down - up;
      const gradientMagnitude = Math.sqrt(gradX * gradX + gradY * gradY);

      // Empirically-tuned normalization: gradients above ~0.35 (out of a 0-1
      // depth range) are treated as "fully uncertain" edges.
      const normalized = Math.min(1, gradientMagnitude / 0.35);
      confidence[i] = 1 - normalized;
    }
  }
  return confidence;
}
