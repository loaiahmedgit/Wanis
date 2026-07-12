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

type Phase = "idle" | "drawing" | "inked";

export function Line({ step, isWriting }: LineProps) {
  const pathRef = useRef<SVGPathElement>(null);
  const [pathLength, setPathLength] = useState(0);
  const [phase, setPhase] = useState<Phase>(isWriting ? "idle" : "inked");
  const { size, weight } = SIZE_BY_KIND[step.kind];
  const duration = lineDurationMs(step.content);

  // Real glyph outlines (actual <path> geometry), not <text> — SVG can only
  // report a true stroke length on path elements, which is what makes the
  // dash-offset animation trace the letterforms instead of just fading in.
  const font = getHandFont(weight);
  const baseline = size * 1.2;
  const height = Math.ceil(size * 1.7);
  const opentypePath = font?.getPath(step.content, 2, baseline, size);
  const d = opentypePath?.toPathData(2) ?? "";
  const bbox = d ? opentypePath!.getBoundingBox() : null;
  const width = bbox ? Math.max(16, Math.ceil(bbox.x2) + 6) : 16;

  useLayoutEffect(() => {
    if (pathRef.current) {
      setPathLength(pathRef.current.getTotalLength());
    }
  }, [d]);

  useEffect(() => {
    if (!isWriting) return;
    const raf = requestAnimationFrame(() => setPhase("drawing"));
    return () => cancelAnimationFrame(raf);
  }, [isWriting]);

  useEffect(() => {
    if (phase !== "drawing") return;
    const timer = setTimeout(() => setPhase("inked"), duration + 150);
    return () => clearTimeout(timer);
  }, [phase, duration]);

  const dash = pathLength || 1;

  return (
    <div className={`line line-${step.kind}`}>
      <div className="line-canvas" style={{ width, height }}>
        <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`}>
          <path
            ref={pathRef}
            d={d}
            className={`line-glyphs phase-${phase}`}
            style={
              {
                strokeDasharray: dash,
                strokeDashoffset: phase === "idle" ? dash : 0,
                "--draw-duration": `${duration}ms`,
              } as React.CSSProperties
            }
          />
        </svg>
        {isWriting && (
          <span
            className="pen-icon"
            aria-hidden="true"
            style={{
              transform: `translateX(${phase === "idle" ? 0 : width}px) translateY(-50%) rotate(-14deg)`,
              transitionDuration: phase === "drawing" ? `${duration}ms` : "0ms",
            }}
          >
            ✏️
          </span>
        )}
      </div>
    </div>
  );
}
