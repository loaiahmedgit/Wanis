import type { ExplanationPlan, ExplanationStep, ExplanationStepKind } from "./types";
import { EXAMPLE_PLANS, findExamplePlan } from "./examples";

const VALID_KINDS: ExplanationStepKind[] = ["title", "text", "equation"];

interface ApiResponse {
  prompt: string;
  steps: { kind: string; content: string }[];
  error?: string;
}

/**
 * Calls the real AI (Gemini, via the /api/explain dev-server route in
 * vite.config.ts — the API key stays server-side, never reaches the
 * browser). Falls back to the hardcoded examples if the call fails for any
 * reason (no key configured, network error, malformed response), so the
 * board always has something to draw rather than breaking outright.
 */
export async function getExplanationPlan(prompt: string): Promise<ExplanationPlan> {
  try {
    const res = await fetch("/api/explain", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ prompt }),
    });

    if (!res.ok) throw new Error(`explain API returned ${res.status}`);

    const data = (await res.json()) as ApiResponse;
    if (!Array.isArray(data.steps) || data.steps.length === 0) {
      throw new Error("explain API returned no steps");
    }

    const steps: ExplanationStep[] = data.steps.map((s, i) => ({
      id: `ai-${i}`,
      kind: VALID_KINDS.includes(s.kind as ExplanationStepKind) ? (s.kind as ExplanationStepKind) : "text",
      content: s.content,
    }));

    return { prompt, steps };
  } catch (err) {
    console.warn(
      `Perception Field: real explanation call failed (${String(err)}). Falling back to a hardcoded example.`,
    );
    return findExamplePlan(prompt) ?? EXAMPLE_PLANS[0];
  }
}
