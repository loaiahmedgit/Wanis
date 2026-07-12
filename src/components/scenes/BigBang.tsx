import { useEffect, useLayoutEffect, useRef, useState } from "react";
import type { SceneComponentProps } from "../../explain/sceneTemplates";
import { easeInOutCubic, type ViewBox } from "../../explain/sceneCamera";
import { FocusRing } from "../sceneKit/FocusRing";
import { Callout } from "../sceneKit/Callout";

export type BigBangParams = Record<string, never>;

const VIEW_W = 900;
const VIEW_H = 420;
const CX = 450;
const CY = 210;
const TIGHT_VB: ViewBox = [CX - 80, CY - 80, 160, 160];
const FULL_VB: ViewBox = [0, 0, VIEW_W, VIEW_H];

// Deterministic pseudo-random so the layout is reproducible, not different
// on every mount/StrictMode double-invoke.
function mulberry32(seed: number) {
  let s = seed;
  return () => {
    s |= 0;
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const rand = mulberry32(42);
const N_PARTICLES = 46;
const PARTICLES = Array.from({ length: N_PARTICLES }, () => {
  const r = 130 * Math.sqrt(rand());
  const angle = rand() * Math.PI * 2;
  return { bx: r * Math.cos(angle), by: r * Math.sin(angle), size: 2.4 + rand() * 3 };
});

const GRID_STEP = 40;
const GRID_HALF = 4;
const GRID_DOTS: { bx: number; by: number }[] = [];
for (let gx = -GRID_HALF; gx <= GRID_HALF; gx++) {
  for (let gy = -GRID_HALF; gy <= GRID_HALF; gy++) {
    GRID_DOTS.push({ bx: gx * GRID_STEP, by: gy * GRID_STEP });
  }
}

const HOT = [225, 238, 255];
const COOL = [179, 84, 30];
const K_START = 0.1;
const K_END = 1.15;
const GALAXY_PARTICLE_INDEX = 9;
const GALAXY_T = 0.58;

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}
function colorAt(t: number): string {
  const c = HOT.map((h, i) => Math.round(lerp(h, COOL[i], Math.min(1, t))));
  return `rgb(${c[0]}, ${c[1]}, ${c[2]})`;
}

export function BigBang({ isWriting, durationMs }: SceneComponentProps<BigBangParams>) {
  const svgRef = useRef<SVGSVGElement>(null);
  // [particle0..particleN, grid0..gridM] — queried once, in DOM order.
  const elsRef = useRef<SVGCircleElement[]>([]);
  const [galaxyMoment, setGalaxyMoment] = useState<{ show: boolean; x: number; y: number }>({
    show: false,
    x: CX,
    y: CY,
  });
  const [endCalloutVisible, setEndCalloutVisible] = useState(!isWriting);

  function renderExpansion(t: number) {
    const k = lerp(K_START, K_END, easeInOutCubic(Math.min(1, t)));
    const color = colorAt(t);
    const els = elsRef.current;
    // Grid dots render first in the JSX below, so they occupy the first
    // GRID_DOTS.length DOM slots — this must match that order, not the
    // other way around, or particles silently get no fill (SVG's default
    // black) while their positions leak onto the grid dots instead.
    GRID_DOTS.forEach((g, i) => {
      const el = els[i];
      el?.setAttribute("cx", String(CX + g.bx * k));
      el?.setAttribute("cy", String(CY + g.by * k));
    });
    PARTICLES.forEach((p, i) => {
      const el = els[GRID_DOTS.length + i];
      el?.setAttribute("cx", String(CX + p.bx * k));
      el?.setAttribute("cy", String(CY + p.by * k));
      el?.setAttribute("fill", color);
    });
    const vb = TIGHT_VB.map((f, i) => f + (FULL_VB[i] - f) * easeInOutCubic(Math.min(1, t)));
    if (vb.every(Number.isFinite)) svgRef.current?.setAttribute("viewBox", vb.join(" "));
  }

  useLayoutEffect(() => {
    const svg = svgRef.current;
    elsRef.current = svg ? Array.from(svg.querySelectorAll<SVGCircleElement>(".scene-bb-el")) : [];
    renderExpansion(isWriting ? 0 : 1);
    if (!isWriting) svg?.setAttribute("viewBox", FULL_VB.join(" "));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!isWriting) return;
    const reduceMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    if (reduceMotion) {
      renderExpansion(1);
      svgRef.current?.setAttribute("viewBox", FULL_VB.join(" "));
      setEndCalloutVisible(true);
      return;
    }

    let cancelled = false;
    const holdMs = 700;
    const expansionMs = Math.max(3000, durationMs - holdMs - 400);
    let galaxyFired = false;

    const play = async () => {
      await new Promise((r) => setTimeout(r, holdMs));
      if (cancelled) return;

      const start = performance.now();
      await new Promise<void>((resolve) => {
        function tick(now: number) {
          if (cancelled) return resolve();
          const t = Math.min(1, (now - start) / expansionMs);
          renderExpansion(t);
          if (!galaxyFired && t >= GALAXY_T) {
            galaxyFired = true;
            const k = lerp(K_START, K_END, easeInOutCubic(t));
            const p = PARTICLES[GALAXY_PARTICLE_INDEX];
            setGalaxyMoment({ show: true, x: CX + p.bx * k, y: CY + p.by * k });
          }
          if (t < 1) requestAnimationFrame(tick);
          else resolve();
        }
        requestAnimationFrame(tick);
      });
      if (cancelled) return;
      await new Promise((r) => setTimeout(r, 250));
      if (cancelled) return;
      setEndCalloutVisible(true);
    };
    play();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isWriting, durationMs]);

  return (
    <svg ref={svgRef} width="100%" viewBox={`0 0 ${VIEW_W} ${VIEW_H}`} preserveAspectRatio="xMidYMid meet">
      {GRID_DOTS.map((_, i) => (
        <circle key={`g${i}`} className="scene-bb-el scene-bb-grid-dot" r={1.6} />
      ))}
      {PARTICLES.map((p, i) => (
        <circle key={`p${i}`} className="scene-bb-el scene-bb-particle" r={p.size} />
      ))}
      {galaxyMoment.show && <FocusRing cx={galaxyMoment.x} cy={galaxyMoment.y} pulseKey="galaxy" />}
      {galaxyMoment.show && <Callout x={galaxyMoment.x + 16} y={galaxyMoment.y - 10} text="galaxies form" visible />}
      {endCalloutVisible && <Callout x={VIEW_W - 220} y={VIEW_H - 26} text="still expanding today" visible />}
    </svg>
  );
}
