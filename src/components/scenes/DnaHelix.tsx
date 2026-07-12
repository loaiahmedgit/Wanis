import { useEffect, useLayoutEffect, useRef, useState } from "react";
import type { SceneComponentProps } from "../../explain/sceneTemplates";
import { animateViewBox, wait, type ViewBox } from "../../explain/sceneCamera";
import { FocusRing } from "../sceneKit/FocusRing";

// No LLM-supplied parameters yet — a fixed, illustrative sequence. The point
// this scene makes (structure <-> sequence are the same information) holds
// regardless of the exact letters; a "which sequence" parameter can be added
// later without touching the geometry/choreography below.
export type DnaHelixParams = Record<string, never>;

const VIEW_W = 900;
const VIEW_H = 420;
const N_RUNGS = 10;
const X0 = 90;
const X1 = 810;
const CENTER_Y = 210;
const FLAT_Y1 = 150;
const FLAT_Y2 = 270;
const AMPLITUDE = 65;
const FREQ = (Math.PI * 2 * 2.2) / (X1 - X0);
const FULL_VB: ViewBox = [0, 0, VIEW_W, VIEW_H];

const TOP_BASES = ["A", "T", "G", "C", "T", "A", "G", "G", "C", "A"];
const COMPLEMENT: Record<string, string> = { A: "T", T: "A", C: "G", G: "C" };
const BASE_COLOR: Record<string, string> = { A: "#3d6b99", T: "#b3541e", C: "#4f8f6b", G: "#9c4a4a" };
const ZOOM_INDICES = [3, 4, 5, 6];

function rungX(i: number): number {
  return X0 + (i / (N_RUNGS - 1)) * (X1 - X0);
}
function backboneY(x: number, t: number, sign: 1 | -1): number {
  const flat = sign === 1 ? FLAT_Y1 : FLAT_Y2;
  const helix = CENTER_Y + sign * AMPLITUDE * Math.sin((x - X0) * FREQ);
  return flat + (helix - flat) * t;
}
function backbonePath(t: number, sign: 1 | -1): string {
  const pts: string[] = [];
  for (let x = X0; x <= X1; x += 12) {
    pts.push(`${x.toFixed(1)} ${backboneY(x, t, sign).toFixed(1)}`);
  }
  return `M ${pts.join(" L ")}`;
}

interface LabelState {
  visible: boolean;
  top: string;
  bottom: string;
  topColor: string;
  bottomColor: string;
}

