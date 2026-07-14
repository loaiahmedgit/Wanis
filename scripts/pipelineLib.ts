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
import { regionViewBox } from "../src/visual/focusCamera";
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
// Pinned semantic fallback for INFRASTRUCTURE resilience only (503 overloads on
// the primary). NOT an escalation model and never used for a quality decision
// on its own — a fallback verdict is only trainingReady once this model has
// passed the semantic golden cases (see certifyFallback / isFallbackCertified).
// The 2.5 family is 404 "not available to new users" on this key, so we pin the
// only available, distinct, non-lite semantic-capable model; the cert gate keeps
// the substitution safe.
export const SEMANTIC_FALLBACK_MODEL = "gemini-3-flash-preview";
export const SEMANTIC_503_BACKOFF_MS = 1500;

export const VIEWPORTS = [
  { name: "desktop", width: 1100, height: 900 },
  { name: "mobile", width: 390, height: 844 },
];

// Rough per-1M-token pricing (estimate only; flash-latest costs more than lite).
const COST_BY_MODEL: Record<string, { in: number; out: number }> = {
  "gemini-flash-lite-latest": { in: 0.075 / 1e6, out: 0.3 / 1e6 },
  "gemini-flash-latest": { in: 0.3 / 1e6, out: 1.2 / 1e6 },
  "gemini-3-flash-preview": { in: 0.3 / 1e6, out: 2.5 / 1e6 },
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

export const CALL_TIMEOUT_MS = 120000;

export async function callGemini(
  model: string,
  key: string,
  parts: unknown[],
  schema: unknown | null,
  systemText: string,
  timeoutMs: number = CALL_TIMEOUT_MS,
) {
  const start = Date.now();
  // Hard timeout so a slow/hanging generation (some thinking models stall for
  // minutes on structured output) fails cleanly instead of blocking the run.
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), timeoutMs);
  let res: Response;
  try {
    res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-goog-api-key": key },
      signal: ac.signal,
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: systemText }] },
        contents: [{ parts }],
        generationConfig: schema
          ? { responseMimeType: "application/json", responseSchema: schema }
          : { responseMimeType: "application/json" },
      }),
    });
  } catch (e) {
    // AbortError (our timeout) or a network error. Tag a timeout explicitly so
    // the resilient wrapper can treat a hang as transient primary-unavailability
    // (same class as a 503), distinct from an arbitrary network error.
    const timedOut = (e as Error)?.name === "AbortError";
    const err = new Error(`Gemini call to ${model} failed: ${timedOut ? `timeout after ${timeoutMs}ms` : String(e)}`);
    if (timedOut) (err as { timedOut?: boolean }).timedOut = true;
    throw err;
  } finally {
    clearTimeout(timer);
  }
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

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/** True if a callGemini error was our own request timeout (a primary hang). */
export function isTimeout(e: unknown): boolean {
  return !!(e && typeof e === "object" && (e as { timedOut?: boolean }).timedOut);
}

// The overloaded primary sometimes returns a clean 503 and sometimes just hangs;
// both mean "primary transiently unavailable". A short primary timeout detects a
// hang fast; the fallback model is a slow thinker, so it gets a longer budget.
export const SEMANTIC_PRIMARY_TIMEOUT_MS = 35000;
export const SEMANTIC_FALLBACK_TIMEOUT_MS = 120000;

export interface SemanticPrimaryFailure {
  model: string;
  httpStatus: number | null; // 503, or null for a timeout/hang
  reason: "503" | "timeout";
  message: string;
}
export interface SemanticCallResult {
  text: string;
  cost: Cost;
  modelUsed: string;
  fallbackUsed: boolean;
  /** The primary's 503 that triggered the fallback, if any. */
  primaryFailure: SemanticPrimaryFailure | null;
}

/**
 * Semantic critic call with INFRASTRUCTURE-ONLY resilience. The overloaded
 * primary manifests two ways — a clean 503, or an unresponsive hang — and both
 * mean "primary transiently unavailable", NOT a verdict. Handling:
 *   - 503: back off briefly and retry the primary ONCE (it may just be a blip);
 *     if it 503s or hangs again, fall back to the pinned SEMANTIC_FALLBACK_MODEL.
 *   - timeout/hang: a stalled primary won't recover in a second, so skip the
 *     retry and go straight to the fallback.
 * Everything else is passed through untouched: a normal 200 (including a
 * semantic REJECTION) is returned as-is and never retried, and any non-transient
 * error (e.g. a 429 quota) is rethrown so the caller records it as unreviewed.
 * This never reinterprets a semantic rejection as a failure.
 */
