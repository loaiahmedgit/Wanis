import { useEffect, useLayoutEffect, useRef, useState } from "react";
import type { ExplanationStep } from "../explain/types";
import { lineDurationMs } from "../explain/timing";
import { getHandFont, type HandWeight } from "../explain/handFonts";

interface LineProps {
  step: ExplanationStep;
  /** True only for the single line currently being written — shows the pen. */
  isWriting: boolean;
}

const SIZE_BY_KIND: Record<ExplanationStep["kind"], { size: number; weight: HandWeight }> = {
  title: { size: 38, weight: "bold" },
  text: { size: 25, weight: "regular" },
  equation: { size: 30, weight: "bold" },
};

type GlyphPhase = "idle" | "drawing" | "inked";

export function Line({ step, isWriting }: LineProps) {
  const { size, weight } = SIZE_BY_KIND[step.kind];
  const font = getHandFont(weight);
  const baseline = size * 1.2;
  const height = Math.ceil(size * 1.7);

  // One real <path> per glyph, so each letter's own outline can be sampled
  // point-by-point as it draws — the pen follows the actual stroke geometry
  // (up, down, curves), not just a left-to-right slide.
  const glyphs = font ? font.getPaths(step.content, 2, baseline, size).map((p) => p.toPathData(2)) : [];
  const fullBox = font ? font.getPath(step.content, 2, baseline, size).getBoundingBox() : null;
  const width = fullBox ? Math.max(16, Math.ceil(fullBox.x2) + 6) : 16;

  const pathRefs = useRef<(SVGPathElement | null)[]>([]);
  const [lengths, setLengths] = useState<number[] | null>(null);
  const [revealedCount, setRevealedCount] = useState(isWriting ? 0 : glyphs.length);
  const [phases, setPhases] = useState<GlyphPhase[]>(() => glyphs.map(() => (isWriting ? "idle" : "inked")));
  const [penPos, setPenPos] = useState<{ x: number; y: number } | null>(null);

  useLayoutEffect(() => {
    pathRefs.current = pathRefs.current.slice(0, glyphs.length);
    setLengths(glyphs.map((_, i) => pathRefs.current[i]?.getTotalLength() ?? 0));
    setPhases(glyphs.map(() => (isWriting ? "idle" : "inked")));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step.content]);

  const totalDuration = lineDurationMs(step.content);
  const totalLength = lengths ? lengths.reduce((a, b) => a + b, 0) : 0;
  // Split the line's total draw time across glyphs proportional to each
  // glyph's own stroke length, so drawing speed reads as constant.
  const durations =
    lengths && totalLength > 0
      ? lengths.map((len) => Math.max(60, (len / totalLength) * totalDuration))
      : glyphs.map(() => 80);

  useEffect(() => {
    if (!isWriting || !lengths) return;
    if (revealedCount >= glyphs.length) return;

    const len = lengths[revealedCount] ?? 0;
    const pathEl = pathRefs.current[revealedCount];
    if (len <= 0.5 || !pathEl) {
      setRevealedCount((c) => c + 1);
      return;
    }

    setPhases((prev) => {
      const next = [...prev];
      next[revealedCount] = "drawing";
      return next;
    });

    const duration = durations[revealedCount] ?? 80;
    const start = performance.now();
    let raf = 0;

    function tick(now: number) {
      const t = Math.min(1, (now - start) / duration);
      pathEl!.style.strokeDashoffset = String(len * (1 - t));
      const point = pathEl!.getPointAtLength(len * t);
      setPenPos({ x: point.x, y: point.y });

      if (t < 1) {
        raf = requestAnimationFrame(tick);
      } else {
        setPhases((prev) => {
          const next = [...prev];
          next[revealedCount] = "inked";
          return next;
        });
        setRevealedCount((c) => c + 1);
      }
    }
    raf = requestAnimationFrame(tick);

    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isWriting, lengths, revealedCount, glyphs.length]);

  return (
    <div className={`line line-${step.kind}`}>
      <div className="line-canvas" style={{ width, height }}>
        <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`}>
          {glyphs.map((d, i) => {
            const phase = phases[i] ?? "idle";
            const len = lengths?.[i] || 1;
            return (
              <path
                key={i}
                ref={(el) => {
                  pathRefs.current[i] = el;
                }}
                d={d}
                className={`line-glyphs phase-${phase}`}
                style={
                  {
                    strokeDasharray: len,
                    // "drawing" is driven imperatively per-frame in the effect above —
                    // leave it alone here so React doesn't fight the rAF loop.
                    strokeDashoffset: phase === "idle" ? len : phase === "inked" ? 0 : undefined,
                  } as React.CSSProperties
                }
              />
            );
          })}
        </svg>
        {isWriting && penPos && revealedCount < glyphs.length && (
          <span
            className="pen-icon"
            aria-hidden="true"
            style={{ transform: `translate(${penPos.x}px, ${penPos.y}px) translate(-15%, -80%) rotate(-14deg)` }}
          >
            ✏️
          </span>
        )}
      </div>
    </div>
  );
}
