import { useEffect, useState } from "react";
import { Scene } from "./components/Scene";
import { DebugPanel } from "./components/DebugPanel";
import { Toolbar } from "./components/Toolbar";
import { loadDepthMap } from "./vision/depthMap";
import { useFieldStore } from "./state/store";
import "./App.css";

const DEPTH_MAP_URL = "/depth/hand.png";

export default function App() {
  const gridWidth = useFieldStore((s) => s.gridWidth);
  const gridHeight = useFieldStore((s) => s.gridHeight);
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

  return (
    <div className="app-root">
      {depthData ? (
        <Scene depthData={depthData} gridWidth={gridWidth} gridHeight={gridHeight} />
      ) : (
        <div className="loading">Loading perception field&hellip;</div>
      )}

      <div className="hud">
        <div className="hud-title">
          <span className="hud-dot" />
          Perception Field <span className="hud-phase">— Phase 1 prototype</span>
        </div>
        <DebugPanel />
        <Toolbar pinCount={gridWidth * gridHeight} />
      </div>
    </div>
  );
}
