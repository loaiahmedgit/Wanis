/**
 * Types + prompts for the render -> critique -> refine loop. The critic is a
 * vision model that looks at the RENDERED scene and judges it; the refiner is
 * a text model that may change ONLY the semantic scene graph (never the
 * compiled coordinates, timing, colors, or strokes — those belong to the
 * deterministic compiler). Shared so both an offline runner and a future
 * live path use identical contracts.
 */

export interface Critique {
  /** Is the diagram conceptually correct for the topic? */
  correct: boolean;
  /** Is anything cut off at the edges of the frame? */
  clipping: boolean;
  /** Do any shapes or labels overlap / collide? */
  collisions: boolean;
  /** How readable/clear is it, 1 (unreadable) to 5 (excellent)? */
  readability: number;
  /** One short sentence summarizing the overall assessment. */
  summary: string;
  /** Specific, actionable fixes phrased as scene-graph edits. Empty if none. */
  revisions: string[];
  /** True if the diagram should be revised before showing it. */
  needsRevision: boolean;
}

/**
 * Runtime-validate + clamp a raw critique response. The Gemini schema makes
 * the shape likely but not guaranteed; a bare `as Critique` cast gives zero
 * runtime protection. Returns a safe, fully-populated Critique (never throws
 * on a merely-malformed response — coerces/defaults instead), or null only
 * if the input isn't an object at all.
 */
export function parseCritique(raw: unknown): Critique | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  const bool = (v: unknown, dflt: boolean) => (typeof v === "boolean" ? v : dflt);
  const readabilityNum = typeof o.readability === "number" && Number.isFinite(o.readability) ? o.readability : 1;
  const revisions = Array.isArray(o.revisions)
    ? o.revisions.filter((r): r is string => typeof r === "string" && r.trim().length > 0).slice(0, 8)
    : [];
  return {
    // Default the health flags to the pessimistic side so a malformed
    // response is never mistaken for an approval.
    correct: bool(o.correct, false),
    clipping: bool(o.clipping, true),
    collisions: bool(o.collisions, true),
    readability: Math.min(5, Math.max(1, Math.round(readabilityNum))),
    summary: typeof o.summary === "string" ? o.summary.slice(0, 300) : "",
    revisions,
    needsRevision: bool(o.needsRevision, true),
  };
}

export type TerminalState = "approved" | "exhausted_needs_revision" | "unreviewed_after_failure" | "invalid";

/**
 * Approval is derived IN CODE from the objective critique fields, not from
 * the model's self-reported `needsRevision` boolean (which models are
 * unreliable about). Only approved graphs are training-ready.
 */
export function isApproved(c: Critique): boolean {
  return c.correct && !c.clipping && !c.collisions && c.readability >= 4;
}

/** Gemini structured-output schema for the critique (responseSchema). */
export const CRITIQUE_SCHEMA = {
  type: "OBJECT",
  properties: {
    correct: { type: "BOOLEAN" },
    clipping: { type: "BOOLEAN" },
    collisions: { type: "BOOLEAN" },
    readability: { type: "INTEGER" },
    summary: { type: "STRING" },
    revisions: { type: "ARRAY", items: { type: "STRING" } },
    needsRevision: { type: "BOOLEAN" },
  },
  required: ["correct", "clipping", "collisions", "readability", "summary", "revisions", "needsRevision"],
};

export function critiqueInstruction(question: string, meaning: string): string {
  return `You are a strict visual-explanation reviewer. The image is a diagram drawn by an AI tutor to \
help a student who asked: "${question}". The diagram is meant to show: "${meaning}".

Judge ONLY what you can see in the image. Report:
- correct: does the diagram correctly represent the concept (right parts, right relationships)?
- clipping: is anything cut off by the edges of the frame?
- collisions: do any shapes or text labels overlap or sit on top of each other?
- readability: 1-5 — is every label legible and is the layout clear and uncluttered?
- summary: one short sentence on the overall quality.
- revisions: if it needs fixing, a SHORT list of specific changes, each phrased as an instruction about the
  diagram's content (e.g. "move the 'Sun' label so it doesn't overlap the arrow", "the hypotenuse label is
  missing", "the two boxes overlap — space them apart"). Empty list if the diagram is already good.
- needsRevision: true only if the diagram has a real problem a student would notice (wrong content,
  clipping, overlaps, or unreadable labels). A diagram that is correct and clear needs NO revision.

Be honest but not pedantic — minor aesthetic nitpicks are not worth a revision.`;
}

export function refineInstruction(): string {
  return `You revise a semantic scene graph based on a reviewer's critique of how it rendered. You may change \
ONLY the scene graph — its objects, labels, and constraints. You must NOT invent coordinates, sizes in
pixels, colors, timing, or raw path strokes; a deterministic engine computes all of that from your objects
and relations (exactly as in the original graph).

You will be given: the student's question, the current scene graph JSON, and the reviewer's specific
revision requests. Return a corrected scene graph in the EXACT same format as the input
({"objects":[...],"constraints":[...]}), applying the requested fixes:
- To stop overlaps, add or change constraints (rightOf/leftOf/above/below/alignedX/alignedY) to space
  objects out, or remove a redundant label.
- To fix wrong/missing content, add/rename/remove objects.
- Keep it simple (3-8 objects). Keep every reference id valid.
Respond with ONLY the JSON scene graph object — no prose, no markdown fences.`;
}
