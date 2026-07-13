/**
 * Deterministic unit tests for the critic verdict / terminal-state / approval
 * logic. Pure — no API, no browser. Covers exactly the reviewer's required
 * cases plus the parse/clamp guards. Exits non-zero on any failure.
 */
import {
  isVisualApproved,
  isSemanticApproved,
  combinedVerdict,
  deriveTerminalState,
  isTrainingReady,
  parseVisualCritique,
  parseSemanticCritique,
  type VisualCritique,
  type SemanticCritique,
  type TerminalState,
} from "../src/critique/critic";

let failures = 0;
function eq(name: string, got: unknown, want: unknown) {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (!ok) failures++;
  console.log(`  ${ok ? "PASS" : "FAIL"}  ${name}${ok ? "" : ` — got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`}`);
}

const visPass: VisualCritique = { clipping: false, collisions: false, legibility: 5, composition: 5, responsiveFit: true, summary: "", revisions: [] };
const visFail: VisualCritique = { clipping: false, collisions: true, legibility: 5, composition: 5, responsiveFit: true, summary: "", revisions: [] };
const semPass: SemanticCritique = { correct: true, complete: true, transitionOrderCorrect: true, educationalValue: 5, summary: "", revisions: [] };
const semFail: SemanticCritique = { correct: false, complete: true, transitionOrderCorrect: true, educationalValue: 5, summary: "", revisions: [] };

console.log("approval predicates:");
eq("visPass approved", isVisualApproved(visPass), true);
eq("visFail (collision) rejected", isVisualApproved(visFail), false);
eq("semPass approved", isSemanticApproved(semPass), true);
eq("semFail (incorrect) rejected", isSemanticApproved(semFail), false);
eq("visual legibility<4 rejected", isVisualApproved({ ...visPass, legibility: 3 }), false);
eq("visual composition<3 rejected", isVisualApproved({ ...visPass, composition: 2 }), false);
eq("visual !responsiveFit rejected", isVisualApproved({ ...visPass, responsiveFit: false }), false);
eq("semantic edu<3 rejected", isSemanticApproved({ ...semPass, educationalValue: 2 }), false);

console.log("combinedVerdict (per-attempt, binary):");
eq("both pass -> approved", combinedVerdict(visPass, semPass), "approved");
eq("semantic fail + visual pass -> rejected", combinedVerdict(visPass, semFail), "rejected");
eq("semantic pass + visual fail -> rejected", combinedVerdict(visFail, semPass), "rejected");
eq("both fail -> rejected", combinedVerdict(visFail, semFail), "rejected");

console.log("deriveTerminalState:");
eq("both approve -> approved", deriveTerminalState({ failed: false, visualApproved: true, semanticApproved: true, exhausted: false }), "approved");
eq("critics disagree (vis ok, sem no) -> critic_disagreement", deriveTerminalState({ failed: false, visualApproved: true, semanticApproved: false, exhausted: true }), "critic_disagreement");
eq("critics disagree (sem ok, vis no) -> critic_disagreement", deriveTerminalState({ failed: false, visualApproved: false, semanticApproved: true, exhausted: true }), "critic_disagreement");
eq("neither + exhausted -> exhausted_needs_revision", deriveTerminalState({ failed: false, visualApproved: false, semanticApproved: false, exhausted: true }), "exhausted_needs_revision");
eq("either critic 429/fails -> unreviewed_after_failure", deriveTerminalState({ failed: true, visualApproved: false, semanticApproved: false, exhausted: false }), "unreviewed_after_failure");
eq("failure overrides even if a critic passed", deriveTerminalState({ failed: true, visualApproved: true, semanticApproved: true, exhausted: true }), "unreviewed_after_failure");

console.log("trainingReady only for approved:");
const states: TerminalState[] = ["approved", "exhausted_needs_revision", "critic_disagreement", "unreviewed_after_failure", "invalid"];
for (const s of states) eq(`trainingReady(${s})`, isTrainingReady(s), s === "approved");

console.log("parse/clamp guards (malformed defaults pessimistically):");
eq("visual empty -> not approved", isVisualApproved(parseVisualCritique({})!), false);
eq("visual clamps legibility 9 -> 5", parseVisualCritique({ legibility: 9 })!.legibility, 5);
eq("semantic empty -> not approved", isSemanticApproved(parseSemanticCritique({})!), false);
eq("semantic clamps edu 0 -> 1", parseSemanticCritique({ educationalValue: 0 })!.educationalValue, 1);
eq("parse non-object -> null", parseVisualCritique("nope"), null);

console.log(`\n${failures === 0 ? "ALL PASS" : failures + " FAILURES"}`);
process.exit(failures ? 1 : 0);
