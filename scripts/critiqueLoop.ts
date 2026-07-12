/**
 * Render -> critique -> refine pipeline. For each question: ask the live
 * /api/explain for a plan, and for every drawing step that is a semantic
 * scene graph, run the loop:
 *   validate -> render (the REAL UI, at desktop + mobile) -> vision-critique
 *   -> if not approved, refine the GRAPH ONLY -> re-validate -> re-render ->
 *   re-critique, up to 2 refinement attempts.
 *
 * Approval is derived in code (correct && !clipping && !collisions &&
 * readability >= 4), never from the model's self-report. Every attempt's
 * graph + critique + renders are tracked together so they can't be
 * mismatched, and the run ends in an explicit terminal state:
 *   approved | exhausted_needs_revision | unreviewed_after_failure | invalid
 * Only `approved` examples are marked training-ready.
 */
import { readFileSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { chromium, type Browser } from "playwright";
import { parseSceneGraph, type SceneGraph } from "../src/visual/sceneGraph";
import { compileSceneGraph } from "../src/visual/compiler";
import type { StrokeProgram } from "../src/visual/strokeProgram";
import {
  CRITIQUE_SCHEMA,
  critiqueInstruction,
  refineInstruction,
  parseCritique,
  isApproved,
  type Critique,
  type TerminalState,
} from "../src/critique/critic";

const GEMINI_MODEL = "gemini-flash-lite-latest";
const APP = "http://localhost:5173";
const OUT_DIR = join(process.cwd(), "training-data");
const MAX_ATTEMPTS = 2;

const VIEWPORTS = [
  { name: "desktop", width: 1100, height: 900 },
  { name: "mobile", width: 390, height: 844 },
];

const IN_COST = 0.075 / 1e6;
const OUT_COST = 0.3 / 1e6;

function getKey(): string {
  const env = readFileSync(join(process.cwd(), ".env"), "utf8");
  const m = env.match(/^GEMINI_API_KEY=(.+)$/m);
  if (!m) throw new Error("GEMINI_API_KEY not found in .env");
  return m[1].trim();
}

interface Cost {
  latencyMs: number;
  inTokens: number;
  outTokens: number;
}

async function callGemini(key: string, parts: unknown[], schema: unknown | null, systemText: string) {
  const start = Date.now();
  const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-goog-api-key": key },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: systemText }] },
      contents: [{ parts }],
      generationConfig: schema
        ? { responseMimeType: "application/json", responseSchema: schema }
        : { responseMimeType: "application/json" },
    }),
  });
  if (!res.ok) throw new Error(`Gemini ${res.status}: ${(await res.text()).slice(0, 160)}`);
  const json = (await res.json()) as {
    candidates?: { content?: { parts?: { text?: string }[] } }[];
    usageMetadata?: { promptTokenCount?: number; candidatesTokenCount?: number };
  };
  const cost: Cost = {
    latencyMs: Date.now() - start,
    inTokens: json.usageMetadata?.promptTokenCount ?? 0,
    outTokens: json.usageMetadata?.candidatesTokenCount ?? 0,
  };
  return { text: json.candidates?.[0]?.content?.parts?.[0]?.text ?? "", cost };
}

function encodeGraph(graph: SceneGraph): string {
  return Buffer.from(JSON.stringify(graph)).toString("base64");
}

/** Render the real UI for a graph at every viewport; returns PNGs + render latency. */
async function renderReal(browser: Browser, graph: SceneGraph): Promise<{ renders: Record<string, Buffer>; latencyMs: number }> {
  const url = `${APP}/?rendergraph=${encodeURIComponent(encodeGraph(graph))}`;
  const out: Record<string, Buffer> = {};
  const start = Date.now();
  for (const vp of VIEWPORTS) {
    const page = await browser.newPage({ viewport: { width: vp.width, height: vp.height } });
    try {
      await page.goto(url, { waitUntil: "networkidle", timeout: 15000 });
      const el = await page.waitForSelector('[data-render-target="1"]', { timeout: 8000 });
      await page.evaluate(() => (document as Document).fonts.ready); // wait for real fonts, not a fixed guess
      out[vp.name] = await el.screenshot({ type: "png" });
    } finally {
      await page.close();
    }
  }
  return { renders: out, latencyMs: Date.now() - start };
}

