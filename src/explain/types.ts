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
}
