export type ViewBox = [x: number, y: number, width: number, height: number];

export function easeInOutCubic(t: number): number {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}

/**
 * Animates an <svg>'s viewBox attribute directly (never through React state —
 * same imperative-DOM discipline as every other per-frame value in this
 * codebase). Reusable "camera" for any scene that wants to zoom or pan:
 * DNA zooming into base pairs, Big Bang pulling back to reveal scale, etc.
 */
export function animateViewBox(
  svg: SVGSVGElement,
  from: ViewBox,
  to: ViewBox,
  durationMs: number,
  easing: (t: number) => number = easeInOutCubic,
): Promise<void> {
  return new Promise((resolve) => {
    const start = performance.now();
    function tick(now: number) {
      const t = Math.min(1, (now - start) / durationMs);
      const e = easing(t);
      const vb = from.map((f, i) => f + (to[i] - f) * e);
      if (vb.every(Number.isFinite)) {
        svg.setAttribute("viewBox", vb.join(" "));
      }
      if (t < 1) {
        requestAnimationFrame(tick);
      } else {
        resolve();
      }
    }
    requestAnimationFrame(tick);
  });
}

/** Simple promise-based delay, for sequencing scene moments. */
export function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
