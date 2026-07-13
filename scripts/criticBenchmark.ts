/**
 * Tiny golden benchmark for the two critics. Each case is a hand-built scene
 * graph with a known-correct expectation:
 *   - correct water cycle      -> both critics approve
 *   - reversed water cycle      -> semantic REJECTS (wrong order)
 *   - missing process           -> semantic REJECTS (incomplete)
 *   - deliberate collision      -> visual REJECTS (overlap)
 *   - correct food chain        -> both critics approve
 * Runs each relevant critic and asserts. Exits non-zero on any failure.
 * (Requires the dev server running for the real-UI render of the visual cases.)
 */
import type { SceneGraph } from "../src/visual/sceneGraph";
import { parseSceneGraph } from "../src/visual/sceneGraph";
import {
  VISUAL_SCHEMA,
  SEMANTIC_SCHEMA,
  visualCritiqueInstruction,
  semanticCritiqueInstruction,
  parseVisualCritique,
  parseSemanticCritique,
  isVisualApproved,
  isSemanticApproved,
} from "../src/critique/critic";
import {
  VISUAL_CRITIC_MODEL,
  SEMANTIC_CRITIC_MODEL,
  getKey,
  callGemini,
  renderReal,
  chromium,
  loadCache,
  saveCache,
  cacheKey,
  visualInputHash,
  semanticInputHash,
} from "./pipelineLib";
import type { Browser } from "playwright";

const cache = loadCache();
let cacheHits = 0;

const g = (raw: unknown): SceneGraph => {
  const parsed = parseSceneGraph(raw);
  if (!parsed) throw new Error("benchmark graph failed to parse — fix the fixture");
  return parsed;
};

const waterMembers = (order: string[]) => ({
  objects: [
    { id: "evap", type: "box", label: "Evaporation" },
    { id: "cond", type: "box", label: "Condensation" },
    { id: "precip", type: "box", label: "Precipitation" },
    { id: "collect", type: "box", label: "Collection" },
    { id: "cyc", type: "cycle", members: order, direction: "clockwise" },
  ],
  constraints: [],
});

const CASES = {
  correctWater: g(waterMembers(["evap", "cond", "precip", "collect"])),
  reversedWater: g(waterMembers(["evap", "collect", "precip", "cond"])), // evap -> collection is backwards
  missingProcess: g({
    objects: [
      { id: "evap", type: "box", label: "Evaporation" },
      { id: "precip", type: "box", label: "Precipitation" },
      { id: "collect", type: "box", label: "Collection" },
      { id: "cyc", type: "cycle", members: ["evap", "precip", "collect"], direction: "clockwise" }, // no condensation
    ],
    constraints: [],
  }),
  collision: g({
    // A box and an oversized circle forced concentric: their outlines cross
    // (the circle is taller than the box, so it juts out top and bottom while
    // the box juts out left and right). Two DISTINCT-footprint shapes overlap
    // visibly — unlike two identical boxes, which merge into one clean outline
    // and get their labels neatly de-collided. This is a genuine layout
    // collision the compiler cannot auto-fix (de-collision only moves text).
    objects: [
      { id: "a", type: "box", label: "Reaction" },
      { id: "c", type: "circleShape", label: "Catalyst", size: 1.3 },
    ],
    constraints: [
      ["alignedX", "c", "a"],
      ["alignedY", "c", "a"],
    ],
  }),
  foodChain: g({
    objects: [
      { id: "grass", type: "box", label: "Grass" },
      { id: "rabbit", type: "box", label: "Rabbit" },
      { id: "fox", type: "box", label: "Fox" },
      { id: "a1", type: "arrowBetween", from: "grass", to: "rabbit", label: "eaten by" },
      { id: "a2", type: "arrowBetween", from: "rabbit", to: "fox", label: "eaten by" },
    ],
    constraints: [
      ["rightOf", "rabbit", "grass"],
      ["rightOf", "fox", "rabbit"],
      ["alignedY", "rabbit", "grass"],
      ["alignedY", "fox", "rabbit"],
    ],
  }),
};

