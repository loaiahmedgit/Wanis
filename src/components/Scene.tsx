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

const FOV_DEGREES = 32;

/** Positions a perspective camera to fit the board, slightly elevated so
 * pin height (which extrudes toward the camera) is actually visible as
 * relief/shading rather than invisible behind its own silhouette — a
 * perfectly face-on orthographic view down the same axis pins rise along
 * would hide height entirely, showing only a flat grid of colored dots. */
function FitCamera({ boardWidth, boardHeight }: { boardWidth: number; boardHeight: number }) {
  const { camera, size } = useThree();
  const persp = camera as THREE.PerspectiveCamera;

  useEffect(() => {
    const padding = 1.25;
    const fovY = (FOV_DEGREES * Math.PI) / 180;
    const aspect = size.width / size.height;

    const halfBoardH = (boardHeight * padding) / 2;
    const halfBoardW = (boardWidth * padding) / 2;

    const distForHeight = halfBoardH / Math.tan(fovY / 2);
    const distForWidth = halfBoardW / (Math.tan(fovY / 2) * aspect);
    const distance = Math.max(distForHeight, distForWidth);

    persp.fov = FOV_DEGREES;
    persp.aspect = aspect;
    persp.near = 0.1;
    persp.far = distance * 3;
    // A gentle elevation + downward tilt: enough to reveal pin height via
    // parallax and shading, subtle enough that text doesn't skew unreadable.
    persp.position.set(0, distance * 0.22, distance * 0.97);
    persp.lookAt(0, 0, 0);
    persp.updateProjectionMatrix();
  }, [boardWidth, boardHeight, size, persp]);

  return null;
}

export function Scene({ steps, gridWidth, gridHeight, planToken }: SceneProps) {
  const spacing = useFieldStore((s) => s.spacing);
  const boardWidth = gridWidth * spacing;
  const boardHeight = gridHeight * spacing;

  return (
    <Canvas
      camera={{ fov: FOV_DEGREES, position: [0, 2, 8] }}
      gl={{ antialias: true }}
      dpr={[1, Math.min(window.devicePixelRatio, 2)]}
    >
      <color attach="background" args={["#05070a"]} />

      <ambientLight intensity={0.3} />
      <directionalLight position={[0, 3, 6]} intensity={0.85} color="#dfe9ff" />
      <directionalLight position={[-3, -1, 4]} intensity={0.2} color="#3aa0c8" />

      <FitCamera boardWidth={boardWidth} boardHeight={boardHeight} />
      <PinField steps={steps} gridWidth={gridWidth} gridHeight={gridHeight} planToken={planToken} />
    </Canvas>
  );
}
