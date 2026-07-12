import { create } from "zustand";

interface FieldStore {
  gridWidth: number;
  gridHeight: number;
  spacing: number;
  riseHeight: number;
  springStiffness: number;
  damping: number;
  animationSpeed: number;
  /** Seconds between each explanation step being revealed. */
  stepIntervalSeconds: number;
  /** How long a newly-activating pin flickers before resolving to its real height. */
  flickerSeconds: number;

  /** Bumped whenever a new plan starts drawing from scratch. */
  planToken: number;

  setSpacing: (v: number) => void;
  setRiseHeight: (v: number) => void;
  setSpringStiffness: (v: number) => void;
  setDamping: (v: number) => void;
  setAnimationSpeed: (v: number) => void;
  setStepIntervalSeconds: (v: number) => void;
  setFlickerSeconds: (v: number) => void;
  requestNewPlan: () => void;
}

export const useFieldStore = create<FieldStore>((set) => ({
  gridWidth: 220,
  gridHeight: 130,
  spacing: 0.05,
  riseHeight: 0.9,
  springStiffness: 140,
  damping: 14,
  animationSpeed: 1,
  stepIntervalSeconds: 1.4,
  flickerSeconds: 0.35,

  planToken: 0,

  setSpacing: (v) => set({ spacing: v }),
  setRiseHeight: (v) => set({ riseHeight: v }),
  setSpringStiffness: (v) => set({ springStiffness: v }),
  setDamping: (v) => set({ damping: v }),
  setAnimationSpeed: (v) => set({ animationSpeed: v }),
  setStepIntervalSeconds: (v) => set({ stepIntervalSeconds: v }),
  setFlickerSeconds: (v) => set({ flickerSeconds: v }),
  requestNewPlan: () => set((s) => ({ planToken: s.planToken + 1 })),
}));
