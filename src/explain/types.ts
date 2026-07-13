export type ExplanationStepKind = "title" | "text" | "equation" | "drawing";

export interface ExplanationStep {
  id: string;
  kind: ExplanationStepKind;
  /** The literal text to render on the board for this step. */
  content: string;
}

import type { LessonBoardSpec } from "./lessonBoard";

export interface ExplanationPlan {
  prompt: string;
  steps: ExplanationStep[];
  /** Present when the plan is a multi-section lesson board (additive; steps stays empty). */
  board?: LessonBoardSpec;
  /** True when the real AI call failed and this is the hardcoded fallback plan. */
  isFallback?: boolean;
  /** Why the fallback was used, if it was — shown to the user, not hidden. */
  fallbackReason?: string;
}
