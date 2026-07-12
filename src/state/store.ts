import { create } from "zustand";

interface FieldStore {
  gridWidth: number;
  gridHeight: number;
  spacing: number;
  depthScale: number;
  springStiffness: number;
  damping: number;
  animationSpeed: number;

  /** Bumped to trigger a camera reset; Scene watches this and calls controls.reset(). */
  cameraResetToken: number;
  /** Bumped to trigger a replay (flatten -> reform); PinField watches this. */
  replayToken: number;

  setDepthScale: (v: number) => void;
  setSpringStiffness: (v: number) => void;
  setDamping: (v: number) => void;
  setSpacing: (v: number) => void;
  setAnimationSpeed: (v: number) => void;
  requestCameraReset: () => void;
  requestReplay: () => void;
}

export const useFieldStore = create<FieldStore>((set) => ({
  gridWidth: 64,
  gridHeight: 64,
  spacing: 0.12,
  depthScale: 3.2,
  springStiffness: 90,
  damping: 12,
  animationSpeed: 1,

  cameraResetToken: 0,
  replayToken: 0,

  setDepthScale: (v) => set({ depthScale: v }),
  setSpringStiffness: (v) => set({ springStiffness: v }),
  setDamping: (v) => set({ damping: v }),
  setSpacing: (v) => set({ spacing: v }),
  setAnimationSpeed: (v) => set({ animationSpeed: v }),
  requestCameraReset: () => set((s) => ({ cameraResetToken: s.cameraResetToken + 1 })),
  requestReplay: () => set((s) => ({ replayToken: s.replayToken + 1 })),
}));
