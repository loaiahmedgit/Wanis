/**
 * Teaching-frame-aware critic for the semantic camera. Renders each focus frame
 * (the real teaching frames + the contextual overview) and judges them with the
 * split schema: every TEACHING frame must pass the full visual bar (clipping,
 * collisions, legibility, composition, fit); the OVERVIEW is judged on structure
 * only (clipping, genuine collisions, composition — never small-text legibility)
 * and is tagged so it can't be mistaken for a teaching frame. Approval requires
 * every teaching frame to pass; a clean overview cannot compensate for an
 * unreadable teaching frame.
 *
 * Run with `--render-only` to just save the frames (no API) for deterministic
 * inspection; without it, runs the visual critic per frame.
 */
import { writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import {
  VISUAL_SCHEMA,
  visualCritiqueInstruction,
  overviewCritiqueInstruction,
  parseVisualCritique,
  isVisualApproved,
  isOverviewClean,
  isFocusApproved,
  type FocusFrameCritique,
} from "../src/critique/critic";
import { getKey, callGemini, renderFocusFrames, chromium, VISUAL_CRITIC_MODEL, loadCache, saveCache, cacheKey, sha } from "./pipelineLib";

const GRAPHS: Record<string, unknown> = {
  lever: { objects: [{ id: "lev", type: "lever", points: [
    { id: "f", role: "fulcrum", label: "Wheel (Fulcrum)", spanToNext: 1 },
    { id: "l", role: "load", label: "Load", force: "down", forceLabel: "300 N", spanToNext: 2 },
    { id: "e", role: "effort", label: "Effort", force: "up", forceLabel: "100 N" },
  ], distanceMarkers: [{ from: "f", to: "l", label: "load arm" }, { from: "f", to: "e", label: "effort arm" }] }], constraints: [] },
  cell: { objects: [
    { id: "wall", type: "container", label: "Cell Wall", boundary: "box", members: ["membrane"] },
    { id: "membrane", type: "container", label: "Cell Membrane", boundary: "organic", members: ["nucleus", "vacuole", "chloro1", "chloro2", "mito"] },
    { id: "nucleus", type: "circleShape", label: "Nucleus", size: 1.1 }, { id: "vacuole", type: "circleShape", label: "Vacuole", size: 1.2 },
    { id: "chloro1", type: "circleShape", label: "Chloroplast", size: 0.9 }, { id: "chloro2", type: "circleShape", label: "Chloroplast", size: 0.9 },
    { id: "mito", type: "circleShape", label: "Mitochondrion", size: 0.9 },
  ], constraints: [] },
  chain: { objects: [
    { id: "grass", type: "box", label: "Grass" }, { id: "rabbit", type: "box", label: "Rabbit" }, { id: "fox", type: "box", label: "Fox" },
    { id: "a1", type: "arrowBetween", from: "grass", to: "rabbit", label: "eaten by" }, { id: "a2", type: "arrowBetween", from: "rabbit", to: "fox", label: "eaten by" },
  ], constraints: [["rightOf", "rabbit", "grass"], ["rightOf", "fox", "rabbit"], ["alignedY", "rabbit", "grass"], ["alignedY", "fox", "rabbit"]] },
};

async function main() {
  const renderOnly = process.argv.includes("--render-only");
  const which = process.argv.find((a) => GRAPHS[a]) ?? "lever";
  const graph = GRAPHS[which];
  const browser = await chromium.launch();
  try {
    const frames = await renderFocusFrames(browser, graph);
    console.log(`${which}: ${frames.length} focus frames — ${frames.map((f) => `${f.kind}:${f.name}`).join(", ")}`);
    if (renderOnly) {
      const dir = join(process.cwd(), "review");
      mkdirSync(dir, { recursive: true });
      frames.forEach((f, i) => writeFileSync(join(dir, `focus-${which}-${i}-${f.kind}.png`), f.png));
      console.log(`  saved ${frames.length} frames to review/`);
      return;
    }
    const key = getKey();
    const cache = loadCache();
    let cacheHits = 0;
    const results: FocusFrameCritique[] = [];
    for (const f of frames) {
      // Cache keyed by critic version + model + the exact frame PNG + its kind,
      // so a completed frame is never re-judged and never re-spends quota.
      const ck = cacheKey(VISUAL_CRITIC_MODEL, sha(f.png, f.kind));
      let parsed: unknown;
      if (cache[ck]) {
        parsed = cache[ck];
        cacheHits++;
      } else {
        const instr = f.kind === "overview" ? overviewCritiqueInstruction() : visualCritiqueInstruction();
        const parts: unknown[] = [{ text: instr }, { text: `[${f.kind} frame: ${f.name}]` }, { inline_data: { mime_type: "image/png", data: f.png.toString("base64") } }];
        const r = await callGemini(VISUAL_CRITIC_MODEL, key, parts, VISUAL_SCHEMA, "You are a strict visual layout reviewer.");
        parsed = JSON.parse(r.text);
        cache[ck] = parsed;
        saveCache(cache);
      }
      const c = parseVisualCritique(parsed)!;
      results.push({ kind: f.kind, name: f.name, critique: c });
      const pass = f.kind === "overview" ? isOverviewClean(c) : isVisualApproved(c);
      console.log(`  ${pass ? "PASS" : "FAIL"} [${f.kind}] ${f.name} — clip=${c.clipping} coll=${c.collisions} leg=${c.legibility} comp=${c.composition} fit=${c.responsiveFit}`);
    }
    console.log(`\nFOCUS APPROVED: ${isFocusApproved(results)} (${cacheHits} frame(s) served from cache)`);
  } finally {
    await browser.close();
  }
}

main().catch((e) => {
  console.error("error:", String(e));
  process.exit(1);
});
