import type { ExplanationPlan } from "./types";
import { EXAMPLE_PLANS, findExamplePlan } from "./examples";

/**
 * The seam where real AI reasoning plugs in later. Today this matches the
 * prompt against a couple of hardcoded plans (or falls back to the first
 * one) so the pin-drawing mechanism can be built and judged on its own —
 * swapping this body for a real LLM call (which reads the prompt, reasons
 * about it, and returns the same ExplanationPlan shape) should not require
 * touching anything in field/ or components/.
 */
export async function getExplanationPlan(prompt: string): Promise<ExplanationPlan> {
  const matched = findExamplePlan(prompt);
  if (matched) return matched;

  // Unknown prompt: fall back to the first example rather than fail, since
  // there's no real reasoning behind this yet.
  return EXAMPLE_PLANS[0];
}
