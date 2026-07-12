import { useEffect, useMemo, useState } from "react";
import { Scene } from "./components/Scene";
import { DebugPanel } from "./components/DebugPanel";
import { Toolbar } from "./components/Toolbar";
import { loadDepthMap } from "./vision/depthMap";
import { computeConfidence } from "./field/confidence";
import { useFieldStore } from "./state/store";
import "./App.css";

const DEPTH_MAP_URL = "/depth/hand.png";

export default function App() {
  const gridWidth = useFieldStore((s) => s.gridWidth);
  const gridHeight = useFieldStore((s) => s.gridHeight);
  const backgroundMode = useFieldStore((s) => s.backgroundMode);
  const [depthData, setDepthData] = useState<Float32Array | null>(null);

  useEffect(() => {
    let cancelled = false;
    loadDepthMap(DEPTH_MAP_URL, gridWidth, gridHeight).then((data) => {
      if (!cancelled) setDepthData(data);
    });
    return () => {
      cancelled = true;
    };
  }, [gridWidth, gridHeight]);

  const confidenceData = useMemo(
    () => (depthData ? computeConfidence(depthData, gridWidth, gridHeight) : null),
    [depthData, gridWidth, gridHeight],
  );

  return (
    <div className="app-root">
      {depthData && confidenceData ? (
        <Scene
          depthData={depthData}
          confidenceData={confidenceData}
          gridWidth={gridWidth}
          gridHeight={gridHeight}
        />
      ) : (
        <div className="loading">Loading perception field&hellip;</div>
      )}

      {backgroundMode && (
        <div className="mock-foreground">
          <div className="mock-eyebrow">Ambient background demo</div>
          <h1>This is what the field looks like as a backdrop.</h1>
          <p>
            Dimmed, pulled back, slowly auto-rotating — meant to sit behind real
            content rather than be the focus. Toggle "Full field view" to inspect
            it directly.
          </p>
        </div>
      )}

      <div className="hud">
        <div className="hud-title">
          <span className="hud-dot" />
          Perception Field <span className="hud-phase">— Phase 1/2 prototype</span>
        </div>
        <DebugPanel />
        <Toolbar pinCount={gridWidth * gridHeight} />
      </div>
    </div>
  );
}
