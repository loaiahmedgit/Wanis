export type ExplanationStepKind = "title" | "text" | "equation" | "drawing";

export interface ExplanationStep {
  id: string;
  kind: ExplanationStepKind;
  /** The literal text to render on the board for this step. */
  content: string;
}

export interface ExplanationPlan {
  prompt: string;
  steps: ExplanationStep[];
  /** True when the real AI call failed and this is the hardcoded fallback plan. */
  isFallback?: boolean;
  /** Why the fallback was used, if it was — shown to the user, not hidden. */
  fallbackReason?: string;
}
