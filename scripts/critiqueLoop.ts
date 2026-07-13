/**
 * Render -> (visual + semantic critique) -> refine pipeline. For each question:
 * ask the live /api/explain for a plan, and for every scene-graph drawing step:
 *   validate -> render (real UI, desktop+mobile) -> visual critic (images) +
 *   semantic critic (question + JSON) -> if not BOTH approved, refine the GRAPH
 *   ONLY -> re-validate -> re-render -> re-critique, up to 2 refinement attempts.
 *
 * Two independent critics (see src/critique/critic.ts): the visual one judges
 * layout from pixels, the semantic one judges meaning from the JSON (so it
 * never guesses arrow direction). Approval is derived in code and requires
 * BOTH. Terminal states:
 *   approved | exhausted_needs_revision | critic_disagreement |
 *   unreviewed_after_failure | invalid
 * Only `approved` is trainingReady. A 429 is always unreviewed_after_failure,
 * never a negative quality result.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { Browser } from "playwright";
import type { SceneGraph } from "../src/visual/sceneGraph";
import type { StrokeProgram } from "../src/visual/strokeProgram";
import {
  VISUAL_SCHEMA,
  SEMANTIC_SCHEMA,
  visualCritiqueInstruction,
  semanticCritiqueInstruction,
  parseVisualCritique,
  parseSemanticCritique,
  isVisualApproved,
  isSemanticApproved,
  combinedVerdict,
  deriveTerminalState,
  failureDimensions,
  isTrainingReady,
  refineInstruction,
  type VisualCritique,
  type SemanticCritique,
  type TerminalState,
} from "../src/critique/critic";
import {
  APP,
  PLANNER_MODEL,
  VISUAL_CRITIC_MODEL,
  SEMANTIC_CRITIC_MODEL,
  SEMANTIC_FALLBACK_MODEL,
  getKey,
  callGemini,
  callSemanticResilient,
  isFallbackCertified,
  renderReal,
  validate,
  httpStatusOf,
  emptyCost,
  addCost,
  chromium,
  type Cost,
  type SemanticPrimaryFailure,
} from "./pipelineLib";

interface FailureInfo {
  stage: "render" | "visual" | "semantic" | "refine";
  model: string | null;
  httpStatus: number | null;
  message: string;
}

const OUT_DIR = join(process.cwd(), "training-data");
const MAX_ATTEMPTS = 2;

async function visualCritique(key: string, renders: Record<string, Buffer>) {
  const parts: unknown[] = [{ text: visualCritiqueInstruction() }];
  for (const [name, buf] of Object.entries(renders)) {
    parts.push({ text: `[${name} viewport]` });
    parts.push({ inline_data: { mime_type: "image/png", data: buf.toString("base64") } });
  }
  const r = await callGemini(VISUAL_CRITIC_MODEL, key, parts, VISUAL_SCHEMA, "You are a strict visual layout reviewer.");
  const c = parseVisualCritique(JSON.parse(r.text));
  if (!c) throw new Error("visual critique not an object");
  return { critique: c, cost: r.cost };
}

async function semanticCritique(key: string, question: string, graph: SceneGraph) {
  const r = await callSemanticResilient(
    key,
    [{ text: semanticCritiqueInstruction(question, JSON.stringify(graph, null, 1)) }],
    SEMANTIC_SCHEMA,
    "You are a strict scientific/pedagogical reviewer.",
  );
  const c = parseSemanticCritique(JSON.parse(r.text));
  if (!c) throw new Error("semantic critique not an object");
  return { critique: c, cost: r.cost, modelUsed: r.modelUsed, fallbackUsed: r.fallbackUsed, primaryFailure: r.primaryFailure };
}

async function refine(key: string, question: string, graph: SceneGraph, revisions: string[]) {
  const r = await callGemini(
    PLANNER_MODEL,
    key,
    [
      {
        text:
          `Student question: ${question}\n\nCurrent scene graph:\n${JSON.stringify(graph)}\n\n` +
          `Reviewers' requested fixes:\n- ${revisions.join("\n- ")}`,
      },
    ],
    null,
    refineInstruction(),
  );
  return { raw: JSON.parse(r.text) as unknown, cost: r.cost };
}

const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40);

interface AttemptRecord {
  attempt: number;
  graph: SceneGraph;
  renders: string[];
  visual: VisualCritique | null;
  semantic: SemanticCritique | null;
  visualApproved: boolean;
  semanticApproved: boolean;
  verdict: "approved" | "rejected" | null;
  // Semantic-critic provenance (infrastructure resilience): which model actually
  // produced this attempt's semantic verdict, whether it was the 503 fallback,
  // and the primary's failure that triggered it.
  semanticModel: string | null;
  semanticFallbackUsed: boolean;
  semanticPrimaryFailure: SemanticPrimaryFailure | null;
  failure?: FailureInfo;
}

/** Deterministic quality rank of a fully-reviewed attempt. Higher is better. */
function rankAttempt(a: AttemptRecord): number {
  if (!a.visual || !a.semantic) return -1;
  const v = a.visual;
  const s = a.semantic;
  return (
    (a.verdict === "approved" ? 10000 : 0) +
    (s.correct ? 1000 : 0) +
    (s.complete ? 500 : 0) +
    (s.transitionOrderCorrect ? 500 : 0) +
    (!v.clipping ? 200 : 0) +
    (!v.collisions ? 200 : 0) +
    s.educationalValue * 10 +
    v.legibility +
    v.composition
  );
}

