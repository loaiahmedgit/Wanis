import { create } from "zustand";

interface FieldStore {
  gridWidth: number;
  gridHeight: number;
  spacing: number;
  depthScale: number;
  springStiffness: number;
  damping: number;
  animationSpeed: number;
  /** How strongly low-confidence (edge/uncertain) pins jitter before settling. */
  instabilityAmount: number;
  /** Seconds it takes the field to go from "just formed, everything noisy" to fully settled. */
  settleDuration: number;

  /** Ambient background usage (dim, pulled back) vs. full inspectable view. */
  backgroundMode: boolean;

  /** Bumped to trigger a camera reset; Scene watches this and calls controls.reset(). */
  cameraResetToken: number;
  /** Bumped to trigger a replay (flatten -> reform); PinField watches this. */
  replayToken: number;

  setDepthScale: (v: number) => void;
  setSpringStiffness: (v: number) => void;
  setDamping: (v: number) => void;
  setSpacing: (v: number) => void;
  setAnimationSpeed: (v: number) => void;
  setInstabilityAmount: (v: number) => void;
  setSettleDuration: (v: number) => void;
  toggleBackgroundMode: () => void;
  requestCameraReset: () => void;
  requestReplay: () => void;
}

export const useFieldStore = create<FieldStore>((set) => ({
  gridWidth: 128,
  gridHeight: 128,
  spacing: 0.058,
  depthScale: 3.2,
  springStiffness: 90,
  damping: 12,
  animationSpeed: 1,
  instabilityAmount: 0.35,
  settleDuration: 3.5,

  backgroundMode: true,

  cameraResetToken: 0,
  replayToken: 0,

  setDepthScale: (v) => set({ depthScale: v }),
  setSpringStiffness: (v) => set({ springStiffness: v }),
  setDamping: (v) => set({ damping: v }),
  setSpacing: (v) => set({ spacing: v }),
  setAnimationSpeed: (v) => set({ animationSpeed: v }),
  setInstabilityAmount: (v) => set({ instabilityAmount: v }),
  setSettleDuration: (v) => set({ settleDuration: v }),
  toggleBackgroundMode: () => set((s) => ({ backgroundMode: !s.backgroundMode })),
  requestCameraReset: () => set((s) => ({ cameraResetToken: s.cameraResetToken + 1 })),
  requestReplay: () => set((s) => ({ replayToken: s.replayToken + 1 })),
}));
