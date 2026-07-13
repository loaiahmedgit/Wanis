/**
 * Layer above the single-scene plan: a multi-section LESSON BOARD. The model
 * declares ordered semantic sections and their role/content only — never any
 * position, size, camera, or timing. The compiler (boardLayout) and the runtime
 * (LessonBoard) own all geometry and choreography.
 *
 * This is purely additive: a plan is a lesson board ONLY when it carries a
 * `sections` array; every existing single-scene `{ steps }` plan is untouched.
 */
import { parseSceneGraph } from "../visual/sceneGraph";
import { compileSceneGraph } from "../visual/compiler";
import type { StrokeProgram } from "../visual/strokeProgram";

export type SectionRole = "heading" | "explanation" | "equation" | "sceneGraph" | "callout";
export type ReadingDirection = "ltr" | "rtl";

export interface LessonSection {
  id: string;
  role: SectionRole;
  /** Text content for heading/explanation/equation/callout (may contain "\n"). */
  text?: string;
  /** Compiled diagram for a sceneGraph section. */
  program?: StrokeProgram;
  /** A callout may point at another section it comments on. */
  target?: string;
}

export interface LessonBoardSpec {
  title?: string;
  /** Reading semantics (shelf flow direction) — NOT geometry. */
  readingDirection: ReadingDirection;
  sections: LessonSection[];
}

const isStr = (v: unknown): v is string => typeof v === "string" && v.trim().length > 0;
const ROLES = new Set<SectionRole>(["heading", "explanation", "equation", "sceneGraph", "callout"]);

/** Arabic (and Arabic Supplement) code points — enough to default RTL safely. */
const ARABIC = /[؀-ۿݐ-ݿࢠ-ࣿ]/;

function contentText(content: Record<string, unknown>, role: SectionRole): string | undefined {
  // Accept content.{text|equation} or a flattened top-level text/equation.
  const t = content.text ?? content.equation ?? content.value;
  return isStr(t) ? t.slice(0, role === "explanation" ? 220 : 80) : undefined;
}

/**
 * Parse a raw lesson board. Same null-on-unusable contract as the other
 * parsers: drop malformed sections, and return null (so the caller falls back
 * to the single-scene path) if fewer than 2 usable sections remain.
 */
export function parseLessonBoard(raw: unknown): LessonBoardSpec | null {
  if (!raw || typeof raw !== "object") return null;
  const data = raw as Record<string, unknown>;
  if (!Array.isArray(data.sections)) return null;

  const sections: LessonSection[] = [];
  const ids = new Set<string>();
  for (const s of data.sections.slice(0, 6)) {
    const so = s as Record<string, unknown>;
    if (!so || !isStr(so.id) || ids.has(so.id) || !isStr(so.type ?? so.role)) continue;
    const role = (so.role ?? so.type) as SectionRole;
    if (!ROLES.has(role)) continue;
    const id = so.id.slice(0, 32);

    // `content` may be a structured object OR a plain string. For a sceneGraph a
    // string is stringified JSON (same convention as a "drawing" step); for text
    // roles the string is the text itself.
    const rawContent = so.content;
    const asObj = (rawContent && typeof rawContent === "object" ? rawContent : so) as Record<string, unknown>;
    let graphRaw: unknown;
    let text: string | undefined;
    if (typeof rawContent === "string") {
      if (role === "sceneGraph") {
        try {
          graphRaw = JSON.parse(rawContent);
        } catch {
          graphRaw = undefined;
        }
      } else {
        text = rawContent.slice(0, role === "explanation" ? 220 : 80);
      }
    } else if (role === "sceneGraph") {
      graphRaw = asObj.sceneGraph ?? asObj.graph;
    } else {
      text = contentText(asObj, role);
    }

    if (role === "sceneGraph") {
      const g = (graphRaw as { sceneGraph?: unknown })?.sceneGraph ?? graphRaw;
      const graph = parseSceneGraph(g);
      if (!graph) continue;
      const program = compileSceneGraph(graph);
      if (!program) continue;
      sections.push({ id, role: "sceneGraph", program });
    } else {
      if (!text) continue;
      const section: LessonSection = { id, role, text };
      const target = asObj.target ?? so.target;
      if (role === "callout" && isStr(target)) section.target = target.slice(0, 32);
      sections.push(section);
    }
    ids.add(id);
  }

  // A board needs at least 2 sections; otherwise it is really a single scene.
  if (sections.length < 2) return null;

  // A callout target must reference a real section; drop a dangling target
  // (keep the callout as a plain highlight).
  for (const s of sections) if (s.target && !ids.has(s.target)) delete s.target;

  const title = isStr(data.title) ? data.title.slice(0, 60) : undefined;
  const explicitDir = data.readingDirection === "rtl" || data.readingDirection === "ltr" ? data.readingDirection : null;
  // Default safely from the lesson's own language: Arabic text anywhere in the
  // title or sections reads right-to-left.
  const anyText = (title ?? "") + " " + sections.map((s) => s.text ?? "").join(" ");
  const readingDirection: ReadingDirection = explicitDir ?? (ARABIC.test(anyText) ? "rtl" : "ltr");

  return { title, readingDirection, sections };
}