async function processGraph(
  browser: Browser,
  key: string,
  question: string,
  rawGraph: unknown,
  dir: string,
  planLatencyMs: number,
) {
  mkdirSync(dir, { recursive: true });
  const wallStart = Date.now();
  const attempts: AttemptRecord[] = [];
  let apiCost: Cost = emptyCost();
  let renderLatencyMs = 0;

  const first = validate(rawGraph);
  if (!first) {
    writeFileSync(
      join(dir, "meta.json"),
      JSON.stringify({ question, terminalState: "invalid" as TerminalState, trainingReady: false, rawGraph }, null, 2),
    );
    return { terminalState: "invalid" as TerminalState };
  }

  let current = first;
  let terminalState: TerminalState = "unreviewed_after_failure";

  for (let attempt = 0; attempt <= MAX_ATTEMPTS; attempt++) {
    const rec: AttemptRecord = {
      attempt,
      graph: current.graph,
      renders: [],
      visual: null,
      semantic: null,
      visualApproved: false,
      semanticApproved: false,
      verdict: null,
      semanticModel: null,
      semanticFallbackUsed: false,
      semanticPrimaryFailure: null,
    };
    writeFileSync(join(dir, `graph-${attempt}.json`), JSON.stringify(current.graph, null, 2));

    // Render real UI at each viewport.
    let renders: Record<string, Buffer>;
    try {
      const r = await renderReal(browser, current.graph);
      renders = r.renders;
      renderLatencyMs += r.latencyMs;
      for (const [name, buf] of Object.entries(renders)) {
        const f = `render-${attempt}-${name}.png`;
        writeFileSync(join(dir, f), buf);
        rec.renders.push(f);
      }
    } catch (e) {
      rec.failure = { stage: "render", model: null, httpStatus: httpStatusOf(e), message: String(e).slice(0, 120) };
      attempts.push(rec);
      terminalState = deriveTerminalState({ failed: true, visualApproved: false, semanticApproved: false });
      break;
    }

    // Both critics. A failure (e.g. 429) in EITHER is unreviewed, never a negative.
    try {
      const vis = await visualCritique(key, renders);
      apiCost = addCost(apiCost, vis.cost);
      rec.visual = vis.critique;
      rec.visualApproved = isVisualApproved(vis.critique);
      writeFileSync(join(dir, `visual-${attempt}.json`), JSON.stringify(vis.critique, null, 2));
    } catch (e) {
      rec.failure = { stage: "visual", model: VISUAL_CRITIC_MODEL, httpStatus: httpStatusOf(e), message: String(e).slice(0, 120) };
      attempts.push(rec);
      terminalState = deriveTerminalState({ failed: true, visualApproved: false, semanticApproved: false });
      break;
    }
    try {
      const sem = await semanticCritique(key, question, current.graph);
      apiCost = addCost(apiCost, sem.cost);
      rec.semantic = sem.critique;
      rec.semanticApproved = isSemanticApproved(sem.critique);
      rec.semanticModel = sem.modelUsed;
      rec.semanticFallbackUsed = sem.fallbackUsed;
      rec.semanticPrimaryFailure = sem.primaryFailure;
      writeFileSync(join(dir, `semantic-${attempt}.json`), JSON.stringify(sem.critique, null, 2));
    } catch (e) {
      // Reached only when the primary 503'd twice AND the fallback also failed,
      // or a non-503 error occurred — a genuine infrastructure failure.
      rec.failure = { stage: "semantic", model: SEMANTIC_CRITIC_MODEL, httpStatus: httpStatusOf(e), message: String(e).slice(0, 120) };
      attempts.push(rec);
      terminalState = deriveTerminalState({ failed: true, visualApproved: false, semanticApproved: false });
      break;
    }

    rec.verdict = combinedVerdict(rec.visual, rec.semantic);
    attempts.push(rec);

    const isLast = attempt === MAX_ATTEMPTS;
    terminalState = deriveTerminalState({
      failed: false,
      visualApproved: rec.visualApproved,
      semanticApproved: rec.semanticApproved,
    });
    if (rec.verdict === "approved" || isLast) break;

    // Refine using both critics' revision requests.
    const revisions = [...(rec.visual.revisions ?? []), ...(rec.semantic.revisions ?? [])];
    try {
      const rf = await refine(key, question, current.graph, revisions);
      apiCost = addCost(apiCost, rf.cost);
      const revalidated = validate(rf.raw);
      if (!revalidated) {
        // Couldn't produce a better graph — this rejected attempt stands.
        terminalState = deriveTerminalState({
          failed: false,
          visualApproved: rec.visualApproved,
          semanticApproved: rec.semanticApproved,
        });
        break;
      }
      current = revalidated;
    } catch (e) {
      rec.failure = { stage: "refine", model: PLANNER_MODEL, httpStatus: httpStatusOf(e), message: String(e).slice(0, 120) };
      terminalState = deriveTerminalState({ failed: true, visualApproved: false, semanticApproved: false });
      break;
    }
  }

  const reviewed = attempts.filter((a) => a.verdict);
  const lastAttempt = attempts[attempts.length - 1] ?? null;
  const bestAttempt = reviewed.length
    ? reviewed.reduce((best, a) => (rankAttempt(a) > rankAttempt(best) ? a : best))
    : null;

  const asRef = (a: AttemptRecord | null) =>
    a
      ? {
          attempt: a.attempt,
          graph: a.graph,
          visual: a.visual,
          semantic: a.semantic,
          verdict: a.verdict,
          semanticModel: a.semanticModel,
          semanticFallbackUsed: a.semanticFallbackUsed,
        }
      : null;

  const failure = attempts.map((a) => a.failure).find((f) => f) ?? null;
  // Which independent dimension(s) the best-reviewed attempt failed on — so an
  // exhausted result is legible as "rejected for [semantic]" vs "[visual]",
  // not lumped together or mislabeled a disagreement.
  const failureDims =
    bestAttempt && bestAttempt.visual && bestAttempt.semantic
      ? failureDimensions(bestAttempt.visual, bestAttempt.semantic)
      : [];
  // A fallback verdict may be trainingReady ONLY after the fallback model has
  // passed the semantic golden cases (certified). If the best attempt's semantic
  // verdict came from the uncertified fallback, withhold training-readiness even
  // when the terminal state is approved.
  const bestUsedFallback = !!bestAttempt?.semanticFallbackUsed;
  const fallbackCertified = isFallbackCertified(SEMANTIC_FALLBACK_MODEL);
  const trainingReady = isTrainingReady(terminalState) && (!bestUsedFallback || fallbackCertified);
  const meta = {
    question,
    terminalState,
    trainingReady,
    // Infrastructure-resilience provenance for the decisive (best) attempt.
    semanticModel: bestAttempt?.semanticModel ?? null,
    semanticFallbackUsed: bestUsedFallback,
    fallbackCertified,
    semanticPrimaryFailure: bestAttempt?.semanticPrimaryFailure ?? null,
    failureDimensions: failureDims,
    // Persist which stage failed, its model, and the raw HTTP status, so a
    // quota (429) is never confused with a quality result during analysis.
    failure,
    lastAttempt: asRef(lastAttempt),
    bestAttempt: asRef(bestAttempt),
    attempts: attempts.map((a) => ({
      attempt: a.attempt,
      graph: a.graph,
      renders: a.renders,
      verdict: a.verdict,
      visualApproved: a.visualApproved,
      semanticApproved: a.semanticApproved,
      visual: a.visual,
      semantic: a.semantic,
      semanticModel: a.semanticModel,
      semanticFallbackUsed: a.semanticFallbackUsed,
      semanticPrimaryFailure: a.semanticPrimaryFailure,
      failure: a.failure,
    })),
    tokens: { in: apiCost.inTokens, out: apiCost.outTokens },
    estCostUsd: Number(apiCost.usd.toFixed(6)),
    latencyMs: { plan: planLatencyMs, criticApi: apiCost.latencyMs, render: renderLatencyMs, wallClock: Date.now() - wallStart },
  };
  writeFileSync(join(dir, "original.json"), JSON.stringify(first.graph, null, 2));
  writeFileSync(join(dir, "meta.json"), JSON.stringify(meta, null, 2));
  return { terminalState, best: bestAttempt, failureDimensions: failureDims, semanticFallbackUsed: bestUsedFallback };
}

