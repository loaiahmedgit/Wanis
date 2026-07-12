import { useEffect, useLayoutEffect, useRef, useState } from "react";
import type { StrokeProgram } from "../visual/strokeProgram";
import { easeOutCubic } from "../explain/timing";

interface StrokePlayerProps {
  program: StrokeProgram;
  /** True only while this is the step currently being drawn. */
  isWriting: boolean;
  /** Total time budget for the whole program, in ms. */
  durationMs: number;
}

/**
 * The generic runtime: plays ANY compiled StrokeProgram with the pen,
 * group by group, stroke by stroke — a generalization of the glyph-tracing
 * loop in Line.tsx (measure the real path length at runtime, drive
 * stroke-dashoffset per frame directly on the DOM node outside React's
 * style reconciler, move a pen to the live point). Texts in each group
 * fade in once that group's strokes are drawn.
 */
export function StrokePlayer({ program, isWriting, durationMs }: StrokePlayerProps) {
  const svgRef = useRef<SVGSVGElement>(null);
  const pathElsRef = useRef<SVGPathElement[]>([]);

  const allStrokes = program.groups.flatMap((g) => g.strokes);
  const [drawnCount, setDrawnCount] = useState(isWriting ? 0 : allStrokes.length);
  const [visibleGroups, setVisibleGroups] = useState(isWriting ? 0 : program.groups.length);
  const [penPos, setPenPos] = useState<{ x: number; y: number } | null>(null);

  useLayoutEffect(() => {
    const svg = svgRef.current;
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
    const reduceMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    if (reduceMotion) {
      pathElsRef.current.forEach((el) => (el.style.strokeDashoffset = "0"));
      setDrawnCount(allStrokes.length);
      setVisibleGroups(program.groups.length);
      return;
    }

    let cancelled = false;
    // Split the time budget across strokes weighted by real length, so the
    // pen moves at a roughly constant speed regardless of stroke sizes.
    const lengths = pathElsRef.current.map((el) => el.getTotalLength());
    const totalLen = lengths.reduce((a, b) => a + b, 0) || 1;

    const play = async () => {
      let strokeIdx = 0;
      for (let gi = 0; gi < program.groups.length; gi++) {
        const group = program.groups[gi];
        for (let si = 0; si < group.strokes.length; si++) {
          const el = pathElsRef.current[strokeIdx];
          const len = lengths[strokeIdx] || 1;
          const dur = Math.max(160, (len / totalLen) * durationMs * 0.82);
          await traceOne(el, len, dur, () => cancelled);
          if (cancelled) return;
          strokeIdx++;
          setDrawnCount(strokeIdx);
        }
        // Reveal this group's texts once its strokes are done.
        setVisibleGroups(gi + 1);
        await wait(180);
        if (cancelled) return;
      }
      setPenPos(null);
    };

    function traceOne(
      el: SVGPathElement | undefined,
      len: number,
      dur: number,
      isCancelled: () => boolean,
    ): Promise<void> {
      return new Promise((resolve) => {
        if (!el) return resolve();
        const start = performance.now();
        function tick(now: number) {
          if (isCancelled()) return resolve();
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

    play();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isWriting, program, durationMs]);

  // Pen position is in program (viewBox) coordinates; convert to a % of the
  // rendered SVG so the emoji overlay lines up regardless of scaling.
  const [vbX, vbY, vbW, vbH] = program.viewBox;
  const penLeft = penPos ? ((penPos.x - vbX) / vbW) * 100 : 0;
  const penTop = penPos ? ((penPos.y - vbY) / vbH) * 100 : 0;

  let idx = 0;
  return (
    <div className="stroke-player">
      <svg ref={svgRef} width="100%" viewBox={program.viewBox.join(" ")} preserveAspectRatio="xMidYMid meet">
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
