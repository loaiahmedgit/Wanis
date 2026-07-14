import { useEffect, useMemo, useState } from "react";
import { parseSceneGraph } from "../visual/sceneGraph";
import { compileSceneGraph } from "../visual/compiler";
import { parseLessonBoard } from "../explain/lessonBoard";
import { loadHandFonts } from "../explain/handFonts";
import { StrokePlayer } from "./StrokePlayer";
import { LessonBoard } from "./LessonBoard";
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
  // ?rendergraph=..&anim=1 plays the scene (so the semantic camera runs) for
  // deterministic gate screenshots; default renders the finished whole state.
  const anim = new URLSearchParams(window.location.search).get("anim") === "1";

  return (
    <div className="app-root">
      <div className="board-wrap">
        <div className="board">
          {program ? (
            <div className="drawing">
              <div className="scene-canvas" data-render-target="1">
                <StrokePlayer program={program} isWriting={anim} durationMs={anim ? 5000 : 1} />
              </div>
            </div>
          ) : (
            <p className="loading">…</p>
          )}
        </div>
      </div>
    </div>
  );
}

function decode(encoded: string): unknown | null {
  return decodeGraph(encoded);
}

/**
 * Hidden render route for the lesson-board composer: ?renderboard=<base64
 * lessonBoard> mounts the REAL LessonBoard so staged screenshots capture the
 * actual camera + persistent board a student sees.
 */
export function BoardRenderHarness({ encoded }: { encoded: string }) {
  const board = useMemo(() => parseLessonBoard(decode(encoded)), [encoded]);
  // Handwriting sections need the real fonts, exactly as App loads them.
  const [fontsReady, setFontsReady] = useState(false);
  useEffect(() => {
    loadHandFonts().then(() => setFontsReady(true));
  }, []);
  return (
    <div className="app-root">
      <div className="board-wrap" data-render-target="1">
        {board && fontsReady ? <LessonBoard board={board} planToken={1} /> : <p className="loading">…</p>}
      </div>
    </div>
  );
}
