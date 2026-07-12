/**
 * Offline render -> critique -> refine pipeline. For a set of questions:
 * ask the live /api/explain for a plan, and for every drawing step that is a
 * semantic scene graph, run the loop:
 *   validate -> render -> vision-critique -> (refine graph -> re-render ->
 *   re-critique) up to 2 attempts, keeping the last VALID graph on any
 *   failure, and saving every artifact as future training data.
 *
 * The refine step may change ONLY the scene graph — never compiled geometry.
 * Runs against the already-running dev server; rasterizes with Playwright;
 * calls Gemini directly (this is a local script, so reading the key from
 * .env here is fine — the live path will proxy through the server instead).
 */
import { readFileSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { chromium, type Browser } from "playwright";
import { parseSceneGraph, type SceneGraph } from "../src/visual/sceneGraph";
import { compileSceneGraph } from "../src/visual/compiler";
import { renderProgramToSvgString } from "../src/visual/renderSvg";
import type { StrokeProgram } from "../src/visual/strokeProgram";
import { CRITIQUE_SCHEMA, critiqueInstruction, refineInstruction, type Critique } from "../src/critique/critic";

const GEMINI_MODEL = "gemini-flash-lite-latest";
const API = "http://localhost:5173/api/explain";
const OUT_DIR = join(process.cwd(), "training-data");
const MAX_ATTEMPTS = 2;

// Rough gemini-flash-lite pricing (USD per 1M tokens) — estimate only.
const IN_COST = 0.075 / 1e6;
const OUT_COST = 0.3 / 1e6;

function getKey(): string {
  const env = readFileSync(join(process.cwd(), ".env"), "utf8");
  const m = env.match(/^GEMINI_API_KEY=(.+)$/m);
  if (!m) throw new Error("GEMINI_API_KEY not found in .env");
  return m[1].trim();
}

interface GeminiResult {
  text: string;
  latencyMs: number;
  inTokens: number;
  outTokens: number;
}

async function callGemini(
  key: string,
  parts: unknown[],
  schema: unknown | null,
  systemText: string,
): Promise<GeminiResult> {
  const start = Date.now();
  const body: Record<string, unknown> = {
    systemInstruction: { parts: [{ text: systemText }] },
    contents: [{ parts }],
    generationConfig: schema
      ? { responseMimeType: "application/json", responseSchema: schema }
      : { responseMimeType: "application/json" },
  };
  const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-goog-api-key": key },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`Gemini ${res.status}: ${(await res.text()).slice(0, 160)}`);
  const json = (await res.json()) as {
    candidates?: { content?: { parts?: { text?: string }[] } }[];
    usageMetadata?: { promptTokenCount?: number; candidatesTokenCount?: number };
  };
  return {
    text: json.candidates?.[0]?.content?.parts?.[0]?.text ?? "",
    latencyMs: Date.now() - start,
    inTokens: json.usageMetadata?.promptTokenCount ?? 0,
    outTokens: json.usageMetadata?.candidatesTokenCount ?? 0,
  };
}

async function rasterize(browser: Browser, svg: string): Promise<Buffer> {
  const page = await browser.newPage();
  try {
    await page.setContent(`<!doctype html><html><body style="margin:0;display:inline-block">${svg}</body></html>`);
    const el = await page.$("svg");
    if (!el) throw new Error("no svg");
    return await el.screenshot({ type: "png" });
  } finally {
    await page.close();
  }
}

/** Validate + compile a raw scene graph object. Returns null if unusable. */
function validate(raw: unknown): { graph: SceneGraph; program: StrokeProgram } | null {
  const graph = parseSceneGraph(raw);
  if (!graph) return null;
  const program = compileSceneGraph(graph);
  if (!program) return null;
  return { graph, program };
}

async function critique(key: string, png: Buffer, question: string, meaning: string) {
  const parts = [
    { text: critiqueInstruction(question, meaning) },
    { inline_data: { mime_type: "image/png", data: png.toString("base64") } },
  ];
  const r = await callGemini(key, parts, CRITIQUE_SCHEMA, "You are a strict visual-explanation reviewer.");
  const parsed = JSON.parse(r.text) as Critique;
  return { critique: parsed, cost: r };
}

async function refine(key: string, question: string, graph: SceneGraph, revisions: string[]) {
  const parts = [
    {
      text:
        `Student question: ${question}\n\nCurrent scene graph:\n${JSON.stringify(graph)}\n\n` +
        `Reviewer's requested fixes:\n- ${revisions.join("\n- ")}`,
    },
  ];
  const r = await callGemini(key, parts, null, refineInstruction());
  const parsed = JSON.parse(r.text) as unknown;
  return { raw: parsed, cost: r };
}

function slug(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40);
}

