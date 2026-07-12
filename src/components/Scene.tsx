import { useEffect, useRef } from "react";
import { Canvas } from "@react-three/fiber";
import { OrbitControls } from "@react-three/drei";
import type { OrbitControls as OrbitControlsImpl } from "three-stdlib";
import { PinField } from "./PinField";
import { useFieldStore } from "../state/store";

interface SceneProps {
  depthData: Float32Array;
  gridWidth: number;
  gridHeight: number;
}

export function Scene({ depthData, gridWidth, gridHeight }: SceneProps) {
  const controlsRef = useRef<OrbitControlsImpl>(null);
  const cameraResetToken = useFieldStore((s) => s.cameraResetToken);

  useEffect(() => {
    controlsRef.current?.reset();
  }, [cameraResetToken]);

  return (
    <Canvas
      camera={{ position: [0, 5.2, 7.5], fov: 42 }}
      gl={{ antialias: true }}
      dpr={[1, Math.min(window.devicePixelRatio, 2)]}
    >
      <color attach="background" args={["#05070a"]} />
      <fog attach="fog" args={["#05070a", 8, 18]} />

      <ambientLight intensity={0.25} />
      <directionalLight position={[3, 6, 4]} intensity={0.9} color="#dfe9ff" />
      <directionalLight position={[-4, 2, -3]} intensity={0.25} color="#3aa0c8" />

      <PinField depthData={depthData} gridWidth={gridWidth} gridHeight={gridHeight} />

      <OrbitControls
        ref={controlsRef}
        makeDefault
        enableDamping
        dampingFactor={0.08}
        minDistance={2.5}
        maxDistance={16}
        maxPolarAngle={Math.PI * 0.49}
      />
    </Canvas>
  );
}
