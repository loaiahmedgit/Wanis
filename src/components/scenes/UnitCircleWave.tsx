import { useEffect, useRef } from "react";
import type { SceneComponentProps } from "../../explain/sceneTemplates";

export interface UnitCircleWaveParams {
  function: "sin" | "cos";
  cycles: number;
}

const VIEW_W = 640;
const VIEW_H = 300;
const CIRCLE_CX = 150;
const CIRCLE_CY = 150;
const CIRCLE_R = 110;
const GRAPH_X0 = 300;
const GRAPH_Y0 = 150;
const GRAPH_W = 320;
const AMPLITUDE = CIRCLE_R;
const SAMPLE_STEP = (Math.PI * 2) / 90; // one sample every 4 degrees of sweep

function valueAt(fn: "sin" | "cos", theta: number): number {
  return fn === "sin" ? Math.sin(theta) : Math.cos(theta);
}

export function UnitCircleWave({ params, isWriting, durationMs }: SceneComponentProps<UnitCircleWaveParams>) {
  const pointRef = useRef<SVGCircleElement>(null);
  const radiusRef = useRef<SVGLineElement>(null);
  const curveRef = useRef<SVGPathElement>(null);
  const projectorRef = useRef<SVGLineElement>(null);
  const curveTipRef = useRef<SVGCircleElement>(null);

  const cycles = params.cycles;
  const thetaMax = cycles * Math.PI * 2;
  const xPerRad = GRAPH_W / thetaMax;

  // Renders the full, final frame — used both for "already completed" steps
  // and as the reduced-motion fallback.
  function renderFrame(theta: number) {
    const px = CIRCLE_CX + CIRCLE_R * Math.cos(theta);
    const py = CIRCLE_CY - CIRCLE_R * Math.sin(theta);
    const v = valueAt(params.function, theta);
    const tx = GRAPH_X0 + theta * xPerRad;
    const ty = GRAPH_Y0 - AMPLITUDE * v;

    if (![px, py, tx, ty].every(Number.isFinite)) return;

    pointRef.current?.setAttribute("cx", String(px));
    pointRef.current?.setAttribute("cy", String(py));
    radiusRef.current?.setAttribute("x2", String(px));
    radiusRef.current?.setAttribute("y2", String(py));
    projectorRef.current?.setAttribute("x1", String(px));
    projectorRef.current?.setAttribute("y1", String(py));
    projectorRef.current?.setAttribute("x2", String(tx));
    projectorRef.current?.setAttribute("y2", String(ty));
    curveTipRef.current?.setAttribute("cx", String(tx));
    curveTipRef.current?.setAttribute("cy", String(ty));

    // Full curve for the final/reduced-motion frame — sample the whole sweep.
    const pts: string[] = [];
    for (let t = 0; t <= theta + 1e-6; t += SAMPLE_STEP) {
      const x = GRAPH_X0 + t * xPerRad;
      const y = GRAPH_Y0 - AMPLITUDE * valueAt(params.function, t);
      pts.push(`${x.toFixed(1)} ${y.toFixed(1)}`);
    }
    curveRef.current?.setAttribute("d", pts.length ? `M ${pts.join(" L ")}` : "");
  }

  useEffect(() => {
    if (!isWriting) {
      renderFrame(thetaMax);
      return;
    }

    const reduceMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    if (reduceMotion) {
      renderFrame(thetaMax);
      return;
    }

    let raf = 0;
    const start = performance.now();
    const samples: string[] = [];
    // Must be a finite starting point, not -Infinity: in IEEE 754 float math
    // -Infinity + <any finite step> is still -Infinity, so a "while (last +
    // step <= theta)" loop seeded with -Infinity can never terminate — it
    // freezes the tab in a genuine infinite loop the instant theta is ever
    // >= -Infinity (i.e. always, including the harmless small-negative theta
    // that can occur on the very first rAF callback).
    let lastSampledTheta = -SAMPLE_STEP;

    function tick(now: number) {
      const elapsed = now - start;
      const t = Math.min(1, Math.max(0, elapsed / durationMs));
      const theta = t * thetaMax; // linear angular velocity — constant rotation reads as physical motion

      const px = CIRCLE_CX + CIRCLE_R * Math.cos(theta);
      const py = CIRCLE_CY - CIRCLE_R * Math.sin(theta);
      const v = valueAt(params.function, theta);
      const tx = GRAPH_X0 + theta * xPerRad;
      const ty = GRAPH_Y0 - AMPLITUDE * v;

      if ([px, py, tx, ty].every(Number.isFinite)) {
        pointRef.current?.setAttribute("cx", String(px));
        pointRef.current?.setAttribute("cy", String(py));
        radiusRef.current?.setAttribute("x2", String(px));
        radiusRef.current?.setAttribute("y2", String(py));
        projectorRef.current?.setAttribute("x1", String(px));
        projectorRef.current?.setAttribute("y1", String(py));
        projectorRef.current?.setAttribute("x2", String(tx));
        projectorRef.current?.setAttribute("y2", String(ty));
        curveTipRef.current?.setAttribute("cx", String(tx));
        curveTipRef.current?.setAttribute("cy", String(ty));

        while (lastSampledTheta + SAMPLE_STEP <= theta) {
          lastSampledTheta += SAMPLE_STEP;
          const sx = GRAPH_X0 + lastSampledTheta * xPerRad;
          const sy = GRAPH_Y0 - AMPLITUDE * valueAt(params.function, lastSampledTheta);
          samples.push(`${sx.toFixed(1)} ${sy.toFixed(1)}`);
        }
        curveRef.current?.setAttribute("d", samples.length ? `M ${samples.join(" L ")} L ${tx.toFixed(1)} ${ty.toFixed(1)}` : "");
      }

      if (t < 1) {
        raf = requestAnimationFrame(tick);
      }
    }
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isWriting, params.function, cycles, durationMs]);

  const graphLabel = params.function === "sin" ? "y = sin(θ)" : "y = cos(θ)";

  return (
    <svg width={VIEW_W} height={VIEW_H} viewBox={`0 0 ${VIEW_W} ${VIEW_H}`}>
      {/* Circle panel */}
      <circle cx={CIRCLE_CX} cy={CIRCLE_CY} r={CIRCLE_R} className="scene-axis" fill="none" />
      <line x1={CIRCLE_CX - CIRCLE_R - 10} y1={CIRCLE_CY} x2={CIRCLE_CX + CIRCLE_R + 10} y2={CIRCLE_CY} className="scene-grid" />
      <line x1={CIRCLE_CX} y1={CIRCLE_CY - CIRCLE_R - 10} x2={CIRCLE_CX} y2={CIRCLE_CY + CIRCLE_R + 10} className="scene-grid" />
      <line ref={radiusRef} x1={CIRCLE_CX} y1={CIRCLE_CY} x2={CIRCLE_CX + CIRCLE_R} y2={CIRCLE_CY} className="scene-radius" />
      <circle cx={CIRCLE_CX} cy={CIRCLE_CY} r={2.5} className="scene-origin-dot" />
      <circle ref={pointRef} cx={CIRCLE_CX + CIRCLE_R} cy={CIRCLE_CY} r={5} className="scene-tracer" />

      {/* Graph panel */}
      <line x1={GRAPH_X0} y1={GRAPH_Y0 - AMPLITUDE - 14} x2={GRAPH_X0} y2={GRAPH_Y0 + AMPLITUDE + 14} className="scene-axis" />
      <line x1={GRAPH_X0 - 8} y1={GRAPH_Y0} x2={GRAPH_X0 + GRAPH_W + 8} y2={GRAPH_Y0} className="scene-axis" />
      <line x1={GRAPH_X0} y1={GRAPH_Y0 - AMPLITUDE} x2={GRAPH_X0 + GRAPH_W} y2={GRAPH_Y0 - AMPLITUDE} className="scene-grid" />
      <line x1={GRAPH_X0} y1={GRAPH_Y0 + AMPLITUDE} x2={GRAPH_X0 + GRAPH_W} y2={GRAPH_Y0 + AMPLITUDE} className="scene-grid" />
      <text x={GRAPH_X0 + 8} y={GRAPH_Y0 - AMPLITUDE - 4} className="scene-label">
        {graphLabel}
      </text>

      <line ref={projectorRef} x1={CIRCLE_CX + CIRCLE_R} y1={CIRCLE_CY} x2={GRAPH_X0} y2={CIRCLE_CY} className="scene-projector" />
      <path ref={curveRef} d="" className="scene-curve" />
      <circle ref={curveTipRef} cx={GRAPH_X0} cy={GRAPH_Y0} r={4.5} className="scene-tracer" />
    </svg>
  );
}