async function processGraph(
  browser: Browser,
  key: string,
  question: string,
  meaning: string,
  rawGraph: unknown,
  dir: string,
) {
  mkdirSync(dir, { recursive: true });
  const meta: Record<string, unknown> = { question, meaning, attempts: [] };
  const attemptsLog: unknown[] = [];

  const first = validate(rawGraph);
  if (!first) {
    meta.result = "invalid-initial-graph";
    writeFileSync(join(dir, "original.json"), JSON.stringify(rawGraph, null, 2));
    writeFileSync(join(dir, "meta.json"), JSON.stringify(meta, null, 2));
    return { status: "invalid" as const };
  }
  writeFileSync(join(dir, "original.json"), JSON.stringify(first.graph, null, 2));

  let current = first;
  let currentRaw: unknown = first.graph;
  let lastCritique: Critique | null = null;
  let totalInTok = 0;
  let totalOutTok = 0;
  let totalLatency = 0;

  for (let attempt = 0; attempt <= MAX_ATTEMPTS; attempt++) {
    // Render current valid program.
    const svg = renderProgramToSvgString(current.program);
    const png = await rasterize(browser, svg);
    writeFileSync(join(dir, `render-${attempt}.png`), png);

    // Critique.
    let crit: Critique;
    try {
      const c = await critique(key, png, question, meaning);
      crit = c.critique;
      totalInTok += c.cost.inTokens;
      totalOutTok += c.cost.outTokens;
      totalLatency += c.cost.latencyMs;
      writeFileSync(join(dir, `critique-${attempt}.json`), JSON.stringify(crit, null, 2));
    } catch (e) {
      // Critique failed — keep the last valid graph, stop.
      attemptsLog.push({ attempt, error: `critique failed: ${String(e)}` });
      break;
    }
    lastCritique = crit;
    attemptsLog.push({ attempt, needsRevision: crit.needsRevision, readability: crit.readability, summary: crit.summary });

    if (!crit.needsRevision || attempt === MAX_ATTEMPTS) break;

    // Refine — may change only the scene graph.
    try {
      const rf = await refine(key, question, current.graph, crit.revisions);
      totalInTok += rf.cost.inTokens;
      totalOutTok += rf.cost.outTokens;
      totalLatency += rf.cost.latencyMs;
      const revalidated = validate(rf.raw);
      if (!revalidated) {
        attemptsLog.push({ attempt, error: "refined graph invalid — keeping last valid" });
        break; // keep last valid
      }
      writeFileSync(join(dir, `revised-${attempt + 1}.json`), JSON.stringify(revalidated.graph, null, 2));
      current = revalidated;
      currentRaw = revalidated.graph;
    } catch (e) {
      attemptsLog.push({ attempt, error: `refine failed: ${String(e)} — keeping last valid` });
      break; // keep last valid
    }
  }

  meta.attempts = attemptsLog;
  meta.finalCritique = lastCritique;
  meta.tokens = { in: totalInTok, out: totalOutTok };
  meta.estCostUsd = Number((totalInTok * IN_COST + totalOutTok * OUT_COST).toFixed(6));
  meta.totalLatencyMs = totalLatency;
  meta.finalGraph = currentRaw;
  writeFileSync(join(dir, "meta.json"), JSON.stringify(meta, null, 2));
  return { status: "ok" as const, critique: lastCritique };
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
      let plan: { steps: { kind: string; content: string }[] };
      try {
        const res = await fetch(API, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ prompt: q, model: GEMINI_MODEL }),
        });
        plan = (await res.json()) as typeof plan;
      } catch (e) {
        console.log(`  plan fetch failed: ${String(e)}`);
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
        const r = await processGraph(browser, key, q, `a diagram for: ${q}`, content.sceneGraph, dir);
        if (r.status === "invalid") console.log(`  [${dir}] INVALID initial graph`);
        else
          console.log(
            `  [${dir}] readability=${r.critique?.readability} needsRevision=${r.critique?.needsRevision} — ${r.critique?.summary}`,
          );
      }
      if (!found) console.log("  (no scene-graph drawing steps)");
    }
  } finally {
    await browser.close();
  }
  console.log("\nDone. Artifacts in training-data/.");
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
