import { useEffect, useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { stepSpring } from "../field/spring";
import { useFieldStore } from "../state/store";

interface PinFieldProps {
  depthData: Float32Array;
  confidenceData: Float32Array;
  gridWidth: number;
  gridHeight: number;
}

const PIN_RADIUS = 0.02;
const PIN_LENGTH = 1; // unit length; per-instance Y scale multiplies this
const MIN_HEIGHT = 0.025;
const MAX_DT = 1 / 20; // clamp so a stalled tab doesn't launch pins on resume
const JITTER_FREQ_BASE = 2.2;

const baseColorFull = new THREE.Color("#1c2a3a");
const tipColorFull = new THREE.Color("#4fd6ff");
const baseColorDim = new THREE.Color("#0a1119");
const tipColorDim = new THREE.Color("#1c4a5c");
const tmpColor = new THREE.Color();
const tmpMatrix = new THREE.Matrix4();
const tmpPosition = new THREE.Vector3();
const tmpQuaternion = new THREE.Quaternion();
const tmpScale = new THREE.Vector3(1, 1, 1);

/** Deterministic pseudo-random in [0,1) from an integer index — avoids
 * needing a real RNG dependency just to vary per-pin jitter phase. */
function hash01(i: number): number {
  const s = Math.sin(i * 12.9898) * 43758.5453;
  return s - Math.floor(s);
}

export function PinField({ depthData, confidenceData, gridWidth, gridHeight }: PinFieldProps) {
  const meshRef = useRef<THREE.InstancedMesh>(null);
  const count = gridWidth * gridHeight;
  const backgroundMode = useFieldStore((s) => s.backgroundMode);

  // Animation state lives in refs/typed arrays, NOT React state — updated every
  // frame directly, so the render loop never fights React's cycle.
  const current = useRef<Float32Array>(new Float32Array(count));
  const velocity = useRef<Float32Array>(new Float32Array(count));
  const target = useRef<Float32Array>(depthData);
  const confidence = useRef<Float32Array>(confidenceData);
  const lastReplayToken = useRef(useFieldStore.getState().replayToken);
  const settleStart = useRef(performance.now());

  useEffect(() => {
    target.current = depthData;
  }, [depthData]);
  useEffect(() => {
    confidence.current = confidenceData;
  }, [confidenceData]);

  const jitterPhase = useMemo(() => {
    const arr = new Float32Array(count);
    for (let i = 0; i < count; i++) arr[i] = hash01(i) * Math.PI * 2;
    return arr;
  }, [count]);

  const geometry = useMemo(
    () => new THREE.CapsuleGeometry(PIN_RADIUS, PIN_LENGTH, 1, 5),
    [],
  );

  const spacing = useFieldStore((s) => s.spacing);
  const positions = useMemo(() => {
    const arr = new Float32Array(count * 2); // x, z per pin
    const offsetX = ((gridWidth - 1) * spacing) / 2;
    const offsetZ = ((gridHeight - 1) * spacing) / 2;
    for (let gy = 0; gy < gridHeight; gy++) {
      for (let gx = 0; gx < gridWidth; gx++) {
        const i = gy * gridWidth + gx;
        arr[i * 2] = gx * spacing - offsetX;
        arr[i * 2 + 1] = gy * spacing - offsetZ;
      }
    }
    return arr;
  }, [gridWidth, gridHeight, count, spacing]);

  const baseColor = backgroundMode ? baseColorDim : baseColorFull;
  const tipColor = backgroundMode ? tipColorDim : tipColorFull;

  useFrame((state, rawDt) => {
    const mesh = meshRef.current;
    if (!mesh) return;

    const {
      depthScale,
      springStiffness,
      damping,
      animationSpeed,
      replayToken,
      instabilityAmount,
      settleDuration,
    } = useFieldStore.getState();

    if (replayToken !== lastReplayToken.current) {
      lastReplayToken.current = replayToken;
      current.current.fill(0);
      velocity.current.fill(0);
      settleStart.current = performance.now();
    }

    const dt = Math.min(rawDt, MAX_DT) * animationSpeed;
    const cur = current.current;
    const vel = velocity.current;
    const tgt = target.current;
    const conf = confidence.current;
    const time = state.clock.elapsedTime;

    const settleElapsed = (performance.now() - settleStart.current) / 1000;
    const settleProgress = Math.min(1, settleElapsed / settleDuration);
    const globalInstability = instabilityAmount * (1 - settleProgress);

    for (let i = 0; i < count; i++) {
      const pinInstability = globalInstability * (1 - conf[i]);
      const jitter =
        pinInstability > 0.001
          ? Math.sin(time * JITTER_FREQ_BASE + jitterPhase[i]) * pinInstability * depthScale * 0.18
          : 0;

      const [nextValue, nextVelocity] = stepSpring(
        cur[i],
        vel[i],
        tgt[i] * depthScale + jitter,
        springStiffness,
        damping,
        dt,
      );
      cur[i] = nextValue;
      vel[i] = nextVelocity;

      const height = Math.max(MIN_HEIGHT, nextValue);
      const x = positions[i * 2];
      const z = positions[i * 2 + 1];

      tmpPosition.set(x, (height * PIN_LENGTH) / 2, z);
      tmpScale.set(1, height, 1);
      tmpMatrix.compose(tmpPosition, tmpQuaternion, tmpScale);
      mesh.setMatrixAt(i, tmpMatrix);

      const brightness = Math.min(1, height / Math.max(0.001, depthScale));
      tmpColor.copy(baseColor).lerp(tipColor, brightness);
      mesh.setColorAt(i, tmpColor);
    }

    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  });

  return (
    <instancedMesh ref={meshRef} args={[geometry, undefined, count]} frustumCulled={false}>
      <meshStandardMaterial
        vertexColors
        color="#ffffff"
        emissive={backgroundMode ? "#041420" : "#0b3a4a"}
        emissiveIntensity={backgroundMode ? 0.18 : 0.35}
        roughness={0.45}
        metalness={0.15}
        toneMapped={false}
        transparent={backgroundMode}
        opacity={backgroundMode ? 0.55 : 1}
      />
    </instancedMesh>
  );
}