export async function callSemanticResilient(
  key: string,
  parts: unknown[],
  schema: unknown | null,
  systemText: string,
): Promise<SemanticCallResult> {
  const callPrimary = () => callGemini(SEMANTIC_CRITIC_MODEL, key, parts, schema, systemText, SEMANTIC_PRIMARY_TIMEOUT_MS);
  const callFallback = () => callGemini(SEMANTIC_FALLBACK_MODEL, key, parts, schema, systemText, SEMANTIC_FALLBACK_TIMEOUT_MS);
  const isTransient = (e: unknown) => httpStatusOf(e) === 503 || isTimeout(e);
  const describe = (e: unknown): SemanticPrimaryFailure => ({
    model: SEMANTIC_CRITIC_MODEL,
    httpStatus: httpStatusOf(e),
    reason: isTimeout(e) ? "timeout" : "503",
    message: String(e).slice(0, 200),
  });
  const useFallback = async (primaryFailure: SemanticPrimaryFailure): Promise<SemanticCallResult> => {
    const r = await callFallback();
    return { text: r.text, cost: r.cost, modelUsed: SEMANTIC_FALLBACK_MODEL, fallbackUsed: true, primaryFailure };
  };

  try {
    const r = await callPrimary();
    return { text: r.text, cost: r.cost, modelUsed: SEMANTIC_CRITIC_MODEL, fallbackUsed: false, primaryFailure: null };
  } catch (e1) {
    if (!isTransient(e1)) throw e1; // a real error (e.g. 429/404) is not masked
    const primaryFailure = describe(e1);
    // A hang won't recover on an immediate retry — go straight to the fallback.
    if (isTimeout(e1)) return useFallback(primaryFailure);
    // A 503: one short-backoff retry of the primary before falling back.
    await sleep(SEMANTIC_503_BACKOFF_MS);
    try {
      const r = await callPrimary();
      return { text: r.text, cost: r.cost, modelUsed: SEMANTIC_CRITIC_MODEL, fallbackUsed: false, primaryFailure };
    } catch (e2) {
      if (!isTransient(e2)) throw e2;
      return useFallback(primaryFailure);
    }
  }
}

// ---------- Fallback certification ----------
// A fallback verdict is only trustworthy (trainingReady-eligible) once the
// fallback model has passed the semantic golden cases at the CURRENT critic
// version. Persisted so certification survives across runs.

const CERT_PATH = join(process.cwd(), "fallback-cert.json");
type CertStore = Record<string, { certifiedAt: string; cases: number }>;
const certKey = (model: string) => `${CRITIC_VERSION}|${model}`;

export function isFallbackCertified(model: string): boolean {
  if (!existsSync(CERT_PATH)) return false;
  try {
    const store = JSON.parse(readFileSync(CERT_PATH, "utf8")) as CertStore;
    return !!store[certKey(model)];
  } catch {
    return false;
  }
}

export function certifyFallback(model: string, cases: number): void {
  let store: CertStore = {};
  if (existsSync(CERT_PATH)) {
    try {
      store = JSON.parse(readFileSync(CERT_PATH, "utf8")) as CertStore;
    } catch {
      store = {};
    }
  }
  store[certKey(model)] = { certifiedAt: new Date().toISOString(), cases };
  writeFileSync(CERT_PATH, JSON.stringify(store, null, 2));
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

export interface FocusFrameRender {
  name: string;
  kind: "teach" | "overview";
  png: Buffer;
}

/**
 * Render each semantic-camera focus frame separately at a mobile viewport (the
 * actual teaching frames + the contextual overview), by loading the real scene
 * and setting the SVG's fixed camera box + each region's computed viewBox — the
 * same framing the runtime applies. Returns [] when the program has no focus
 * regions (nothing to teach frame-by-frame). Lets the critic judge teaching
 * frames strictly and the overview contextually.
 */
export async function renderFocusFrames(browser: Browser, graphRaw: unknown): Promise<FocusFrameRender[]> {
  const v = validate(graphRaw);
  const regions = v?.program.focusRegions ?? [];
  if (!v || !regions.length) return [];
  const enc = encodeGraph(v.graph);
  const out: FocusFrameRender[] = [];
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  try {
    await page.goto(`${APP}/?rendergraph=${encodeURIComponent(enc)}`, { waitUntil: "networkidle", timeout: 15000 });
    const el = await page.waitForSelector('[data-render-target="1"]', { timeout: 8000 });
    await page.evaluate(() => (document as Document).fonts.ready);
    // Fix the SVG box exactly as the runtime does while focusing.
    await page.evaluate(() => {
      const s = document.querySelector<SVGSVGElement>(".scene-canvas svg");
      if (s) s.style.height = "min(70vh, 620px)";
    });
    // Cumulative stroke/text counts through each group, so a frame can show only
    // what the learner has actually drawn by that point (groups <= endGroup) —
    // never strokes from a later frame bleeding into an earlier crop.
    const strokeThrough: number[] = [];
    const textThrough: number[] = [];
    let sAcc = 0;
    let tAcc = 0;
    for (const g of v.program.groups) {
      sAcc += g.strokes.length;
      tAcc += g.texts.length;
      strokeThrough.push(sAcc);
      textThrough.push(tAcc);
    }
    for (const r of regions) {
      const rect = await page.evaluate(() => {
        const b = document.querySelector<SVGSVGElement>(".scene-canvas svg")?.getBoundingClientRect();
        return { w: b?.width ?? 300, h: b?.height ?? 480 };
      });
      const vb = regionViewBox(r, rect);
      await page.evaluate(
        (arg: { vb: number[]; sCut: number; tCut: number }) => {
          const s = document.querySelector<SVGSVGElement>(".scene-canvas svg");
          if (s) s.setAttribute("viewBox", arg.vb.join(" "));
          document.querySelectorAll<SVGElement>(".vp-stroke").forEach((p, i) => (p.style.visibility = i < arg.sCut ? "visible" : "hidden"));
          document.querySelectorAll<SVGElement>(".vp-text").forEach((t, i) => (t.style.visibility = i < arg.tCut ? "visible" : "hidden"));
        },
        { vb: vb as unknown as number[], sCut: strokeThrough[r.endGroup] ?? sAcc, tCut: textThrough[r.endGroup] ?? tAcc },
      );
      await page.waitForTimeout(120);
      out.push({ name: r.meaning, kind: r.kind, png: await el.screenshot({ type: "png" }) });
    }
  } finally {
    await page.close();
  }
  return out;
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
