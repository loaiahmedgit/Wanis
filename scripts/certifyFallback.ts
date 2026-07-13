/**
 * Certify the pinned semantic FALLBACK model (SEMANTIC_FALLBACK_MODEL) against
 * the four semantic golden fixtures. Only if the fallback model reproduces the
 * expected verdict on every case (correct water -> approve, reversed water ->
 * reject, missing condensation -> reject, correct food chain -> approve) do we
 * write a certification record. Until then, callSemanticResilient may still fall
 * back to it on a 503, but such a verdict is not trainingReady.
 *
 * Results are cached (keyed by critic version + fallback model + input hash) so
 * re-running never re-spends quota on an already-certified case.
 */
import {
  SEMANTIC_SCHEMA,
  semanticCritiqueInstruction,
  parseSemanticCritique,
  isSemanticApproved,
} from "../src/critique/critic";
import {
  SEMANTIC_FALLBACK_MODEL,
  getKey,
  callGemini,
  httpStatusOf,
  loadCache,
  saveCache,
  cacheKey,
  semanticInputHash,
  certifyFallback,
} from "./pipelineLib";
import { SEMANTIC_GOLDEN } from "./goldenSemantic";

async function main() {
  const key = getKey();
  const cache = loadCache();
  let cacheHits = 0;
  const results: { name: string; pass: boolean; detail: string }[] = [];

  for (const c of SEMANTIC_GOLDEN) {
    const k = cacheKey(SEMANTIC_FALLBACK_MODEL, semanticInputHash(c.question, c.graph));
    let parsed: unknown;
    if (cache[k]) {
      parsed = cache[k];
      cacheHits++;
    } else {
      let r;
      try {
        r = await callGemini(
          SEMANTIC_FALLBACK_MODEL,
          key,
          [{ text: semanticCritiqueInstruction(c.question, JSON.stringify(c.graph, null, 1)) }],
          SEMANTIC_SCHEMA,
          "You are a strict scientific/pedagogical reviewer.",
        );
      } catch (e) {
        // The fallback model itself is unavailable (e.g. 503) — cannot certify
        // today. Stop WITHOUT writing a certification, exit non-zero.
        console.error(`  fallback model call failed on "${c.name}": HTTP ${httpStatusOf(e)} — ${String(e).slice(0, 120)}`);
        console.error("Certification aborted — no record written.");
        process.exit(2);
      }
      parsed = JSON.parse(r.text);
      cache[k] = parsed;
      saveCache(cache);
    }
    const critique = parseSemanticCritique(parsed);
    if (!critique) {
      results.push({ name: c.name, pass: false, detail: "unparseable critique" });
      continue;
    }
    const approved = isSemanticApproved(critique);
    const pass = approved === c.expectApprove;
    results.push({
      name: c.name,
      pass,
      detail: `expected ${c.expectApprove ? "approve" : "reject"}, got ${approved ? "approve" : "reject"} — "${critique.summary}"`,
    });
  }

  for (const r of results) console.log(`  ${r.pass ? "PASS" : "FAIL"}  ${r.name} — ${r.detail}`);
  const failed = results.filter((r) => !r.pass);
  console.log(`\n${results.length - failed.length}/${results.length} passed. (${cacheHits} served from cache)`);

  if (failed.length) {
    console.log(`Fallback model ${SEMANTIC_FALLBACK_MODEL} NOT certified — golden cases failed.`);
    process.exit(1);
  }
  certifyFallback(SEMANTIC_FALLBACK_MODEL, results.length);
  console.log(`Certified ${SEMANTIC_FALLBACK_MODEL} as semantic fallback (${results.length} golden cases).`);
}

main().catch((e) => {
  console.error("certify error:", String(e));
  process.exit(3);
});
