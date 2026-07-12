import { useEffect, useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { stepSpring } from "../field/spring";
import { useFieldStore } from "../state/store";

interface PinFieldProps {
  depthData: Float32Array;
  gridWidth: number;
  gridHeight: number;
}

const PIN_RADIUS = 0.045;
const PIN_LENGTH = 1; // unit length; per-instance Y scale multiplies this
const MIN_HEIGHT = 0.03;
const MAX_DT = 1 / 20; // clamp so a stalled tab doesn't launch pins on resume

const baseColor = new THREE.Color("#1c2a3a");
const tipColor = new THREE.Color("#4fd6ff");
const tmpColor = new THREE.Color();
const tmpMatrix = new THREE.Matrix4();
const tmpPosition = new THREE.Vector3();
const tmpQuaternion = new THREE.Quaternion();
const tmpScale = new THREE.Vector3(1, 1, 1);

export function PinField({ depthData, gridWidth, gridHeight }: PinFieldProps) {
  const meshRef = useRef<THREE.InstancedMesh>(null);
  const count = gridWidth * gridHeight;

  // Animation state lives in refs/typed arrays, NOT React state — updated every
  // frame directly, per the Phase 1 requirement to keep the render loop out of React.
  const current = useRef<Float32Array>(new Float32Array(count));
  const velocity = useRef<Float32Array>(new Float32Array(count));
  const target = useRef<Float32Array>(depthData);
  const lastReplayToken = useRef(useFieldStore.getState().replayToken);

  useEffect(() => {
    target.current = depthData;
  }, [depthData]);

  const geometry = useMemo(
    () => new THREE.CapsuleGeometry(PIN_RADIUS, PIN_LENGTH, 2, 6),
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

  useFrame((_, rawDt) => {
    const mesh = meshRef.current;
    if (!mesh) return;

    const { depthScale, springStiffness, damping, animationSpeed, replayToken } =
      useFieldStore.getState();

    if (replayToken !== lastReplayToken.current) {
      lastReplayToken.current = replayToken;
      current.current.fill(0);
      velocity.current.fill(0);
    }

    const dt = Math.min(rawDt, MAX_DT) * animationSpeed;
    const cur = current.current;
    const vel = velocity.current;
    const tgt = target.current;

    for (let i = 0; i < count; i++) {
      const [nextValue, nextVelocity] = stepSpring(
        cur[i],
        vel[i],
        tgt[i] * depthScale,
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
        emissive="#0b3a4a"
        emissiveIntensity={0.35}
        roughness={0.45}
        metalness={0.15}
        toneMapped={false}
      />
    </instancedMesh>
  );
}
