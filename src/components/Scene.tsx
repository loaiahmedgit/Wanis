import { useEffect } from "react";
import { Canvas, useThree } from "@react-three/fiber";
import * as THREE from "three";
import { PinField } from "./PinField";
import type { LaidOutStep } from "../field/layout";
import { useFieldStore } from "../state/store";

interface SceneProps {
  steps: LaidOutStep[];
  gridWidth: number;
  gridHeight: number;
  planToken: number;
}

/** Fits an orthographic camera to the board's world-space extents, padding
 * a little so nothing touches the viewport edge, and re-fits on resize. */
function FitCamera({ boardWidth, boardHeight }: { boardWidth: number; boardHeight: number }) {
  const { camera, size } = useThree();
  const ortho = camera as THREE.OrthographicCamera;

  useEffect(() => {
    const padding = 1.18;
    const targetW = boardWidth * padding;
    const targetH = boardHeight * padding;
    const viewportAspect = size.width / size.height;
    const boardAspect = targetW / targetH;

    let halfW: number;
    let halfH: number;
    if (viewportAspect > boardAspect) {
      halfH = targetH / 2;
      halfW = halfH * viewportAspect;
    } else {
      halfW = targetW / 2;
      halfH = halfW / viewportAspect;
    }

    ortho.left = -halfW;
    ortho.right = halfW;
    ortho.top = halfH;
    ortho.bottom = -halfH;
    ortho.near = 0.1;
    ortho.far = 20;
    ortho.position.set(0, 0, 6);
    ortho.lookAt(0, 0, 0);
    ortho.updateProjectionMatrix();
  }, [boardWidth, boardHeight, size, ortho]);

  return null;
}

export function Scene({ steps, gridWidth, gridHeight, planToken }: SceneProps) {
  const spacing = useFieldStore((s) => s.spacing);
  const boardWidth = gridWidth * spacing;
  const boardHeight = gridHeight * spacing;

  return (
    <Canvas
      orthographic
      camera={{ position: [0, 0, 6] }}
      gl={{ antialias: true }}
      dpr={[1, Math.min(window.devicePixelRatio, 2)]}
    >
      <color attach="background" args={["#05070a"]} />

      <ambientLight intensity={0.35} />
      <directionalLight position={[0, 0, 8]} intensity={0.7} color="#dfe9ff" />

      <FitCamera boardWidth={boardWidth} boardHeight={boardHeight} />
      <PinField steps={steps} gridWidth={gridWidth} gridHeight={gridHeight} planToken={planToken} />
    </Canvas>
  );
}
