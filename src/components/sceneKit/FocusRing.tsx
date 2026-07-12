interface FocusRingProps {
  cx: number;
  cy: number;
  /** Bump this to re-trigger the pulse (e.g. a moment counter) — mounting with a new key restarts the CSS animation. */
  pulseKey: number | string;
}

/**
 * A soft radar-ping highlight for a single beat — "look here, right now."
 * Shared across scenes: DNA uses it on a base pair, Big Bang on a forming
 * galaxy cluster, sine on the point/curve-tip pair at the peak moment.
 */
export function FocusRing({ cx, cy, pulseKey }: FocusRingProps) {
  return <circle key={pulseKey} cx={cx} cy={cy} r={6} className="scene-focus-ring" />;
}
