/**
 * Focused both-critics gate for the lever milestone: render a class-2 lever
 * (wheelbarrow) and run BOTH critics. Visual judges the mechanical layout;
 * semantic judges whether it correctly teaches the lever + mechanical advantage.
 * Uses the resilient semantic path (503/timeout -> certified fallback).
 */
import type { SceneGraph } from "../src/visual/sceneGraph";
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
import { getKey, callGemini, callSemanticResilient, renderReal, validate, chromium, VISUAL_CRITIC_MODEL } from "./pipelineLib";

const LEVER = {
  objects: [
    {
      id: "lev",
      type: "lever",
      points: [
        { id: "f", role: "fulcrum", label: "Wheel (Fulcrum)", spanToNext: 1 },
        { id: "l", role: "load", label: "Load", force: "down", forceLabel: "300 N", spanToNext: 2 },
        { id: "e", role: "effort", label: "Effort", force: "up", forceLabel: "100 N" },
      ],
      distanceMarkers: [
        { from: "f", to: "l", label: "load arm" },
        { from: "f", to: "e", label: "effort arm" },
      ],
    },
  ],
  constraints: [],
};

async function main() {
  const key = getKey();
  const question = "Explain a class-2 lever (a wheelbarrow) and why it gives a mechanical advantage";
  const v = validate(LEVER);
  if (!v) throw new Error("lever graph failed to validate");
  const graph: SceneGraph = v.graph;

  const browser = await chromium.launch();
  try {
    const { renders } = await renderReal(browser, graph);
    const vparts: unknown[] = [{ text: visualCritiqueInstruction() }];
    for (const [name, buf] of Object.entries(renders)) {
      vparts.push({ text: `[${name} viewport]` });
      vparts.push({ inline_data: { mime_type: "image/png", data: buf.toString("base64") } });
    }
    const vr = await callGemini(VISUAL_CRITIC_MODEL, key, vparts, VISUAL_SCHEMA, "You are a strict visual layout reviewer.");
    const vis = parseVisualCritique(JSON.parse(vr.text))!;

    const sr = await callSemanticResilient(
      key,
      [{ text: semanticCritiqueInstruction(question, JSON.stringify(graph, null, 1)) }],
      SEMANTIC_SCHEMA,
      "You are a strict scientific/pedagogical reviewer.",
    );
    const sem = parseSemanticCritique(JSON.parse(sr.text))!;

    console.log(`VISUAL (${VISUAL_CRITIC_MODEL}): approved=${isVisualApproved(vis)} — clip=${vis.clipping} coll=${vis.collisions} leg=${vis.legibility} comp=${vis.composition} fit=${vis.responsiveFit}`);
    console.log(`  "${vis.summary}"`);
    if (vis.revisions.length) console.log(`  revisions: ${JSON.stringify(vis.revisions)}`);
    console.log(`SEMANTIC (${sr.modelUsed}${sr.fallbackUsed ? " [fallback]" : ""}): approved=${isSemanticApproved(sem)} — correct=${sem.correct} complete=${sem.complete} order=${sem.transitionOrderCorrect} edu=${sem.educationalValue}`);
    console.log(`  "${sem.summary}"`);
    if (sem.revisions.length) console.log(`  revisions: ${JSON.stringify(sem.revisions)}`);
    console.log(`\nBOTH APPROVE: ${isVisualApproved(vis) && isSemanticApproved(sem)}`);
  } finally {
    await browser.close();
  }
}

main().catch((e) => {
  console.error("error:", String(e));
  process.exit(1);
});
