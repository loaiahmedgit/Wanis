import { useEffect, useRef, useState } from "react";
import type { SceneComponentProps } from "../../explain/sceneTemplates";
import { animateViewBox, wait, easeInOutCubic, type ViewBox } from "../../explain/sceneCamera";
import { FocusRing } from "../sceneKit/FocusRing";
import { Callout } from "../sceneKit/Callout";

export interface UnitCircleWaveParams {
  function: "sin" | "cos";
  cycles: number;
}

const VIEW_W = 900;
const VIEW_H = 420;
const CIRCLE_CX = 220;
const CIRCLE_CY = 210;
const CIRCLE_R = 150;
const GRAPH_X0 = 460;
const GRAPH_Y0 = 210;
const GRAPH_W = 400;
const AMPLITUDE = CIRCLE_R;
const SAMPLE_STEP = (Math.PI * 2) / 90;

const TIGHT_VB: ViewBox = [20, 10, 400, 400];
const WIDE_VB: ViewBox = [0, 0, VIEW_W, VIEW_H];

const INTRO_CIRCLE_MS = 900;
const INTRO_RADIUS_MS = 500;
const INTRO_GUIDES_MS = 700;
const INTRO_CAMERA_MS = 1300;
const OUTRO_MS = 1200;
const INTRO_MS = INTRO_CIRCLE_MS + INTRO_RADIUS_MS + INTRO_GUIDES_MS + INTRO_CAMERA_MS;

function valueAt(fn: "sin" | "cos", theta: number): number {
  return fn === "sin" ? Math.sin(theta) : Math.cos(theta);
}

function pointOnCircle(theta: number) {
  return { x: CIRCLE_CX + CIRCLE_R * Math.cos(theta), y: CIRCLE_CY - CIRCLE_R * Math.sin(theta) };
}

/** Simple attribute tween — local to this scene, not a whole generic system. */
function tweenAttr(el: Element, attr: string, from: number, to: number, durationMs: number): Promise<void> {
  return new Promise((resolve) => {
    const start = performance.now();
    function tick(now: number) {
      const t = Math.min(1, (now - start) / durationMs);
      const v = from + (to - from) * easeInOutCubic(t);
      if (Number.isFinite(v)) el.setAttribute(attr, String(v));
      if (t < 1) requestAnimationFrame(tick);
      else resolve();
    }
    requestAnimationFrame(tick);
  });
}

/** Same tween, writing to a CSS style property instead of an attribute (for stroke-dashoffset). */
function tweenStyle(el: HTMLElement | SVGElement, prop: string, from: number, to: number, durationMs: number): Promise<void> {
  return new Promise((resolve) => {
    const start = performance.now();
    function tick(now: number) {
      const t = Math.min(1, (now - start) / durationMs);
      const v = from + (to - from) * easeInOutCubic(t);
      if (Number.isFinite(v)) el.style.setProperty(prop, String(v));
      if (t < 1) requestAnimationFrame(tick);
      else resolve();
    }
    requestAnimationFrame(tick);
  });
}