function validate(raw: unknown): { graph: SceneGraph; program: StrokeProgram } | null {
  const graph = parseSceneGraph(raw);
  if (!graph) return null;
  const program = compileSceneGraph(graph);
  if (!program) return null;
  return { graph, program };
}

async function critique(key: string, renders: Record<string, Buffer>, question: string, meaning: string) {
  // Send every viewport image so the critic can catch responsive clipping.
  const parts: unknown[] = [{ text: critiqueInstruction(question, meaning) }];
  for (const [name, buf] of Object.entries(renders)) {
    parts.push({ text: `[${name} viewport]` });
    parts.push({ inline_data: { mime_type: "image/png", data: buf.toString("base64") } });
  }
  const r = await callGemini(key, parts, CRITIQUE_SCHEMA, "You are a strict visual-explanation reviewer.");
  const c = parseCritique(JSON.parse(r.text));
  if (!c) throw new Error("critique response not an object");
  return { critique: c, cost: r.cost };
}

async function refine(key: string, question: string, graph: SceneGraph, revisions: string[]) {
  const r = await callGemini(
    key,
    [
      {
        text:
          `Student question: ${question}\n\nCurrent scene graph:\n${JSON.stringify(graph)}\n\n` +
          `Reviewer's requested fixes:\n- ${revisions.join("\n- ")}`,
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
  critique: Critique | null;
  approved: boolean;
  error?: string;
}

/** Deterministic quality rank of a critiqued attempt: correctness first, then
 *  clipping/collisions, then readability. Higher is better. */
function rankAttempt(a: AttemptRecord): number {
  const c = a.critique;
  if (!c) return -1;
  return (c.correct ? 1000 : 0) + (!c.clipping ? 200 : 0) + (!c.collisions ? 200 : 0) + c.readability;
}

async function processGraph(
  browser: Browser,
  key: string,
  question: string,
  meaning: string,
  rawGraph: unknown,
  dir: string,
  planLatencyMs: number,
) {
  mkdirSync(dir, { recursive: true });
  const wallStart = Date.now();
  const attempts: AttemptRecord[] = [];
  let apiCost: Cost = { latencyMs: 0, inTokens: 0, outTokens: 0 };
  let renderLatencyMs = 0;
  const addCost = (c: Cost) => {
    apiCost = {
      latencyMs: apiCost.latencyMs + c.latencyMs,
      inTokens: apiCost.inTokens + c.inTokens,
      outTokens: apiCost.outTokens + c.outTokens,
    };
  };

  const first = validate(rawGraph);
  if (!first) {
    const meta = { question, meaning, terminalState: "invalid" as TerminalState, trainingReady: false, rawGraph };
    writeFileSync(join(dir, "meta.json"), JSON.stringify(meta, null, 2));
    return { terminalState: "invalid" as TerminalState };
  }

  let current = first;
  let terminalState: TerminalState = "unreviewed_after_failure";

  for (let attempt = 0; attempt <= MAX_ATTEMPTS; attempt++) {
    const rec: AttemptRecord = { attempt, graph: current.graph, renders: [], critique: null, approved: false };
    // Persist THIS attempt's graph alongside its renders + critique — the
    // intermediate graphs are the most valuable training pairs.
    writeFileSync(join(dir, `graph-${attempt}.json`), JSON.stringify(current.graph, null, 2));

    // Render the real UI at each viewport.
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
      rec.error = `render failed: ${String(e)}`;
      attempts.push(rec);
      terminalState = "unreviewed_after_failure";
      break;
    }

    // Critique (paired with THIS attempt's graph + renders).
    let crit: Critique;
    try {
      const c = await critique(key, renders, question, meaning);
      crit = c.critique;
      addCost(c.cost);
      rec.critique = crit;
      rec.approved = isApproved(crit);
      writeFileSync(join(dir, `critique-${attempt}.json`), JSON.stringify(crit, null, 2));
    } catch (e) {
      rec.error = `critique failed: ${String(e)}`;
      attempts.push(rec);
      terminalState = "unreviewed_after_failure";
      break;
    }
    attempts.push(rec);

    if (rec.approved) {
      terminalState = "approved";
      break;
    }
    if (attempt === MAX_ATTEMPTS) {
      terminalState = "exhausted_needs_revision";
      break;
    }

    // Refine the graph only.
    try {
      const rf = await refine(key, question, current.graph, crit.revisions);
      addCost(rf.cost);
      const revalidated = validate(rf.raw);
      if (!revalidated) {
        terminalState = "exhausted_needs_revision"; // last good graph stands; couldn't improve
        break;
      }
      current = revalidated;
    } catch {
      terminalState = "unreviewed_after_failure";
      break;
    }
  }

  // Two distinct picks, both preserved:
  // - lastAttempt: the final graph the loop ended on (per-spec "keep last").
  // - bestAttempt: the highest-ranked REVIEWED attempt — because refinement
  //   can degrade quality, "last" is not always "best" for training/serving.
  const reviewed = attempts.filter((a) => a.critique);
  const lastAttempt = attempts[attempts.length - 1] ?? null;
  const bestAttempt = reviewed.length
    ? reviewed.reduce((best, a) => (rankAttempt(a) > rankAttempt(best) ? a : best))
    : null;

  const asRef = (a: AttemptRecord | null) =>
    a ? { attempt: a.attempt, graph: a.graph, critique: a.critique, approved: a.approved } : null;

  const meta = {
    question,
    meaning,
    terminalState,
    trainingReady: terminalState === "approved",
    lastAttempt: asRef(lastAttempt),
    bestAttempt: asRef(bestAttempt),
    attempts: attempts.map((a) => ({
      attempt: a.attempt,
      graph: a.graph,
      renders: a.renders,
      approved: a.approved,
      critique: a.critique,
      error: a.error,
    })),
    tokens: { in: apiCost.inTokens, out: apiCost.outTokens },
    estCostUsd: Number((apiCost.inTokens * IN_COST + apiCost.outTokens * OUT_COST).toFixed(6)),
    latencyMs: {
      plan: planLatencyMs,
      criticApi: apiCost.latencyMs,
      render: renderLatencyMs,
      wallClock: Date.now() - wallStart,
    },
  };
  writeFileSync(join(dir, "original.json"), JSON.stringify(first.graph, null, 2));
  writeFileSync(join(dir, "meta.json"), JSON.stringify(meta, null, 2));
  return { terminalState, critique: (bestAttempt ?? lastAttempt)?.critique ?? null };
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
          body: JSON.stringify({ prompt: q, model: GEMINI_MODEL }),
        });
        planLatencyMs = Date.now() - planStart;
        // A non-ok planner response (e.g. a Gemini 429 surfaced as 502) is a
        // planner failure — record it distinctly, never count it as a routing
        // result ("no scene-graph") which would poison the dataset's signal.
        if (!res.ok) {
          const body = await res.text().catch(() => "");
          const dir = join(OUT_DIR, `${slug(q)}-planner-failed`);
          mkdirSync(dir, { recursive: true });
          writeFileSync(
            join(dir, "meta.json"),
            JSON.stringify(
              { question: q, terminalState: "planner_failed", httpStatus: res.status, body: body.slice(0, 400), planLatencyMs },
              null,
              2,
            ),
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
        const r = await processGraph(browser, key, q, `a diagram for: ${q}`, content.sceneGraph, dir, planLatencyMs);
        console.log(
          `  [${dir.split(/[\\/]/).pop()}] ${r.terminalState}` +
            (r.critique ? ` (readability=${r.critique.readability})` : ""),
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
