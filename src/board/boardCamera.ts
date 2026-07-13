/**
 * Pure camera math for the lesson board. The camera is a CSS transform on the
 * board container (transform-origin 0 0): a board point p maps to screen
 * s*p + (tx, ty). Every focus is derived from a target rect in board coordinates
 * plus a safe margin — never from model input. Runtime tweens between these.
 */
import type { Rect } from "./boardLayout";

export { easeInOutCubic } from "../explain/sceneCamera";

export interface Transform {
  scale: number;
  tx: number;
  ty: number;
}

export interface Viewport {
  w: number;
  h: number;
}

export interface FitOptions {
  /** Fraction of the viewport kept as breathing room on each side. */
  marginFrac: number;
  /** Portrait phone: bias toward filling width so section text stays readable. */
  mobile: boolean;
}

/** Transform that frames `target` (board coords) centered in the viewport. */
export function fitTransform(target: Rect, vp: Viewport, opts: FitOptions): Transform {
  const m = opts.marginFrac;
  const w = Math.max(1, target.w);
  const h = Math.max(1, target.h);
  const scaleW = (vp.w * (1 - 2 * m)) / w;
  // On mobile we zoom tighter to the width and only shrink for height when the
  // section would otherwise overflow the screen — so text does not go tiny.
  const scaleH = (vp.h * (opts.mobile ? 1 : 1 - 2 * m)) / h;
  const scale = Math.min(scaleW, scaleH);
  return {
    scale,
    tx: vp.w / 2 - (target.x + target.w / 2) * scale,
    ty: vp.h / 2 - (target.y + target.h / 2) * scale,
  };
}

/** Frame the whole finished board (the end-of-lesson overview). */
export function overviewTransform(board: Rect, vp: Viewport, marginFrac: number): Transform {
  return fitTransform(board, vp, { marginFrac, mobile: false });
}

export function transformCss(t: Transform): string {
  return `translate(${t.tx.toFixed(2)}px, ${t.ty.toFixed(2)}px) scale(${t.scale.toFixed(4)})`;
}

export function lerpTransform(a: Transform, b: Transform, e: number): Transform {
  return {
    scale: a.scale + (b.scale - a.scale) * e,
    tx: a.tx + (b.tx - a.tx) * e,
    ty: a.ty + (b.ty - a.ty) * e,
  };
}
