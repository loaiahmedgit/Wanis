import { useEffect, useRef } from "react";
import { Canvas } from "@react-three/fiber";
import { OrbitControls } from "@react-three/drei";
import type { OrbitControls as OrbitControlsImpl } from "three-stdlib";
import { PinField } from "./PinField";
import { useFieldStore } from "../state/store";

interface SceneProps {
  depthData: Float32Array;
  confidenceData: Float32Array;
  gridWidth: number;
  gridHeight: number;
}

export function Scene({ depthData, confidenceData, gridWidth, gridHeight }: SceneProps) {
  const controlsRef = useRef<OrbitControlsImpl>(null);
  const cameraResetToken = useFieldStore((s) => s.cameraResetToken);
  const backgroundMode = useFieldStore((s) => s.backgroundMode);

  useEffect(() => {
    controlsRef.current?.reset();
  }, [cameraResetToken, backgroundMode]);

  // Background usage: pull the camera back and flatten the angle so the
  // field reads as ambient texture behind foreground content, not a hero object.
  const cameraPosition: [number, number, number] = backgroundMode
    ? [0, 3.4, 12.5]
    : [0, 5.2, 7.5];
  const fov = backgroundMode ? 38 : 42;

  return (
    <Canvas
      camera={{ position: cameraPosition, fov }}
      gl={{ antialias: true }}
      dpr={[1, Math.min(window.devicePixelRatio, 2)]}
    >
      <color attach="background" args={["#05070a"]} />
      <fog attach="fog" args={backgroundMode ? ["#05070a", 6, 15] : ["#05070a", 8, 18]} />

      <ambientLight intensity={0.25} />
      <directionalLight position={[3, 6, 4]} intensity={0.9} color="#dfe9ff" />
      <directionalLight position={[-4, 2, -3]} intensity={0.25} color="#3aa0c8" />

      <PinField
        depthData={depthData}
        confidenceData={confidenceData}
        gridWidth={gridWidth}
        gridHeight={gridHeight}
      />

      <OrbitControls
        ref={controlsRef}
        makeDefault
        enableDamping
        dampingFactor={0.08}
        autoRotate={backgroundMode}
        autoRotateSpeed={0.25}
        enabled={!backgroundMode}
        minDistance={2.5}
        maxDistance={16}
        maxPolarAngle={Math.PI * 0.49}
      />
    </Canvas>
  );
}
