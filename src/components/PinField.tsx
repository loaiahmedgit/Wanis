import { useEffect, useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { stepSpring } from "../field/spring";
import { mergeInto } from "../field/rasterize";
import type { LaidOutStep } from "../field/layout";
import { useFieldStore } from "../state/store";

interface PinFieldProps {
  steps: LaidOutStep[];
  gridWidth: number;
  gridHeight: number;
  /** Bumped whenever a brand-new plan should start drawing from scratch. */
  planToken: number;
}

const PIN_RADIUS = 0.012;
const PIN_LENGTH = 1;
const MIN_HEIGHT = 0.018;
const MAX_DT = 1 / 20;
const SETTLE_EPS = 0.004;
// Rotates the capsule's local Y (length) axis onto world Z, so pins extrude
// toward the camera off a board that lies flat in the XY plane.
const PIN_ORIENTATION = new THREE.Quaternion().setFromAxisAngle(
  new THREE.Vector3(1, 0, 0),
  Math.PI / 2,
);

const baseColor = new THREE.Color("#132030");
const onColor = new THREE.Color("#eaf8ff");
const flickerColor = new THREE.Color("#4fd6ff");
const tmpColor = new THREE.Color();
const tmpMatrix = new THREE.Matrix4();
const tmpPosition = new THREE.Vector3();
const tmpScale = new THREE.Vector3(1, 1, 1);

function hash01(i: number): number {
  const s = Math.sin(i * 12.9898) * 43758.5453;
  return s - Math.floor(s);
}

export function PinField({ steps, gridWidth, gridHeight, planToken }: PinFieldProps) {
  const meshRef = useRef<THREE.InstancedMesh>(null);
  const count = gridWidth * gridHeight;
  const spacing = useFieldStore((s) => s.spacing);

  const current = useRef<Float32Array>(new Float32Array(count));
  const velocity = useRef<Float32Array>(new Float32Array(count));
  const boardTarget = useRef<Float32Array>(new Float32Array(count));
  const flickerUntil = useRef<Float32Array>(new Float32Array(count));
  const activeSet = useRef<Set<number>>(new Set());
  const revealedSteps = useRef(0);
  const nextRevealAt = useRef(0);
  const initializedGeometry = useRef(false);

  const positions = useMemo(() => {
    const arr = new Float32Array(count * 2); // x, y per pin (board-plane coords)
    const offsetX = ((gridWidth - 1) * spacing) / 2;
    const offsetY = ((gridHeight - 1) * spacing) / 2;
    for (let gy = 0; gy < gridHeight; gy++) {
      for (let gx = 0; gx < gridWidth; gx++) {
        const i = gy * gridWidth + gx;
        arr[i * 2] = gx * spacing - offsetX;
        arr[i * 2 + 1] = offsetY - gy * spacing; // row 0 at the top
      }
    }
    return arr;
  }, [gridWidth, gridHeight, count, spacing]);

  const geometry = useMemo(() => new THREE.CapsuleGeometry(PIN_RADIUS, PIN_LENGTH, 1, 5), []);

  /** Snaps every pin back to its flat resting matrix and clears all
   * animation state — used both on first mount and whenever a new plan
   * starts, so pins lit up by a previous prompt don't stay stuck on screen. */
  function resetBoard() {
    const mesh = meshRef.current;
    if (!mesh) return;
    current.current.fill(0);
    velocity.current.fill(0);
    boardTarget.current.fill(0);
    flickerUntil.current.fill(0);
    activeSet.current.clear();
    revealedSteps.current = 0;
    nextRevealAt.current = 0;

    for (let i = 0; i < count; i++) {
      const x = positions[i * 2];
      const y = positions[i * 2 + 1];
      tmpPosition.set(x, y, MIN_HEIGHT / 2);
      tmpScale.set(1, MIN_HEIGHT, 1);
      tmpMatrix.compose(tmpPosition, PIN_ORIENTATION, tmpScale);
      mesh.setMatrixAt(i, tmpMatrix);
      mesh.setColorAt(i, baseColor);
    }
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    initializedGeometry.current = true;
  }

  // One-time (or grid-change) full pass so every pin has a valid resting
  // matrix before the active-set loop starts only touching a subset.
  useEffect(resetBoard, [positions, count]);

  // New plan: previously-lit pins must snap back to flat, not stay stuck.
  useEffect(() => {
    if (initializedGeometry.current) resetBoard();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [planToken]);

  useFrame((state, rawDt) => {
    const mesh = meshRef.current;
    if (!mesh || !initializedGeometry.current) return;

    const { springStiffness, damping, animationSpeed, riseHeight, stepIntervalSeconds, flickerSeconds } =
      useFieldStore.getState();

    const dt = Math.min(rawDt, MAX_DT) * animationSpeed;
    const now = state.clock.elapsedTime;

    // Reveal the next step on a timer.
    if (revealedSteps.current < steps.length && now >= nextRevealAt.current) {
      const next = steps[revealedSteps.current];
      const before = boardTarget.current;
      const layerCopy = before.slice();
      mergeInto(layerCopy, next.layer);
      for (let i = 0; i < count; i++) {
        if (layerCopy[i] > before[i] + 0.001) {
          before[i] = layerCopy[i];
          flickerUntil.current[i] = now + flickerSeconds;
          activeSet.current.add(i);
        }
      }
      revealedSteps.current += 1;
      nextRevealAt.current = now + stepIntervalSeconds;
    }

    const cur = current.current;
    const vel = velocity.current;
    const tgt = boardTarget.current;
    const flick = flickerUntil.current;

    const toRemove: number[] = [];
    activeSet.current.forEach((i) => {
      const finalTarget = tgt[i] * riseHeight;
      const isFlickering = now < flick[i];
      const effectiveTarget = isFlickering
        ? finalTarget * (0.25 + hash01(i * 7919 + Math.floor(now * 30)) * 0.9)
        : finalTarget;

      const [nextValue, nextVelocity] = stepSpring(
        cur[i],
        vel[i],
        effectiveTarget,
        springStiffness,
        damping,
        dt,
      );
      cur[i] = nextValue;
      vel[i] = nextVelocity;

      const height = Math.max(MIN_HEIGHT, nextValue);
      const x = positions[i * 2];
      const y = positions[i * 2 + 1];
      tmpPosition.set(x, y, height / 2);
      tmpScale.set(1, height, 1);
      tmpMatrix.compose(tmpPosition, PIN_ORIENTATION, tmpScale);
      mesh.setMatrixAt(i, tmpMatrix);

      tmpColor.copy(baseColor).lerp(isFlickering ? flickerColor : onColor, Math.min(1, height / Math.max(0.001, riseHeight)));
      mesh.setColorAt(i, tmpColor);

      const settled =
        !isFlickering && Math.abs(finalTarget - nextValue) < SETTLE_EPS && Math.abs(nextVelocity) < SETTLE_EPS;
      if (settled) toRemove.push(i);
    });

    if (toRemove.length) {
      mesh.instanceMatrix.needsUpdate = true;
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
      for (const i of toRemove) activeSet.current.delete(i);
    } else if (activeSet.current.size > 0) {
      mesh.instanceMatrix.needsUpdate = true;
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    }
  });

  return (
    <instancedMesh ref={meshRef} args={[geometry, undefined, count]} frustumCulled={false}>
      <meshStandardMaterial
        vertexColors
        color="#ffffff"
        emissive="#0b3a4a"
        emissiveIntensity={0.4}
        roughness={0.4}
        metalness={0.1}
        toneMapped={false}
      />
    </instancedMesh>
  );
}
