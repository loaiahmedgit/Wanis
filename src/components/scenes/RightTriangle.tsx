import { useEffect, useRef, useState } from "react";
import type { SceneComponentProps } from "../../explain/sceneTemplates";

export interface RightTriangleParams {
  legLabel1: string;
  legLabel2: string;
  hypotenuseLabel: string;
  /** If present, draws an angle arc + label at the vertex opposite legLabel1. */
  angleLabel?: string;
}

const VIEW_W = 420;
const VIEW_H = 300;

// A fixed, well-proportioned right triangle — the geometry never comes from
// the LLM, only the labels do. Right angle at A, vertical leg A-B, horizontal
// leg A-C, hypotenuse B-C. This is the whole point: correct, non-degenerate
// geometry every time, instead of an LLM guessing raw points.
const A = { x: 110, y: 240 };
const B = { x: 110, y: 70 };
const C = { x: 340, y: 240 };

const RIGHT_ANGLE_MARK = "M126,240 L126,224 L110,224";
const ARC_R = 30;
// Arc from a point on C->A to a point on C->B, sweeping the interior angle at C.
const ARC_START = { x: C.x - ARC_R, y: C.y };
const ARC_END = { x: C.x - ARC_R * 0.809, y: C.y - ARC_R * 0.588 };
const ARC_PATH = `M ${ARC_START.x} ${ARC_START.y} A ${ARC_R} ${ARC_R} 0 0 0 ${ARC_END.x} ${ARC_END.y}`;
const ANGLE_LABEL_POS = { x: C.x - 46, y: C.y - 16 };

const LABEL_LEG1 = { x: A.x - 22, y: (A.y + B.y) / 2 }; // left of the vertical leg
const LABEL_LEG2 = { x: (A.x + C.x) / 2, y: A.y + 24 }; // below the horizontal leg
const LABEL_HYP = { x: (B.x + C.x) / 2 + 14, y: (B.y + C.y) / 2 - 10 }; // above-right of the hypotenuse

type Phase = "idle" | "drawn";

function tweenDash(el: SVGGeometryElement, durationMs: number): Promise<void> {
  const len = el.getTotalLength();
  el.style.strokeDasharray = String(len);
  el.style.strokeDashoffset = String(len);
  return new Promise((resolve) => {
    const start = performance.now();
    function tick(now: number) {
      const t = Math.min(1, (now - start) / durationMs);
      el.style.strokeDashoffset = String(len * (1 - t));
      if (t < 1) requestAnimationFrame(tick);
      else resolve();
    }
    requestAnimationFrame(tick);
  });
}

export function RightTriangle({ params, isWriting, durationMs }: SceneComponentProps<RightTriangleParams>) {
  const leg1Ref = useRef<SVGLineElement>(null);
  const leg2Ref = useRef<SVGLineElement>(null);
  const hypRef = useRef<SVGLineElement>(null);
  const [phase, setPhase] = useState<Phase>(isWriting ? "idle" : "drawn");
  const [labelsVisible, setLabelsVisible] = useState(!isWriting);
  const [angleVisible, setAngleVisible] = useState(!isWriting);

  useEffect(() => {
    if (!isWriting) return;
    const reduceMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    if (reduceMotion) {
      setPhase("drawn");
      setLabelsVisible(true);
      setAngleVisible(true);
      return;
    }

    let cancelled = false;
    const edgeMs = Math.max(250, Math.min(500, durationMs / 6));

    const play = async () => {
      if (leg1Ref.current) await tweenDash(leg1Ref.current, edgeMs);
      if (cancelled) return;
      if (leg2Ref.current) await tweenDash(leg2Ref.current, edgeMs);
      if (cancelled) return;
      if (hypRef.current) await tweenDash(hypRef.current, edgeMs);
      if (cancelled) return;
      setPhase("drawn");
      setLabelsVisible(true);
      await new Promise((r) => setTimeout(r, 250));
      if (cancelled) return;
      if (params.angleLabel) setAngleVisible(true);
    };
    play();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isWriting, durationMs, params.angleLabel]);

  return (
    <svg width="100%" viewBox={`0 0 ${VIEW_W} ${VIEW_H}`} preserveAspectRatio="xMidYMid meet">
      <polygon
        points={`${A.x},${A.y} ${B.x},${B.y} ${C.x},${C.y}`}
        className={`scene-triangle-fill ${phase === "drawn" ? "is-filled" : ""}`}
      />
      <line ref={leg1Ref} x1={A.x} y1={A.y} x2={B.x} y2={B.y} className="scene-axis scene-triangle-edge" />
      <line ref={leg2Ref} x1={A.x} y1={A.y} x2={C.x} y2={C.y} className="scene-axis scene-triangle-edge" />
      <line ref={hypRef} x1={B.x} y1={B.y} x2={C.x} y2={C.y} className="scene-axis scene-triangle-edge" />
      <path d={RIGHT_ANGLE_MARK} className="scene-axis" fill="none" />

      {angleVisible && params.angleLabel && (
        <>
          <path d={ARC_PATH} className="scene-axis" fill="none" />
          <text x={ANGLE_LABEL_POS.x} y={ANGLE_LABEL_POS.y} className="scene-label" textAnchor="middle">
            {params.angleLabel}
          </text>
        </>
      )}

      <text
        x={LABEL_LEG1.x}
        y={LABEL_LEG1.y}
        textAnchor="end"
        dominantBaseline="middle"
        className={`scene-label scene-triangle-label ${labelsVisible ? "is-visible" : ""}`}
      >
        {params.legLabel1}
      </text>
      <text
        x={LABEL_LEG2.x}
        y={LABEL_LEG2.y}
        textAnchor="middle"
        className={`scene-label scene-triangle-label ${labelsVisible ? "is-visible" : ""}`}
      >
        {params.legLabel2}
      </text>
      <text
        x={LABEL_HYP.x}
        y={LABEL_HYP.y}
        textAnchor="middle"
        className={`scene-label scene-triangle-label ${labelsVisible ? "is-visible" : ""}`}
      >
        {params.hypotenuseLabel}
      </text>
    </svg>
  );
}