export function UnitCircleWave({ params, isWriting, durationMs }: SceneComponentProps<UnitCircleWaveParams>) {
  const svgRef = useRef<SVGSVGElement>(null);
  const circlePathRef = useRef<SVGCircleElement>(null);
  const radiusRef = useRef<SVGLineElement>(null);
  const pointRef = useRef<SVGCircleElement>(null);
  const projectorRef = useRef<SVGLineElement>(null);
  const curveRef = useRef<SVGPathElement>(null);
  const curveTipRef = useRef<SVGCircleElement>(null);

  const [guidesVisible, setGuidesVisible] = useState(!isWriting);
  const [heightCalloutVisible, setHeightCalloutVisible] = useState(false);
  const [peakFocus, setPeakFocus] = useState<{
    show: boolean;
    key: number;
    px: number;
    py: number;
    tx: number;
    ty: number;
  }>({ show: false, key: 0, px: CIRCLE_CX, py: CIRCLE_CY, tx: GRAPH_X0, ty: GRAPH_Y0 });
  const [endCalloutVisible, setEndCalloutVisible] = useState(!isWriting);

  const cycles = params.cycles;
  const thetaMax = cycles * Math.PI * 2;
  const xPerRad = GRAPH_W / thetaMax;
  const rotationMs = Math.max(2000, durationMs - INTRO_MS - OUTRO_MS);

  function drawFullWave() {
    const pts: string[] = [];
    for (let t = 0; t <= thetaMax + 1e-6; t += SAMPLE_STEP) {
      const x = GRAPH_X0 + t * xPerRad;
      const y = GRAPH_Y0 - AMPLITUDE * valueAt(params.function, t);
      pts.push(`${x.toFixed(1)} ${y.toFixed(1)}`);
    }
    curveRef.current?.setAttribute("d", pts.length ? `M ${pts.join(" L ")}` : "");
  }

  function renderFinalFrame() {
    const p = pointOnCircle(thetaMax);
    const tx = GRAPH_X0 + thetaMax * xPerRad;
    const ty = GRAPH_Y0 - AMPLITUDE * valueAt(params.function, thetaMax);
    circlePathRef.current?.style.setProperty("stroke-dashoffset", "0");
    radiusRef.current?.setAttribute("x2", String(p.x));
    radiusRef.current?.setAttribute("y2", String(p.y));
    pointRef.current?.setAttribute("cx", String(p.x));
    pointRef.current?.setAttribute("cy", String(p.y));
    projectorRef.current?.setAttribute("x1", String(p.x));
    projectorRef.current?.setAttribute("y1", String(p.y));
    projectorRef.current?.setAttribute("x2", String(tx));
    projectorRef.current?.setAttribute("y2", String(ty));
    curveTipRef.current?.setAttribute("cx", String(tx));
    curveTipRef.current?.setAttribute("cy", String(ty));
    svgRef.current?.setAttribute("viewBox", WIDE_VB.join(" "));
    drawFullWave();
  }

  useEffect(() => {
    let cancelled = false;
    const svg = svgRef.current;
    const circleEl = circlePathRef.current;
    if (!svg || !circleEl) return;

    // Seed the circle's stroke length once so the draw-in has a real value.
    const circleLen = circleEl.getTotalLength();
    circleEl.style.strokeDasharray = String(circleLen);
    circleEl.style.strokeDashoffset = String(circleLen);
    radiusRef.current?.setAttribute("x2", String(CIRCLE_CX));
    radiusRef.current?.setAttribute("y2", String(CIRCLE_CY));
    svg.setAttribute("viewBox", TIGHT_VB.join(" "));

    if (!isWriting) {
      renderFinalFrame();
      return;
    }

    const reduceMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    if (reduceMotion) {
      renderFinalFrame();
      return;
    }

    const play = async () => {
      // Moment 1 — the circle traces itself in.
      await tweenStyle(circleEl, "stroke-dashoffset", circleLen, 0, INTRO_CIRCLE_MS);
      if (cancelled) return;

      // Moment 2 — the radius grows out to the starting point (theta = 0).
      if (radiusRef.current) {
        await tweenAttr(radiusRef.current, "x2", CIRCLE_CX, CIRCLE_CX + CIRCLE_R, INTRO_RADIUS_MS);
      }
      if (cancelled) return;
      pointRef.current?.setAttribute("cx", String(CIRCLE_CX + CIRCLE_R));
      pointRef.current?.setAttribute("cy", String(CIRCLE_CY));

      // Moment 3 — guide lines + a quick "height" callout.
      setGuidesVisible(true);
      setHeightCalloutVisible(true);
      await wait(INTRO_GUIDES_MS);
      if (cancelled) return;
      setHeightCalloutVisible(false);

      // Moment 4 — camera pulls back to reveal the graph stage alongside the circle.
      if (svg) await animateViewBox(svg, TIGHT_VB, WIDE_VB, INTRO_CAMERA_MS);
      if (cancelled) return;

      // Moment 5+6 — the sweep: point orbits, wave grows live, peak focus pulse.
      const samples: string[] = [];
      let lastSampledTheta = -SAMPLE_STEP;
      let peakFired = false;
      const start = performance.now();

      await new Promise<void>((resolve) => {
        function tick(now: number) {
          if (cancelled) return resolve();
          const t = Math.min(1, Math.max(0, (now - start) / rotationMs));
          const theta = t * thetaMax;
          const p = pointOnCircle(theta);
          const v = valueAt(params.function, theta);
          const tx = GRAPH_X0 + theta * xPerRad;
          const ty = GRAPH_Y0 - AMPLITUDE * v;

          if ([p.x, p.y, tx, ty].every(Number.isFinite)) {
            radiusRef.current?.setAttribute("x2", String(p.x));
            radiusRef.current?.setAttribute("y2", String(p.y));
            pointRef.current?.setAttribute("cx", String(p.x));
            pointRef.current?.setAttribute("cy", String(p.y));
            projectorRef.current?.setAttribute("x1", String(p.x));
            projectorRef.current?.setAttribute("y1", String(p.y));
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
            curveRef.current?.setAttribute(
              "d",
              samples.length ? `M ${samples.join(" L ")} L ${tx.toFixed(1)} ${ty.toFixed(1)}` : "",
            );
          }

          // The "this height IS this height" beat, once per scene, near the first quarter turn.
          if (!peakFired && theta >= Math.PI / 2) {
            peakFired = true;
            setPeakFocus((prev) => ({ show: true, key: prev.key + 1, px: p.x, py: p.y, tx, ty }));
          }

          if (t < 1) requestAnimationFrame(tick);
          else resolve();
        }
        requestAnimationFrame(tick);
      });
      if (cancelled) return;

      // Moment 7 — settle, show the "one full turn" callout.
      await wait(200);
      if (cancelled) return;
      setEndCalloutVisible(true);
    };

    play();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isWriting, params.function, cycles, durationMs]);

  const endLabelX = GRAPH_X0 + (thetaMax * xPerRad) / 2 - 40;

  return (
    <svg ref={svgRef} width="100%" viewBox={`0 0 ${VIEW_W} ${VIEW_H}`} preserveAspectRatio="xMidYMid meet">
      {/* Circle panel */}
      <circle ref={circlePathRef} cx={CIRCLE_CX} cy={CIRCLE_CY} r={CIRCLE_R} className="scene-axis" fill="none" />
      {guidesVisible && (
        <>
          <line
            x1={CIRCLE_CX - CIRCLE_R - 20}
            y1={CIRCLE_CY}
            x2={CIRCLE_CX + CIRCLE_R + 20}
            y2={CIRCLE_CY}
            className="scene-grid"
          />
          <line
            x1={CIRCLE_CX}
            y1={CIRCLE_CY - CIRCLE_R - 20}
            x2={CIRCLE_CX}
            y2={CIRCLE_CY + CIRCLE_R + 20}
            className="scene-grid"
          />
        </>
      )}
      <line ref={radiusRef} x1={CIRCLE_CX} y1={CIRCLE_CY} x2={CIRCLE_CX} y2={CIRCLE_CY} className="scene-radius" />
      <circle cx={CIRCLE_CX} cy={CIRCLE_CY} r={3} className="scene-origin-dot" />
      <circle ref={pointRef} cx={CIRCLE_CX} cy={CIRCLE_CY} r={6} className="scene-tracer" />
      <Callout x={CIRCLE_CX + CIRCLE_R + 14} y={CIRCLE_CY - 14} text="height" visible={heightCalloutVisible} />

      {/* Graph panel */}
      <line
        x1={GRAPH_X0}
        y1={GRAPH_Y0 - AMPLITUDE - 20}
        x2={GRAPH_X0}
        y2={GRAPH_Y0 + AMPLITUDE + 20}
        className="scene-axis"
      />
      <line x1={GRAPH_X0 - 10} y1={GRAPH_Y0} x2={GRAPH_X0 + GRAPH_W + 10} y2={GRAPH_Y0} className="scene-axis" />
      <text x={GRAPH_X0 + 10} y={GRAPH_Y0 - AMPLITUDE - 8} className="scene-label">
        {params.function === "sin" ? "y = sin(θ)" : "y = cos(θ)"}
      </text>

      <line
        ref={projectorRef}
        x1={CIRCLE_CX + CIRCLE_R}
        y1={CIRCLE_CY}
        x2={GRAPH_X0}
        y2={CIRCLE_CY}
        className="scene-projector"
      />
      <path ref={curveRef} d="" className="scene-curve" />
      <circle ref={curveTipRef} cx={GRAPH_X0} cy={GRAPH_Y0} r={6} className="scene-tracer" />

      {peakFocus.show && <FocusRing cx={peakFocus.px} cy={peakFocus.py} pulseKey={peakFocus.key} />}
      {peakFocus.show && <FocusRing cx={peakFocus.tx} cy={peakFocus.ty} pulseKey={`tip-${peakFocus.key}`} />}

      {endCalloutVisible && (
        <Callout x={endLabelX} y={GRAPH_Y0 + AMPLITUDE + 44} text="one full turn = 2π" visible />
      )}
    </svg>
  );
}
