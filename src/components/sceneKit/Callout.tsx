interface CalloutProps {
  x: number;
  y: number;
  text: string;
  /** Mount only when visible — drives the CSS fade/slide-in. */
  visible: boolean;
}

/**
 * A short, handwritten-feel aside that fades in near a point — "one full
 * turn = 2π", "galaxies form". Reserved for informal asides, never for
 * data/labels (those use .scene-label, the clean sans register). Shared
 * across scenes rather than rebuilt per scene.
 */
export function Callout({ x, y, text, visible }: CalloutProps) {
  if (!visible) return null;
  return (
    <text x={x} y={y} className="scene-callout">
      {text}
    </text>
  );
}