async function runVisual(key: string, browser: Browser, graph: SceneGraph) {
  const { renders } = await renderReal(browser, graph);
  const k = cacheKey(VISUAL_CRITIC_MODEL, visualInputHash(renders));
  if (cache[k]) {
    cacheHits++;
    return parseVisualCritique(cache[k])!;
  }
  const parts: unknown[] = [{ text: visualCritiqueInstruction() }];
  for (const [name, buf] of Object.entries(renders)) {
    parts.push({ text: `[${name} viewport]` });
    parts.push({ inline_data: { mime_type: "image/png", data: buf.toString("base64") } });
  }
  const r = await callGemini(VISUAL_CRITIC_MODEL, key, parts, VISUAL_SCHEMA, "You are a strict visual layout reviewer.");
  const parsed = JSON.parse(r.text);
  cache[k] = parsed;
  saveCache(cache);
  return parseVisualCritique(parsed)!;
}

async function runSemantic(key: string, question: string, graph: SceneGraph) {
  const k = cacheKey(SEMANTIC_CRITIC_MODEL, semanticInputHash(question, graph));
  if (cache[k]) {
    cacheHits++;
    return parseSemanticCritique(cache[k])!;
  }
  const r = await callGemini(
    SEMANTIC_CRITIC_MODEL,
    key,
    [{ text: semanticCritiqueInstruction(question, JSON.stringify(graph, null, 1)) }],
    SEMANTIC_SCHEMA,
    "You are a strict scientific/pedagogical reviewer.",
  );
  const parsed = JSON.parse(r.text);
  cache[k] = parsed;
  saveCache(cache);
  return parseSemanticCritique(parsed)!;
}

async function main() {
  const key = getKey();
  const browser = await chromium.launch();
  const results: { name: string; pass: boolean; detail: string }[] = [];
  const check = (name: string, pass: boolean, detail: string) => {
    results.push({ name, pass, detail });
    console.log(`  ${pass ? "PASS" : "FAIL"}  ${name} — ${detail}`);
  };

  try {
    // 1. Correct water cycle: both approve.
    {
      const sem = await runSemantic(key, "explain the water cycle", CASES.correctWater);
      const vis = await runVisual(key, browser, CASES.correctWater);
      check(
        "correct water cycle -> both approve",
        isSemanticApproved(sem) && isVisualApproved(vis),
        `sem={correct:${sem.correct},complete:${sem.complete},order:${sem.transitionOrderCorrect},edu:${sem.educationalValue}} vis={clip:${vis.clipping},coll:${vis.collisions},leg:${vis.legibility},comp:${vis.composition},fit:${vis.responsiveFit}}`,
      );
    }
    // 2. Reversed water cycle: semantic rejects.
    {
      const sem = await runSemantic(key, "explain the water cycle", CASES.reversedWater);
      check(
        "reversed water cycle -> semantic REJECTS",
        !isSemanticApproved(sem),
        `order:${sem.transitionOrderCorrect} correct:${sem.correct} — "${sem.summary}"`,
      );
    }
    // 3. Missing process: semantic rejects.
    {
      const sem = await runSemantic(key, "explain the water cycle", CASES.missingProcess);
      check(
        "missing condensation -> semantic REJECTS",
        !isSemanticApproved(sem),
        `complete:${sem.complete} — "${sem.summary}"`,
      );
    }
    // 4. Deliberate collision: visual rejects.
    {
      const vis = await runVisual(key, browser, CASES.collision);
      check("overlapping boxes -> visual REJECTS", !isVisualApproved(vis), `collisions:${vis.collisions} — "${vis.summary}"`);
    }
    // 5. Correct food chain: both approve.
    {
      const sem = await runSemantic(key, "how does a food chain work", CASES.foodChain);
      const vis = await runVisual(key, browser, CASES.foodChain);
      check(
        "correct food chain -> both approve",
        isSemanticApproved(sem) && isVisualApproved(vis),
        `sem_ok:${isSemanticApproved(sem)} vis_ok:${isVisualApproved(vis)}`,
      );
    }
  } finally {
    await browser.close();
  }

  const failed = results.filter((r) => !r.pass);
  console.log(`\n${results.length - failed.length}/${results.length} passed. (${cacheHits} critic calls served from cache)`);
  process.exit(failed.length ? 1 : 0);
}

main().catch((e) => {
  console.error("benchmark error:", String(e));
  process.exit(2);
});
