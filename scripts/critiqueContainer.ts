/**
 * Focused check for the container milestone: render the hand-built plant-cell
 * graph in the real UI and run BOTH critics on it (visual for the "one
 * integrated illustration" bar, semantic for biological correctness). Uses the
 * resilient semantic path so a 503/timeout on the primary falls back to the
 * certified model. Not a benchmark — a single gate for the milestone.
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

// Scientifically complete plant cell: the rigid Cell Wall encloses the Cell
// Membrane (depth-2 containment), whose interior is the Cytoplasm that holds the
// organelles. Corrects the earlier fixture, which the semantic critic rightly
// flagged as incomplete (missing wall/membrane/cytoplasm) — a fixture fix, not a
// compiler change.
const PLANT_CELL = {
  objects: [
    { id: "wall", type: "container", label: "Cell Wall", boundary: "box", members: ["membrane"] },
    { id: "membrane", type: "container", label: "Cell Membrane", boundary: "organic", members: ["nucleus", "vacuole", "chloro1", "chloro2", "mito"] },
    { id: "nucleus", type: "circleShape", label: "Nucleus", size: 1.1 },
    { id: "vacuole", type: "circleShape", label: "Vacuole", size: 1.2 },
    { id: "chloro1", type: "circleShape", label: "Chloroplast", size: 0.9 },
    { id: "chloro2", type: "circleShape", label: "Chloroplast", size: 0.9 },
    { id: "mito", type: "circleShape", label: "Mitochondrion", size: 0.9 },
    { id: "cyto", type: "label", text: "Cytoplasm", near: "membrane", placement: "below" },
  ],
  constraints: [],
};

async function main() {
  const key = getKey();
  const question = "explain the structure of a plant cell";
  const v = validate(PLANT_CELL);
  if (!v) throw new Error("plant cell graph failed to validate");
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