export function DnaHelix({ isWriting, durationMs }: SceneComponentProps<DnaHelixParams>) {
  const svgRef = useRef<SVGSVGElement>(null);
  // [backbone1, backbone2, rung0..rung9] — queried once, in DOM order, like
  // every other scene/drawing in this codebase (never per-element callback
  // refs, which re-attach on every render).
  const elsRef = useRef<SVGGraphicsElement[]>([]);

  const [labelStates, setLabelStates] = useState<LabelState[]>(() =>
    TOP_BASES.map((top) => ({
      visible: !isWriting,
      top,
      bottom: COMPLEMENT[top],
      topColor: BASE_COLOR[top],
      bottomColor: BASE_COLOR[COMPLEMENT[top]],
    })),
  );
  const [focusIndex, setFocusIndex] = useState<number | null>(null);
  const [sequenceRevealed, setSequenceRevealed] = useState(isWriting ? 0 : N_RUNGS);
  const [codonTint, setCodonTint] = useState(!isWriting);

  function renderTwist(t: number) {
    const els = elsRef.current;
    (els[0] as SVGPathElement | undefined)?.setAttribute("d", backbonePath(t, 1));
    (els[1] as SVGPathElement | undefined)?.setAttribute("d", backbonePath(t, -1));
    for (let i = 0; i < N_RUNGS; i++) {
      const x = rungX(i);
      const el = els[2 + i] as SVGLineElement | undefined;
      el?.setAttribute("x1", String(x));
      el?.setAttribute("y1", String(backboneY(x, t, 1)));
      el?.setAttribute("x2", String(x));
      el?.setAttribute("y2", String(backboneY(x, t, -1)));
    }
  }

  useLayoutEffect(() => {
    const svg = svgRef.current;
    elsRef.current = svg ? Array.from(svg.querySelectorAll<SVGGraphicsElement>(".scene-helix-el")) : [];
    renderTwist(isWriting ? 0 : 1);
    if (!isWriting) svg?.setAttribute("viewBox", FULL_VB.join(" "));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!isWriting) return;

    const reduceMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    if (reduceMotion) {
      renderTwist(1);
      svgRef.current?.setAttribute("viewBox", FULL_VB.join(" "));
      setLabelStates((prev) => prev.map((l) => ({ ...l, visible: true })));
      setSequenceRevealed(N_RUNGS);
      setCodonTint(true);
      return;
    }

    let cancelled = false;
    const twistMs = Math.max(1400, durationMs * 0.28);
    const zoomMs = Math.max(700, durationMs * 0.13);

    const play = async () => {
      // Moment 1-2 — flat ladder twists into a helix.
      const start = performance.now();
      await new Promise<void>((resolve) => {
        function tick(now: number) {
          if (cancelled) return resolve();
          const t = Math.min(1, (now - start) / twistMs);
          renderTwist(t);
          if (t < 1) requestAnimationFrame(tick);
          else resolve();
        }
        requestAnimationFrame(tick);
      });
      if (cancelled) return;

      // Moment 3 — camera zooms into a window of base pairs.
      const zx0 = rungX(ZOOM_INDICES[0]) - 55;
      const zx1 = rungX(ZOOM_INDICES[ZOOM_INDICES.length - 1]) + 55;
      const zoomVB: ViewBox = [zx0, 110, zx1 - zx0, 220];
      if (svgRef.current) await animateViewBox(svgRef.current, FULL_VB, zoomVB, zoomMs);
      if (cancelled) return;

      // Moment 4 — label each zoomed base pair in turn, with a focus pulse.
      for (const idx of ZOOM_INDICES) {
        setFocusIndex(idx);
        setLabelStates((prev) => {
          const next = [...prev];
          next[idx] = { ...next[idx], visible: true };
          return next;
        });
        await wait(480);
        if (cancelled) return;
      }
      setFocusIndex(null);
      await wait(200);
      if (cancelled) return;

      // Moment 5 — camera pulls back out; every base pair label settles in.
      if (svgRef.current) await animateViewBox(svgRef.current, zoomVB, FULL_VB, zoomMs);
      if (cancelled) return;
      setLabelStates((prev) => prev.map((l) => ({ ...l, visible: true })));

      // Sequence strip — letters peel off left to right.
      for (let i = 0; i <= N_RUNGS; i++) {
        setSequenceRevealed(i);
        await wait(130);
        if (cancelled) return;
      }
      await wait(150);
      if (cancelled) return;
      setCodonTint(true);
    };
    play();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isWriting, durationMs]);

  const stripY = VIEW_H - 40;
  const stripSpacing = (X1 - X0) / (N_RUNGS - 1);

  return (
    <svg ref={svgRef} width="100%" viewBox={`0 0 ${VIEW_W} ${VIEW_H}`} preserveAspectRatio="xMidYMid meet">
      <path className="scene-helix-el scene-helix-backbone" d="" fill="none" />
      <path className="scene-helix-el scene-helix-backbone" d="" fill="none" />
      {TOP_BASES.map((_, i) => (
        <line key={i} className="scene-helix-el scene-rung" />
      ))}

      {labelStates.map(
        (l, i) =>
          l.visible && (
            <g key={i}>
              <text
                x={rungX(i)}
                y={backboneY(rungX(i), 1, 1) - 12}
                textAnchor="middle"
                className="scene-label"
                style={{ fill: l.topColor }}
              >
                {l.top}
              </text>
              <text
                x={rungX(i)}
                y={backboneY(rungX(i), 1, -1) + 22}
                textAnchor="middle"
                className="scene-label"
                style={{ fill: l.bottomColor }}
              >
                {l.bottom}
              </text>
            </g>
          ),
      )}

      {focusIndex !== null && <FocusRing cx={rungX(focusIndex)} cy={CENTER_Y} pulseKey={focusIndex} />}

      {codonTint &&
        Array.from({ length: Math.ceil(N_RUNGS / 3) }).map(
          (_, g) =>
            g % 2 === 0 && (
              <rect
                key={g}
                x={X0 + g * 3 * stripSpacing - stripSpacing / 2}
                y={stripY - 20}
                width={Math.min(3, N_RUNGS - g * 3) * stripSpacing}
                height={32}
                className="scene-codon-tint"
              />
            ),
        )}

      {TOP_BASES.map(
        (base, i) =>
          i < sequenceRevealed && (
            <text
              key={i}
              x={X0 + i * stripSpacing}
              y={stripY}
              textAnchor="middle"
              className="scene-sequence-letter"
              style={{ fill: BASE_COLOR[base] }}
            >
              {base}
            </text>
          ),
      )}
    </svg>
  );
}
