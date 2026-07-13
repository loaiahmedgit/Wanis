/**
 * Two independent critics for the render -> critique -> refine loop.
 *
 * The single vision critic was unreliable: it tried to judge scientific
 * correctness AND arrow direction from pixels, and demonstrably hallucinated
 * a "backward" flow on a flawless water cycle. The fix is to split the job
 * along the line of what each input can actually answer:
 *
 *  - VISUAL critic  — sees the rendered images (desktop + mobile). Judges ONLY
 *    what pixels can show: clipping, collisions, legibility, composition,
 *    responsive fit. It must NOT judge scientific correctness or infer arrow
 *    direction (direction isn't reliably readable from a curved arrow).
 *  - SEMANTIC critic — sees the QUESTION + the actual sceneGraph JSON (ordered
 *    cycle members, labeled transitions, all relationships). Judges
 *    correctness, completeness, transition order, educational meaning.
 *    Direction is explicit in the JSON, so it never guesses from pixels.
 *
 * Approval is derived IN CODE and requires BOTH to pass. Disagreement (exactly
 * one approves) is surfaced as needs_human_review, never silently trained on.
 */

// ---------- Visual critic ----------

export interface VisualCritique {
  clipping: boolean;
  collisions: boolean;
  legibility: number; // 1-5
  composition: number; // 1-5
  responsiveFit: boolean; // renders acceptably at both viewports
  summary: string;
  revisions: string[];
}

export const VISUAL_SCHEMA = {
  type: "OBJECT",
  properties: {
    clipping: { type: "BOOLEAN" },
    collisions: { type: "BOOLEAN" },
    legibility: { type: "INTEGER" },
    composition: { type: "INTEGER" },
    responsiveFit: { type: "BOOLEAN" },
    summary: { type: "STRING" },
    revisions: { type: "ARRAY", items: { type: "STRING" } },
  },
  required: ["clipping", "collisions", "legibility", "composition", "responsiveFit", "summary", "revisions"],
};

export function visualCritiqueInstruction(): string {
  return `You are a strict VISUAL layout reviewer for a diagram drawn by an AI tutor. You are shown the same \
diagram rendered at two viewport sizes (a desktop image and a mobile image).

Judge ONLY what the pixels show about layout and legibility. Do NOT judge whether the content is
scientifically correct, and do NOT try to infer the direction of any arrow — that is someone else's job and
is not reliably readable from a curved line. Report:
- clipping: is anything cut off by the edges of the frame, in EITHER image?
- collisions: do any shapes, boxes, or text labels overlap or sit on top of each other?
- legibility: 1-5 — is every label crisp and readable (at both sizes)?
- composition: 1-5 — is the layout balanced, well-spaced, and uncluttered?
- responsiveFit: does the diagram fit and stay readable at BOTH the desktop and mobile sizes?
- summary: one short sentence on the visual quality.
- revisions: a SHORT list of specific layout fixes if needed (e.g. "the 'Sun' label overlaps an arrow —
  move it clear", "two boxes overlap — space them apart"), else an empty list.
Be honest but not pedantic — tiny aesthetic nitpicks are not worth a revision.`;
}

export function parseVisualCritique(raw: unknown): VisualCritique | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  const bool = (v: unknown, d: boolean) => (typeof v === "boolean" ? v : d);
  const score = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? Math.min(5, Math.max(1, Math.round(v))) : 1);
  return {
    // Default to the pessimistic side so a malformed response never approves.
    clipping: bool(o.clipping, true),
    collisions: bool(o.collisions, true),
    legibility: score(o.legibility),
    composition: score(o.composition),
    responsiveFit: bool(o.responsiveFit, false),
    summary: typeof o.summary === "string" ? o.summary.slice(0, 300) : "",
    revisions: Array.isArray(o.revisions)
      ? o.revisions.filter((r): r is string => typeof r === "string" && r.trim().length > 0).slice(0, 8)
      : [],
  };
}

export function isVisualApproved(v: VisualCritique): boolean {
  return !v.clipping && !v.collisions && v.legibility >= 4 && v.composition >= 3 && v.responsiveFit;
}

// ---------- Semantic critic ----------

export interface SemanticCritique {
  correct: boolean;
  complete: boolean;
  transitionOrderCorrect: boolean;
  educationalValue: number; // 1-5
  summary: string;
  revisions: string[];
}

export const SEMANTIC_SCHEMA = {
  type: "OBJECT",
  properties: {
    correct: { type: "BOOLEAN" },
    complete: { type: "BOOLEAN" },
    transitionOrderCorrect: { type: "BOOLEAN" },
    educationalValue: { type: "INTEGER" },
    summary: { type: "STRING" },
    revisions: { type: "ARRAY", items: { type: "STRING" } },
  },
  required: ["correct", "complete", "transitionOrderCorrect", "educationalValue", "summary", "revisions"],
};

export function semanticCritiqueInstruction(question: string, graphJson: string): string {
  return `You are a strict SCIENTIFIC/PEDAGOGICAL reviewer of a diagram's MEANING. You do NOT see the picture — \
you are given the student's question and the exact structured description of the diagram (its JSON), which
fully encodes every object, label, relationship, ordered cycle members, direction, and labeled transitions.
Judge from the STRUCTURE, never guess at pixels.

Student question: "${question}"

Diagram structure (authoritative — trust it exactly):
${graphJson}

Note on cycles: a "cycle" object lists its members IN ORDER and a direction; the arrows flow member[0] ->
member[1] -> ... -> last -> member[0]. The direction is EXPLICIT here, so evaluate the ordering from this
list, do not assume it is wrong. "transitions" name the arrow between two consecutive members.

Report:
- correct: is the content scientifically/factually right for the question (right entities, right
  relationships, right flow order)?
- complete: does it include the essential stages/parts a student needs, or is a key step missing?
- transitionOrderCorrect: is the ordering of steps/cycle members and their transition labels in the right
  sequence? (For a cycle, check the member order encodes the real-world order.)
- educationalValue: 1-5 — how well would this actually teach the concept?
- summary: one short sentence.
- revisions: SHORT, specific content fixes if needed (e.g. "the cycle order is reversed — it should go
  Evaporation -> Condensation -> Precipitation -> Collection", "add the 'decomposition' step"), else empty.
Be rigorous about correctness and completeness; don't approve a reversed or missing-step diagram.`;
}

