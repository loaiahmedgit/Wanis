import { useFieldStore } from "../state/store";

interface SliderDef {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (v: number) => void;
}

export function DebugPanel() {
  const {
    depthScale,
    springStiffness,
    damping,
    spacing,
    animationSpeed,
    setDepthScale,
    setSpringStiffness,
    setDamping,
    setSpacing,
    setAnimationSpeed,
  } = useFieldStore();

  const sliders: SliderDef[] = [
    { label: "Depth scale", value: depthScale, min: 0.5, max: 6, step: 0.1, onChange: setDepthScale },
    { label: "Spring stiffness", value: springStiffness, min: 10, max: 220, step: 1, onChange: setSpringStiffness },
    { label: "Damping", value: damping, min: 1, max: 40, step: 0.5, onChange: setDamping },
    { label: "Grid spacing", value: spacing, min: 0.06, max: 0.24, step: 0.005, onChange: setSpacing },
    { label: "Animation speed", value: animationSpeed, min: 0.1, max: 3, step: 0.05, onChange: setAnimationSpeed },
  ];

  return (
    <div className="panel debug-panel">
      <h2>Debug</h2>
      {sliders.map((s) => (
        <label key={s.label} className="slider-row">
          <span>
            {s.label}
            <b>{s.value.toFixed(2)}</b>
          </span>
          <input
            type="range"
            min={s.min}
            max={s.max}
            step={s.step}
            value={s.value}
            onChange={(e) => s.onChange(Number(e.target.value))}
          />
        </label>
      ))}
      <p className="hint">All parameters apply live.</p>
    </div>
  );
}
