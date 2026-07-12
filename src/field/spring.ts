/**
 * One step of damped-spring motion for a single scalar value.
 * Pure function so the pin animation loop (which runs outside React state,
 * per the Phase 1 requirement) can be unit-reasoned about independently
 * of the rendering code that calls it every frame.
 */
export function stepSpring(
  current: number,
  velocity: number,
  target: number,
  stiffness: number,
  damping: number,
  dt: number,
): [nextValue: number, nextVelocity: number] {
  const acceleration = stiffness * (target - current) - damping * velocity;
  const nextVelocity = velocity + acceleration * dt;
  const nextValue = current + nextVelocity * dt;
  return [nextValue, nextVelocity];
}