export function parseSemanticCritique(raw: unknown): SemanticCritique | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  const bool = (v: unknown, d: boolean) => (typeof v === "boolean" ? v : d);
  const score = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? Math.min(5, Math.max(1, Math.round(v))) : 1);
  return {
    correct: bool(o.correct, false),
    complete: bool(o.complete, false),
    transitionOrderCorrect: bool(o.transitionOrderCorrect, false),
    educationalValue: score(o.educationalValue),
    summary: typeof o.summary === "string" ? o.summary.slice(0, 300) : "",
    revisions: Array.isArray(o.revisions)
      ? o.revisions.filter((r): r is string => typeof r === "string" && r.trim().length > 0).slice(0, 8)
      : [],
  };
}

export function isSemanticApproved(s: SemanticCritique): boolean {
  return s.correct && s.complete && s.transitionOrderCorrect && s.educationalValue >= 3;
}

// ---------- Combined verdict + terminal state ----------

export type TerminalState =
  | "approved"
  | "exhausted_needs_revision"
  | "critic_disagreement"
  | "unreviewed_after_failure"
  | "invalid";

/**
 * The per-attempt verdict is BINARY: approved iff BOTH critics pass, else
 * rejected. (So "semantic fail + visual pass" and "semantic pass + visual
 * fail" are both `rejected` here — they drive a refine.) Disagreement is a
 * TERMINAL concern, not a per-attempt verdict — see deriveTerminalState.
 */
export function combinedVerdict(v: VisualCritique, s: SemanticCritique): "approved" | "rejected" {
  return isVisualApproved(v) && isSemanticApproved(s) ? "approved" : "rejected";
}

export type FailureDimension = "visual" | "semantic";

/**
 * Which independent DIMENSIONS a diagram failed on. The two critics judge
 * orthogonal axes, so a failing one is a dimension-specific rejection — NOT a
 * disagreement. [] = both pass.
 */
export function failureDimensions(v: VisualCritique, s: SemanticCritique): FailureDimension[] {
  const dims: FailureDimension[] = [];
  if (!isVisualApproved(v)) dims.push("visual");
  if (!isSemanticApproved(s)) dims.push("semantic");
  return dims;
}

/**
 * Pure terminal-state classifier (unit-tested, no I/O):
 *  - a render/critique failure (e.g. 429)   -> unreviewed_after_failure
 *  - both critics approved                  -> approved
 *  - anything else once exhausted           -> exhausted_needs_revision
 *    (whether one or both critics failed — the failing DIMENSION is recorded
 *     separately via failureDimensions; a rejection on an independent axis is
 *     NOT a disagreement).
 *
 * critic_disagreement is RESERVED for a genuine same-dimension contradiction
 * (e.g. a primary semantic critic vs an escalation semantic critic disagreeing
 * about the SAME axis) — signalled explicitly via sameDimensionContradiction.
 * It is never produced by two orthogonal critics splitting.
 */
export function deriveTerminalState(p: {
  failed: boolean;
  visualApproved: boolean;
  semanticApproved: boolean;
  sameDimensionContradiction?: boolean;
}): TerminalState {
  if (p.failed) return "unreviewed_after_failure";
  if (p.visualApproved && p.semanticApproved) return "approved";
  if (p.sameDimensionContradiction) return "critic_disagreement";
  return "exhausted_needs_revision";
}

/** trainingReady is true ONLY for an approved terminal state. */
export function isTrainingReady(t: TerminalState): boolean {
  return t === "approved";
}

// ---------- Refiner ----------

export function refineInstruction(): string {
  return `You revise a semantic scene graph based on reviewers' critiques of how it rendered and what it means. \
You may change ONLY the scene graph — its objects, labels, cycle members/order/transitions, and constraints.
You must NOT invent coordinates, pixel sizes, colors, timing, or raw path strokes; a deterministic engine
computes all of that from your objects and relations.

You will be given the student's question, the current scene graph JSON, and specific revision requests from
a visual reviewer (layout) and/or a semantic reviewer (content). Apply them:
- Layout fixes (overlaps, clipping, congestion): SIMPLIFY FIRST. Before adding constraints or geometry,
  remove nonessential nodes and branch arrows — a secondary process is usually better as a transition/arrow
  label than its own node. Prefer 3-5 placeable nodes and at most two non-backbone branch arrows; a cluttered
  diagram is fixed by having less in it, not by spacing more out. Only after simplifying should you re-space
  what remains.
- Content fixes (wrong order, missing step): reorder cycle members, fix/add transition labels, add/rename
  objects. For a reversed cycle, put the members back in the correct real-world order. Add only what
  correctness genuinely requires — do not pad the diagram with extra detail the question didn't ask for.
- Keep it minimal (prefer 3-5, never exceed ~8 objects) and keep every reference id valid.
Respond with ONLY the JSON scene graph object ({"objects":[...],"constraints":[...]}) — no prose, no fences.`;
}
