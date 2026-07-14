import { useEffect, useLayoutEffect, useRef, useState } from "react";
import type { StrokeProgram } from "../visual/strokeProgram";
import { easeOutCubic } from "../explain/timing";
import { decideCamera, regionViewBox, projectedLabelPx, READABLE_PX } from "../visual/focusCamera";
import { animateViewBox } from "../explain/sceneCamera";

const CAMERA_MS = 800;
const FRAME_HOLD_MS = 500;

interface StrokePlayerProps {
  program: StrokeProgram;
  /** True only while this is the step currently being drawn. */
  isWriting: boolean;
  /** Total time budget for the whole program, in ms. */
  durationMs: number;
  /**
   * Whether the semantic camera may activate for this player. Off inside the
   * lesson board (that composer owns its own camera) so we never double-zoom.
   */
  enableFocusCamera?: boolean;
}

/**
 * The generic runtime: plays ANY compiled StrokeProgram with the pen,
 * group by group, stroke by stroke — a generalization of the glyph-tracing
 * loop in Line.tsx (measure the real path length at runtime, drive
 * stroke-dashoffset per frame directly on the DOM node outside React's
 * style reconciler, move a pen to the live point). Texts in each group
 * fade in once that group's strokes are drawn.
 */
export function StrokePlayer({ program, isWriting, durationMs, enableFocusCamera = true }: StrokePlayerProps) {
  const svgRef = useRef<SVGSVGElement>(null);
  const pathElsRef = useRef<SVGPathElement[]>([]);
  // Index of the focus region currently framed, so a resize can re-fit it
  // without restarting playback.
  const currentRegionRef = useRef(0);

  const allStrokes = program.groups.flatMap((g) => g.strokes);
  const [drawnCount, setDrawnCount] = useState(isWriting ? 0 : allStrokes.length);
  const [visibleGroups, setVisibleGroups] = useState(isWriting ? 0 : program.groups.length);
  const [penPos, setPenPos] = useState<{ x: number; y: number } | null>(null);

  useLayoutEffect(() => {
    const svg = svgRef.current;
    // Own the viewBox imperatively (not via a React prop) so the semantic
    // camera's per-frame setAttribute is never clobbered by a re-render.
    if (svg) svg.setAttribute("viewBox", program.viewBox.join(" "));
    pathElsRef.current = svg ? Array.from(svg.querySelectorAll<SVGPathElement>(".vp-stroke")) : [];
    pathElsRef.current.forEach((el, i) => {
      const len = el.getTotalLength();
      el.style.strokeDasharray = String(len);
      el.style.strokeDashoffset = isWriting && i >= 0 ? String(len) : "0";
    });
    if (!isWriting) {
      pathElsRef.current.forEach((el) => (el.style.strokeDashoffset = "0"));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [program]);

  useEffect(() => {
    if (!isWriting) return;
    const svg = svgRef.current;
    const reduceMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;

    // Decide the semantic camera from the ACTUAL rendered size.
    const vpNow = () => {
      const r = svg?.getBoundingClientRect();
      return { w: r?.width || program.viewBox[2], h: r?.height || program.viewBox[3] };
    };
    const regions = enableFocusCamera ? program.focusRegions ?? [] : [];
    const decision = enableFocusCamera && regions.length ? decideCamera(program, vpNow()) : "whole";
    if (
      enableFocusCamera &&
      !regions.length &&
      svg &&
      projectedLabelPx(program, vpNow()) < READABLE_PX
    ) {
      // Too small to read whole, but no focus regions to teach it — surface this
      // rather than let it pass as a responsive success.
      console.warn("[perception-field] cameraNeededButUnavailable", { viewBox: program.viewBox });
    }
    const useCamera = decision === "focus";
    // A focus camera needs a STABLE display box to frame into — with height:auto
    // the SVG's aspect follows its own viewBox (circular). Give it a fixed
    // portrait-friendly height while focusing; leave it auto otherwise so
    // non-focus scenes render exactly as before.
    if (svg) svg.style.height = useCamera ? "min(70vh, 620px)" : "";

    let cancelled = false;
    const lengths = pathElsRef.current.map((el) => el.getTotalLength());
    const totalLen = lengths.reduce((a, b) => a + b, 0) || 1;

    function traceOne(el: SVGPathElement | undefined, len: number, dur: number): Promise<void> {
      return new Promise((resolve) => {
        if (!el || reduceMotion) {
          if (el) el.style.strokeDashoffset = "0";
          return resolve();
        }
        const start = performance.now();
        function tick(now: number) {
          if (cancelled) return resolve();
          const t = Math.min(1, (now - start) / dur);
          const eased = easeOutCubic(t);
          el!.style.strokeDashoffset = String(len * (1 - eased));
          const pt = el!.getPointAtLength(len * eased);
          setPenPos({ x: pt.x, y: pt.y });
          if (t < 1) requestAnimationFrame(tick);
          else {
            el!.style.strokeDashoffset = "0";
            resolve();
          }
        }
        requestAnimationFrame(tick);
      });
    }

    // Draw one group's strokes (by absolute stroke index), then reveal its text.
    const strokeStart: number[] = [];
    let acc = 0;
    for (const g of program.groups) {
      strokeStart.push(acc);
      acc += g.strokes.length;
    }
    const drawGroup = async (gi: number) => {
      const group = program.groups[gi];
      if (!group) return;
      let idx = strokeStart[gi];
      for (let si = 0; si < group.strokes.length; si++) {
        const el = pathElsRef.current[idx];
        const len = lengths[idx] || 1;
        const dur = Math.max(160, (len / totalLen) * durationMs * 0.82);
        await traceOne(el, len, dur); // a camera move never happens mid-stroke
        if (cancelled) return;
        idx++;
        setDrawnCount(idx);
      }
      setVisibleGroups(gi + 1);
    };

    const play = async () => {
      if (useCamera) {
        let curVB = regionViewBox(regions[0], vpNow());
        svg?.setAttribute("viewBox", curVB.join(" "));
        for (let ri = 0; ri < regions.length; ri++) {
          currentRegionRef.current = ri;
          if (ri > 0) {
            // Camera moves only BETWEEN frames, at a group boundary.
            const target = regionViewBox(regions[ri], vpNow());
            if (reduceMotion || cancelled) svg?.setAttribute("viewBox", target.join(" "));
            else if (svg) await animateViewBox(svg, curVB, target, CAMERA_MS);
            curVB = target;
            if (cancelled) return;
          }
          for (let gi = regions[ri].startGroup; gi <= regions[ri].endGroup; gi++) {
            await drawGroup(gi);
            if (cancelled) return;
          }
          // Reduced motion draws instantly, so hold each frame long enough that
          // the teaching sequence is still perceivable (just without animation).
          await wait(reduceMotion ? 900 : FRAME_HOLD_MS);
          if (cancelled) return;
        }
      } else {
        for (let gi = 0; gi < program.groups.length; gi++) {
          await drawGroup(gi);
          if (cancelled) return;
          await wait(reduceMotion ? 0 : 180);
          if (cancelled) return;
        }
      }
      setPenPos(null);
    };

    if (reduceMotion && !useCamera) {
      // No focus needed: snap the whole scene to final immediately (unchanged).
      pathElsRef.current.forEach((el) => (el.style.strokeDashoffset = "0"));
      setDrawnCount(allStrokes.length);
      setVisibleGroups(program.groups.length);
      return;
    }

    play();

    // Resize: re-fit the current frame without restarting playback.
    const onResize = () => {
      if (useCamera && svg) svg.setAttribute("viewBox", regionViewBox(regions[currentRegionRef.current], vpNow()).join(" "));
    };
    window.addEventListener("resize", onResize);
    return () => {
      cancelled = true;
      window.removeEventListener("resize", onResize);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isWriting, program, durationMs, enableFocusCamera]);

  // Pen position is in program (viewBox) coordinates; convert to a % of the
  // rendered SVG so the emoji overlay lines up regardless of scaling.
  const [vbX, vbY, vbW, vbH] = program.viewBox;
  const penLeft = penPos ? ((penPos.x - vbX) / vbW) * 100 : 0;
  const penTop = penPos ? ((penPos.y - vbY) / vbH) * 100 : 0;

  let idx = 0;
  return (
    <div className="stroke-player">
      <svg ref={svgRef} width="100%" preserveAspectRatio="xMidYMid meet">
        {program.groups.map((group) =>
          group.strokes.map((s) => {
            const key = idx;
            idx++;
            return <path key={key} d={s.d} className={`vp-stroke ${s.css}`} />;
          }),
        )}
        {program.groups.map((group, gi) =>
          gi < visibleGroups
            ? group.texts.map((t, ti) => (
                <text
                  key={`t${gi}-${ti}`}
                  x={t.x}
                  y={t.y}
                  textAnchor={t.anchor ?? "middle"}
                  className={`vp-text ${t.css}`}
                >
                  {t.text}
                </text>
              ))
            : null,
        )}
      </svg>
      {isWriting && penPos && drawnCount < allStrokes.length && (
        <span
          className="pen-icon vp-pen"
          aria-hidden="true"
          style={{ left: `${penLeft}%`, top: `${penTop}%` }}
        >
          ✏️
        </span>
      )}
    </div>
  );
}

function wait(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}
