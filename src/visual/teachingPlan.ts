/**
 * Layer 1 — the teaching plan. Describes WHY each visual moment exists.
 * Produced by the planner LLM; consumed for narration sync and to decide
 * which scene-graph objects get focus/highlight during each beat.
 */
export interface TeachingBeat {
  beat: number;
  /** What the learner should understand after this moment. */
  learningGoal: string;
  /** The sentence spoken/written while this beat plays. */
  narration: string;
  /** Scene-graph object ids to focus (highlight/zoom) during this beat. */
  focus: string[];
}

export interface TeachingPlan {
  question: string;
  beats: TeachingBeat[];
}
