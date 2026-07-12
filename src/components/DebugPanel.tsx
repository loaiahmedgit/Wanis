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
    riseHeight,
    springStiffness,
    damping,
    spacing,
    animationSpeed,
    stepIntervalSeconds,
    flickerSeconds,
    setRiseHeight,
    setSpringStiffness,
    setDamping,
    setSpacing,
    setAnimationSpeed,
    setStepIntervalSeconds,
    setFlickerSeconds,
  } = useFieldStore();

  const sliders: SliderDef[] = [
    { label: "Pin rise height", value: riseHeight, min: 0.2, max: 2, step: 0.05, onChange: setRiseHeight },
    { label: "Spring stiffness", value: springStiffness, min: 20, max: 300, step: 2, onChange: setSpringStiffness },
    { label: "Damping", value: damping, min: 2, max: 40, step: 0.5, onChange: setDamping },
    { label: "Pin spacing", value: spacing, min: 0.02, max: 0.1, step: 0.002, onChange: setSpacing },
    { label: "Animation speed", value: animationSpeed, min: 0.1, max: 3, step: 0.05, onChange: setAnimationSpeed },
    { label: "Step interval (s)", value: stepIntervalSeconds, min: 0.4, max: 4, step: 0.1, onChange: setStepIntervalSeconds },
    { label: "Flicker duration (s)", value: flickerSeconds, min: 0, max: 1.2, step: 0.05, onChange: setFlickerSeconds },
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
