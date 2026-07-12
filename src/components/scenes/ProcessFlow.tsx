import { useEffect, useState } from "react";
import type { SceneComponentProps } from "../../explain/sceneTemplates";

export interface ProcessFlowParams {
  stages: { label: string }[];
  connector: "arrow" | "line";
  layout: "horizontal" | "vertical";
}

const NODE_W = 130;
const NODE_H = 56;
const GAP = 64;
const PAD = 22;

function layoutNodes(count: number, layout: "horizontal" | "vertical") {
  const positions: { x: number; y: number }[] = [];
  for (let i = 0; i < count; i++) {
    positions.push(
      layout === "horizontal" ? { x: PAD + i * (NODE_W + GAP), y: PAD } : { x: PAD, y: PAD + i * (NODE_H + GAP) },
    );
  }
  return positions;
}

/**
 * The generic "system/process" scene: a sequence of clean labeled stages
 * connected in order. Covers DNA replication, cell division, a circuit,
 * a timeline, or any topic that's really "step A leads to step B" — one
 * reusable component instead of a bespoke one per domain, with a crisp,
 * precise visual language (no hand-drawn pen wobble) matching the other
 * live scenes.
 */
export function ProcessFlow({ params, isWriting, durationMs }: SceneComponentProps<ProcessFlowParams>) {
  const { stages, connector, layout } = params;
  const positions = layoutNodes(stages.length, layout);
  const viewW = layout === "horizontal" ? stages.length * (NODE_W + GAP) - GAP + PAD * 2 : NODE_W + PAD * 2;
  const viewH = layout === "horizontal" ? NODE_H + PAD * 2 : stages.length * (NODE_H + GAP) - GAP + PAD * 2;

  const totalEvents = stages.length * 2 - 1; // node, connector, node, connector, ..., node
  const [revealedEvents, setRevealedEvents] = useState(isWriting ? 0 : totalEvents);
  const perEvent = Math.max(250, durationMs / totalEvents);

  useEffect(() => {
    if (!isWriting) return;
    if (revealedEvents >= totalEvents) return;
    const timer = setTimeout(() => setRevealedEvents((c) => c + 1), perEvent);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isWriting, revealedEvents, totalEvents]);

  return (
    <svg width={viewW} height={viewH} viewBox={`0 0 ${viewW} ${viewH}`}>
      <defs>
        <marker id="scene-arrowhead" markerWidth="8" markerHeight="8" refX="6" refY="4" orient="auto">
          <path d="M0,0 L8,4 L0,8 Z" className="scene-arrowhead-fill" />
        </marker>
      </defs>

      {stages.slice(0, -1).map((_, i) => {
        const from = positions[i];
        const to = positions[i + 1];
        const eventIndex = i * 2 + 1;
        const active = eventIndex <= revealedEvents;
        const x1 = layout === "horizontal" ? from.x + NODE_W : from.x + NODE_W / 2;
        const y1 = layout === "horizontal" ? from.y + NODE_H / 2 : from.y + NODE_H;
        const x2 = layout === "horizontal" ? to.x : to.x + NODE_W / 2;
        const y2 = layout === "horizontal" ? to.y + NODE_H / 2 : to.y;
        const length = Math.hypot(x2 - x1, y2 - y1) || 1;
        return (
          <line
            key={i}
            x1={x1}
            y1={y1}
            x2={x2}
            y2={y2}
            className={`scene-connector phase-${active ? "drawn" : "idle"}`}
            markerEnd={active && connector === "arrow" ? "url(#scene-arrowhead)" : undefined}
            style={
              {
                strokeDasharray: length,
                strokeDashoffset: active ? 0 : length,
                transitionDuration: `${perEvent}ms`,
              } as React.CSSProperties
            }
          />
        );
      })}

      {stages.map((stage, i) => {
        const pos = positions[i];
        const eventIndex = i * 2;
        const active = eventIndex <= revealedEvents;
        const cx = pos.x + NODE_W / 2;
        const cy = pos.y + NODE_H / 2;
        return (
          <g
            key={i}
            className={`scene-node phase-${active ? "drawn" : "idle"}`}
            style={{ transformOrigin: `${cx}px ${cy}px` } as React.CSSProperties}
          >
            <rect x={pos.x} y={pos.y} width={NODE_W} height={NODE_H} rx={10} className="scene-node-box" />
            <text x={cx} y={cy + 5} textAnchor="middle" className="scene-node-label">
              {stage.label}
            </text>
          </g>
        );
      })}
    </svg>
  );
}
