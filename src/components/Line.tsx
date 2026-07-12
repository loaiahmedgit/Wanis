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

interface Glyph {
  d: string;
  x1: number;
  x2: number;
}

type GlyphPhase = "idle" | "drawing" | "inked";

export function Line({ step, isWriting }: LineProps) {
  const { size, weight } = SIZE_BY_KIND[step.kind];
  const font = getHandFont(weight);
  const baseline = size * 1.2;
  const height = Math.ceil(size * 1.7);

  // One real <path> per glyph (not one combined <text>/path for the whole
  // line) — that's what lets each letter finish drawing before the next
  // one starts, à la Vivus's oneByOne, instead of everything growing at
  // once along a single shared dash offset.
  const glyphs: Glyph[] = font
    ? font.getPaths(step.content, 2, baseline, size).map((p) => {
        const box = p.getBoundingBox();
        return { d: p.toPathData(2), x1: box.x1, x2: box.x2 };
      })
    : [];
  const width = glyphs.length ? Math.max(16, Math.ceil(Math.max(...glyphs.map((g) => g.x2))) + 6) : 16;

  const pathRefs = useRef<(SVGPathElement | null)[]>([]);
  const [lengths, setLengths] = useState<number[] | null>(null);
  const [revealedCount, setRevealedCount] = useState(isWriting ? 0 : glyphs.length);
  const [activePhase, setActivePhase] = useState<GlyphPhase>("idle");

  useLayoutEffect(() => {
    pathRefs.current = pathRefs.current.slice(0, glyphs.length);
    setLengths(glyphs.map((_, i) => pathRefs.current[i]?.getTotalLength() ?? 0));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step.content]);

  const totalDuration = lineDurationMs(step.content);
  const totalLength = lengths ? lengths.reduce((a, b) => a + b, 0) : 0;
  // Split the line's total draw time across glyphs proportional to each
  // glyph's own stroke length, so drawing speed reads as constant — same
  // rule Vivus's oneByOne uses.
  const durations =
    lengths && totalLength > 0
      ? lengths.map((len) => Math.max(40, (len / totalLength) * totalDuration))
      : glyphs.map(() => 60);

  useEffect(() => {
    if (!isWriting || !lengths) return;
    if (revealedCount >= glyphs.length) return;

    const len = lengths[revealedCount] ?? 0;
    if (len <= 0.5) {
      // Nothing to trace (space, etc.) — skip straight to the next glyph.
      setRevealedCount((c) => c + 1);
      return;
    }

    setActivePhase("idle");
    const raf = requestAnimationFrame(() => setActivePhase("drawing"));
    const dur = durations[revealedCount] ?? 60;
    const timer = setTimeout(() => {
      setActivePhase("inked");
      setRevealedCount((c) => c + 1);
    }, dur + 30);

    return () => {
      cancelAnimationFrame(raf);
      clearTimeout(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isWriting, lengths, revealedCount, glyphs.length]);

  const activeGlyph = glyphs[revealedCount];

  return (
    <div className={`line line-${step.kind}`}>
      <div className="line-canvas" style={{ width, height }}>
        <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`}>
          {glyphs.map((g, i) => {
            const phase: GlyphPhase = i < revealedCount ? "inked" : i === revealedCount ? activePhase : "idle";
            const len = lengths?.[i] || 1;
            return (
              <path
                key={i}
                ref={(el) => {
                  pathRefs.current[i] = el;
                }}
                d={g.d}
                className={`line-glyphs phase-${phase}`}
                style={
                  {
                    strokeDasharray: len,
                    strokeDashoffset: phase === "idle" ? len : 0,
                    transitionDuration:
                      phase === "drawing" ? `${durations[i] ?? 60}ms, 220ms` : "0ms, 220ms",
                  } as React.CSSProperties
                }
              />
            );
          })}
        </svg>
        {isWriting && activeGlyph && (
          <span
            className="pen-icon"
            aria-hidden="true"
            style={{
              transform: `translateX(${activePhase === "idle" ? activeGlyph.x1 : activeGlyph.x2}px) translateY(-50%) rotate(-14deg)`,
              transitionDuration: activePhase === "drawing" ? `${durations[revealedCount] ?? 60}ms` : "0ms",
            }}
          >
            ✏️
          </span>
        )}
      </div>
    </div>
  );
}
