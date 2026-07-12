import { useMemo } from "react";
import { parseSceneGraph } from "../visual/sceneGraph";
import { compileSceneGraph } from "../visual/compiler";
import { StrokePlayer } from "./StrokePlayer";
import "../App.css";

/**
 * Hidden render route (main.tsx mounts this when ?rendergraph=<base64> is
 * present). Mounts the REAL StrokePlayer inside the REAL .scene-canvas card
 * with production CSS and fonts, in its COMPLETED state (isWriting=false) —
 * so the vision critic screenshots exactly what a student sees, including
 * card framing, the 60vh cap, responsive width, and real fonts. The old
 * standalone-SVG render (renderSvg.ts) couldn't judge any of that.
 */
function decodeGraph(encoded: string): unknown | null {
  try {
    const bytes = Uint8Array.from(atob(encoded), (c) => c.charCodeAt(0));
    return JSON.parse(new TextDecoder().decode(bytes));
  } catch {
    return null;
  }
}

export function RenderHarness({ encoded }: { encoded: string }) {
  const program = useMemo(() => {
    const raw = decodeGraph(encoded);
    if (!raw) return null;
    const graph = parseSceneGraph(raw);
    return graph ? compileSceneGraph(graph) : null;
  }, [encoded]);

  return (
    <div className="app-root">
      <div className="board-wrap">
        <div className="board">
          {program ? (
            <div className="drawing">
              <div className="scene-canvas" data-render-target="1">
                <StrokePlayer program={program} isWriting={false} durationMs={1} />
              </div>
            </div>
          ) : (
            <p className="loading">invalid graph</p>
          )}
        </div>
      </div>
    </div>
  );
}
