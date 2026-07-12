import { useEffect, useRef, useState } from "react";
import { useFieldStore } from "../state/store";

interface ToolbarProps {
  pinCount: number;
}

export function Toolbar({ pinCount }: ToolbarProps) {
  const requestNewPlan = useFieldStore((s) => s.requestNewPlan);
  const fps = useFps();

  return (
    <div className="panel toolbar">
      <div className="toolbar-stats">
        <span>
          FPS <b>{fps}</b>
        </span>
        <span>
          Pins <b>{pinCount.toLocaleString()}</b>
        </span>
      </div>
      <div className="toolbar-buttons">
        <button onClick={requestNewPlan}>Redraw from the start</button>
      </div>
    </div>
  );
}

function useFps(): number {
  const [fps, setFps] = useState(0);
  const frames = useRef(0);
  const lastReport = useRef(performance.now());

  useEffect(() => {
    let raf = 0;
    const tick = () => {
      frames.current += 1;
      const now = performance.now();
      const elapsed = now - lastReport.current;
      if (elapsed >= 250) {
        setFps(Math.round((frames.current * 1000) / elapsed));
        frames.current = 0;
        lastReport.current = now;
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);

  return fps;
}
