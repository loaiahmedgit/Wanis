import { useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { ExplanationStep } from "../explain/types";
import { parseDrawingSpec, type Shape } from "../explain/shapes";
import { drawingDurationMs, easeOutCubic } from "../explain/timing";

interface DrawingProps {
  step: ExplanationStep;
  /** True only while this is the single drawing currently being sketched. */
  isWriting: boolean;
}

const VIEW_W = 380;
const VIEW_H = 230;

type Primitive =
  | { kind: "circle"; cx: number; cy: number; r: number }
  | { kind: "rect"; x: number; y: number; width: number; height: number }
  | { kind: "line"; x1: number; y1: number; x2: number; y2: number }
  | { kind: "polygon"; points: string }
  | { kind: "text"; x: number; y: number; text: string };

function buildPrimitives(shapes: Shape[]): Primitive[] {
  const out: Primitive[] = [];
  for (const s of shapes) {
    if (s.type === "circle") {
      out.push({ kind: "circle", cx: s.cx * VIEW_W, cy: s.cy * VIEW_H, r: s.r * Math.min(VIEW_W, VIEW_H) });
    } else if (s.type === "rect") {
      out.push({ kind: "rect", x: s.x * VIEW_W, y: s.y * VIEW_H, width: s.w * VIEW_W, height: s.h * VIEW_H });
    } else if (s.type === "line") {
      out.push({ kind: "line", x1: s.x1 * VIEW_W, y1: s.y1 * VIEW_H, x2: s.x2 * VIEW_W, y2: s.y2 * VIEW_H });
    } else if (s.type === "arrow") {
      const x1 = s.x1 * VIEW_W;
      const y1 = s.y1 * VIEW_H;
      const x2 = s.x2 * VIEW_W;
      const y2 = s.y2 * VIEW_H;
      out.push({ kind: "line", x1, y1, x2, y2 });
      const angle = Math.atan2(y2 - y1, x2 - x1);
      const headLen = 9;
      const a1 = angle + Math.PI * 0.82;
      const a2 = angle - Math.PI * 0.82;
      const hx1 = x2 + headLen * Math.cos(a1);
      const hy1 = y2 + headLen * Math.sin(a1);
      const hx2 = x2 + headLen * Math.cos(a2);
      const hy2 = y2 + headLen * Math.sin(a2);
      out.push({ kind: "polygon", points: `${x2},${y2} ${hx1},${hy1} ${hx2},${hy2}` });
    } else if (s.type === "label") {
      out.push({ kind: "text", x: s.x * VIEW_W, y: s.y * VIEW_H, text: s.text });
    } else if (s.type === "polygon") {
      const points = s.points.map(([px, py]) => `${px * VIEW_W},${py * VIEW_H}`).join(" ");
      out.push({ kind: "polygon", points });
    }
  }
  return out;
}

type Phase = "idle" | "drawing" | "inked";

export function Drawing({ step, isWriting }: DrawingProps) {
  const gradientId = useId();
  const spec = useMemo(() => parseDrawingSpec(step.content), [step.content]);
  const primitives = useMemo(() => (spec ? buildPrimitives(spec.shapes) : []), [spec]);

  const svgRef = useRef<SVGSVGElement>(null);
  const elsRef = useRef<(SVGGraphicsElement | null)[]>([]);
  const [lengths, setLengths] = useState<number[] | null>(null);
  const [revealedCount, setRevealedCount] = useState(isWriting ? 0 : primitives.length);
  const [phases, setPhases] = useState<Phase[]>(() => primitives.map(() => (isWriting ? "idle" : "inked")));
  const [penPos, setPenPos] = useState<{ x: number; y: number } | null>(null);

  useLayoutEffect(() => {
    const svg = svgRef.current;
    // Direct children in DOM order — not querySelectorAll(".shape-el"), which
    // skips label <text> elements (class "shape-label") and misaligns every
    // index against `primitives` once a label isn't the very last shape.
    elsRef.current = svg ? (Array.from(svg.children) as unknown as SVGGraphicsElement[]) : [];
    const measured = elsRef.current.map((el) => {
      if (el instanceof SVGGeometryElement) return el.getTotalLength();
      return 0;
    });
    setLengths(measured);
    const initialPhases: Phase[] = primitives.map(() => (isWriting ? "idle" : "inked"));
    setPhases(initialPhases);
    elsRef.current.forEach((el, i) => {
      if (!(el instanceof SVGGeometryElement)) return;
      el.style.strokeDashoffset = initialPhases[i] === "inked" ? "0" : String(measured[i] || 0);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [primitives]);

  const totalDuration = drawingDurationMs(primitives.length);

  useEffect(() => {
    if (!isWriting || !lengths) return;
    if (revealedCount >= primitives.length) return;
    const prim = primitives[revealedCount];
    const el = elsRef.current[revealedCount];

    if (prim.kind === "text" || !(el instanceof SVGGeometryElement)) {
      // Labels fade in quickly rather than stroke-drawing (SVG <text> can't
      // report a real path length) — a deliberate, simpler treatment than
      // the letter-by-letter board text.
      setPhases((prev) => {
        const next = [...prev];
        next[revealedCount] = "drawing";
        return next;
      });
      const timer = setTimeout(() => {
        setPhases((prev) => {
          const next = [...prev];
          next[revealedCount] = "inked";
          return next;
        });
        setRevealedCount((c) => c + 1);
      }, 450);
      return () => clearTimeout(timer);
    }

    const len = lengths?.[revealedCount] ?? 0;
    if (len <= 0.5) {
      setRevealedCount((c) => c + 1);
      return;
    }

    setPhases((prev) => {
      const next = [...prev];
      next[revealedCount] = "drawing";
      return next;
    });

    const perShare = totalDuration / Math.max(1, primitives.length);
    const duration = Math.max(300, perShare);
    const start = performance.now();
    let raf = 0;

    function tick(now: number) {
      const t = Math.min(1, (now - start) / duration);
      const eased = easeOutCubic(t);
      el!.style.strokeDashoffset = String(len * (1 - eased));
      const point = (el as SVGGeometryElement).getPointAtLength(len * eased);
      setPenPos({ x: point.x, y: point.y });

      if (t < 1) {
        raf = requestAnimationFrame(tick);
      } else {
        el!.style.strokeDashoffset = "0";
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
  }, [isWriting, lengths, revealedCount, primitives.length]);

  if (!primitives.length) return null;

  const fillId = `${gradientId}-fill`;

  return (
    <div className="drawing">
      <div className="drawing-canvas">
        <svg ref={svgRef} width={VIEW_W} height={VIEW_H} viewBox={`0 0 ${VIEW_W} ${VIEW_H}`}>
          <defs>
            <radialGradient id={fillId} cx="35%" cy="30%" r="75%">
              <stop offset="0%" stopColor="rgba(230, 150, 90, 0.32)" />
              <stop offset="100%" stopColor="rgba(179, 84, 30, 0.12)" />
            </radialGradient>
          </defs>
          {primitives.map((p, i) => {
            const phase = phases[i] ?? "idle";
            const cls = `shape-el phase-${phase}`;
            const inkedStyle = phase === "inked" ? { fill: `url(#${fillId})` } : undefined;
            if (p.kind === "circle") {
              return <circle key={i} cx={p.cx} cy={p.cy} r={p.r} className={cls} style={inkedStyle} />;
            }
            if (p.kind === "rect") {
              return (
                <rect key={i} x={p.x} y={p.y} width={p.width} height={p.height} className={cls} style={inkedStyle} />
              );
            }
            if (p.kind === "line") {
              return <line key={i} x1={p.x1} y1={p.y1} x2={p.x2} y2={p.y2} className={cls} />;
            }
            if (p.kind === "polygon") {
              return <polygon key={i} points={p.points} className={cls} style={inkedStyle} />;
            }
            return (
              <text key={i} x={p.x} y={p.y} className={`shape-label phase-${phase}`}>
                {p.text}
              </text>
            );
          })}
        </svg>
        {isWriting && penPos && revealedCount < primitives.length && primitives[revealedCount]?.kind !== "text" && (
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