async function run() {
  const key = getKey();
  const questions = process.argv.slice(2);
  if (!questions.length) {
    console.error("usage: critiqueLoop <question> [question...]");
    process.exit(1);
  }
  mkdirSync(OUT_DIR, { recursive: true });
  const browser = await chromium.launch();
  try {
    for (const q of questions) {
      console.log(`\n=== ${q} ===`);
      let plan: { steps?: { kind: string; content: string }[] };
      let planLatencyMs = 0;
      try {
        const planStart = Date.now();
        const res = await fetch(`${APP}/api/explain`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ prompt: q, model: PLANNER_MODEL }),
        });
        planLatencyMs = Date.now() - planStart;
        if (!res.ok) {
          const body = await res.text().catch(() => "");
          const dir = join(OUT_DIR, `${slug(q)}-planner-failed`);
          mkdirSync(dir, { recursive: true });
          writeFileSync(
            join(dir, "meta.json"),
            JSON.stringify({ question: q, terminalState: "planner_failed", httpStatus: res.status, body: body.slice(0, 400) }, null, 2),
          );
          console.log(`  planner_failed: HTTP ${res.status}`);
          continue;
        }
        plan = (await res.json()) as typeof plan;
      } catch (e) {
        console.log(`  planner_failed (fetch error): ${String(e)}`);
        continue;
      }
      let idx = 0;
      let found = 0;
      for (const step of plan.steps ?? []) {
        if (step.kind !== "drawing") continue;
        let content: { sceneGraph?: unknown };
        try {
          content = JSON.parse(step.content);
        } catch {
          continue;
        }
        if (!content.sceneGraph) continue;
        found++;
        const dir = join(OUT_DIR, `${slug(q)}-${idx++}`);
        const r = await processGraph(browser, key, q, content.sceneGraph, dir, planLatencyMs);
        const b = r.best;
        console.log(
          `  [${dir.split(/[\\/]/).pop()}] ${r.terminalState}` +
            (b ? ` (vis=${b.visualApproved ? "ok" : "x"} sem=${b.semanticApproved ? "ok" : "x"})` : "") +
            (r.failureDimensions.length ? ` failed=[${r.failureDimensions.join(",")}]` : "") +
            (r.semanticFallbackUsed ? ` [semantic-fallback:${SEMANTIC_FALLBACK_MODEL}]` : ""),
        );
      }
      if (!found) console.log("  (no scene-graph drawing steps)");
    }
  } finally {
    await browser.close();
  }
  console.log("\nDone. Only terminalState=approved artifacts are training-ready.");
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
