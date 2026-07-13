/**
 * Shared node-only helpers for the critique pipeline and the critic benchmark:
 * key loading, per-model Gemini calls, real-UI rendering, and validation.
 * (Node/Playwright only — kept out of src/ which is browser code.)
 */
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { createHash } from "node:crypto";
import { chromium, type Browser } from "playwright";
import { parseSceneGraph, type SceneGraph } from "../src/visual/sceneGraph";
import { compileSceneGraph } from "../src/visual/compiler";
import type { StrokeProgram } from "../src/visual/strokeProgram";

/**
 * Bump when the critic prompts/schemas/logic change — invalidates all cached
 * critiques so a stale critic verdict is never reused after the critic itself
 * changed. Keep in sync with meaningful edits to src/critique/critic.ts.
 */
export const CRITIC_VERSION = "2-split-v1";

export const APP = "http://localhost:5173";
export const PLANNER_MODEL = "gemini-flash-lite-latest";
export const VISUAL_CRITIC_MODEL = "gemini-flash-lite-latest";
export const SEMANTIC_CRITIC_MODEL = "gemini-flash-latest"; // stronger — reasons over the JSON, not pixels
export const ESCALATION_MODEL = "gemini-flash-latest"; // reserved for disagreement; slot a Pro model here later

export const VIEWPORTS = [
  { name: "desktop", width: 1100, height: 900 },
  { name: "mobile", width: 390, height: 844 },
];

// Rough per-1M-token pricing (estimate only; flash-latest costs more than lite).
const COST_BY_MODEL: Record<string, { in: number; out: number }> = {
  "gemini-flash-lite-latest": { in: 0.075 / 1e6, out: 0.3 / 1e6 },
  "gemini-flash-latest": { in: 0.3 / 1e6, out: 1.2 / 1e6 },
};

export function getKey(): string {
  const env = readFileSync(join(process.cwd(), ".env"), "utf8");
  const m = env.match(/^GEMINI_API_KEY=(.+)$/m);
  if (!m) throw new Error("GEMINI_API_KEY not found in .env");
  return m[1].trim();
}

export interface Cost {
  latencyMs: number;
  inTokens: number;
  outTokens: number;
  usd: number;
}

export function emptyCost(): Cost {
  return { latencyMs: 0, inTokens: 0, outTokens: 0, usd: 0 };
}
export function addCost(a: Cost, b: Cost): Cost {
  return {
    latencyMs: a.latencyMs + b.latencyMs,
    inTokens: a.inTokens + b.inTokens,
    outTokens: a.outTokens + b.outTokens,
    usd: a.usd + b.usd,
  };
}

export async function callGemini(model: string, key: string, parts: unknown[], schema: unknown | null, systemText: string) {
  const start = Date.now();
  const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
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
  if (!res.ok) {
    const status = res.status;
    const err = new Error(`Gemini ${status}: ${(await res.text()).slice(0, 160)}`);
    (err as { httpStatus?: number }).httpStatus = status;
    throw err;
  }
  const json = (await res.json()) as {
    candidates?: { content?: { parts?: { text?: string }[] } }[];
    usageMetadata?: { promptTokenCount?: number; candidatesTokenCount?: number };
  };
  const price = COST_BY_MODEL[model] ?? COST_BY_MODEL["gemini-flash-lite-latest"];
  const inTokens = json.usageMetadata?.promptTokenCount ?? 0;
  const outTokens = json.usageMetadata?.candidatesTokenCount ?? 0;
  const cost: Cost = {
    latencyMs: Date.now() - start,
    inTokens,
    outTokens,
    usd: inTokens * price.in + outTokens * price.out,
  };
  return { text: json.candidates?.[0]?.content?.parts?.[0]?.text ?? "", cost };
}

export function isQuota(e: unknown): boolean {
  return httpStatusOf(e) === 429;
}

/** The HTTP status attached to a callGemini error, or null. */
export function httpStatusOf(e: unknown): number | null {
  const s = e && typeof e === "object" ? (e as { httpStatus?: number }).httpStatus : undefined;
  return typeof s === "number" ? s : null;
}

export function encodeGraph(graph: SceneGraph): string {
  return Buffer.from(JSON.stringify(graph)).toString("base64");
}

/** Render the real UI for a graph at every viewport; returns PNGs + render latency. */
export async function renderReal(
  browser: Browser,
  graph: SceneGraph,
): Promise<{ renders: Record<string, Buffer>; latencyMs: number }> {
  const url = `${APP}/?rendergraph=${encodeURIComponent(encodeGraph(graph))}`;
  const out: Record<string, Buffer> = {};
  const start = Date.now();
  for (const vp of VIEWPORTS) {
    const page = await browser.newPage({ viewport: { width: vp.width, height: vp.height } });
    try {
      await page.goto(url, { waitUntil: "networkidle", timeout: 15000 });
      const el = await page.waitForSelector('[data-render-target="1"]', { timeout: 8000 });
      await page.evaluate(() => (document as Document).fonts.ready);
      out[vp.name] = await el.screenshot({ type: "png" });
    } finally {
      await page.close();
    }
  }
  return { renders: out, latencyMs: Date.now() - start };
}

export function validate(raw: unknown): { graph: SceneGraph; program: StrokeProgram } | null {
  const graph = parseSceneGraph(raw);
  if (!graph) return null;
  const program = compileSceneGraph(graph);
  if (!program) return null;
  return { graph, program };
}

// ---------- Resumable critic cache ----------
// Keyed by CRITIC_VERSION + model + a hash of the exact input the critic saw
// (the graph JSON for semantic; the rendered PNG bytes for visual). A cached
// critique is reused verbatim, so an already-passed case never re-spends quota.

const CACHE_PATH = join(process.cwd(), "critic-cache.json");
type Cache = Record<string, unknown>;

export function sha(...parts: (string | Buffer)[]): string {
  const h = createHash("sha256");
  for (const p of parts) h.update(p);
  return h.digest("hex").slice(0, 24);
}

export function cacheKey(model: string, inputHash: string): string {
  return `${CRITIC_VERSION}|${model}|${inputHash}`;
}

export function loadCache(): Cache {
  if (!existsSync(CACHE_PATH)) return {};
  try {
    return JSON.parse(readFileSync(CACHE_PATH, "utf8")) as Cache;
  } catch {
    return {};
  }
}

export function saveCache(cache: Cache): void {
  writeFileSync(CACHE_PATH, JSON.stringify(cache, null, 2));
}

/** Hash of the visual input (all viewport PNGs, in stable name order). */
export function visualInputHash(renders: Record<string, Buffer>): string {
  const parts: (string | Buffer)[] = [];
  for (const name of Object.keys(renders).sort()) {
    parts.push(name, renders[name]);
  }
  return sha(...parts);
}

/** Hash of the semantic input (question + canonical graph JSON). */
export function semanticInputHash(question: string, graph: SceneGraph): string {
  return sha(question, JSON.stringify(graph));
}

export { chromium };
