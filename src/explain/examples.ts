import type { ExplanationPlan } from "./types";

/**
 * Hardcoded explanation plans, standing in for what a real LLM call will
 * eventually produce. The point of this first slice is to prove the
 * pin-drawing mechanism against real content — see getExplanationPlan.ts
 * for where this gets swapped for a real model later.
 */
export const EXAMPLE_PLANS: ExplanationPlan[] = [
  {
    prompt: "explain 2x+7, how is it solved",
    steps: [
      { id: "s1", kind: "title", content: "Solve for x" },
      { id: "s2", kind: "equation", content: "2x + 7 = 15" },
      { id: "s3", kind: "text", content: "Step 1 — subtract 7 from both sides" },
      { id: "s4", kind: "equation", content: "2x = 8" },
      { id: "s5", kind: "text", content: "Step 2 — divide both sides by 2" },
      { id: "s6", kind: "equation", content: "x = 4" },
    ],
  },
  {
    prompt: "explain photosynthesis",
    steps: [
      { id: "s1", kind: "title", content: "How plants make energy" },
      { id: "s2", kind: "text", content: "Sunlight hits the leaf" },
      { id: "s3", kind: "text", content: "Water and CO2 are combined" },
      { id: "s4", kind: "equation", content: "6CO2 + 6H2O -> C6H12O6 + 6O2" },
      { id: "s5", kind: "text", content: "The plant stores sugar, releases oxygen" },
    ],
  },
];

export const DEFAULT_PROMPT = EXAMPLE_PLANS[0].prompt;

export function findExamplePlan(prompt: string): ExplanationPlan | null {
  const normalized = prompt.trim().toLowerCase();
  if (!normalized) return null;

  if (/2x\s*\+?\s*7|solve for x|2x\+7/.test(normalized)) return EXAMPLE_PLANS[0];
  if (/photosynthes/.test(normalized)) return EXAMPLE_PLANS[1];
  return null;
}
