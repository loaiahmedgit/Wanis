/**
 * Deterministic unit tests for the semantic-camera activation math (no DOM).
 */
import { projectedLabelPx, decideCamera, regionViewBox, READABLE_PX } from "../src/visual/focusCamera";
import type { StrokeProgram, FocusRegion } from "../src/visual/strokeProgram";

let failures = 0;
function ok(name: string, cond: boolean) {
  if (!cond) failures++;
  console.log(`  ${cond ? "PASS" : "FAIL"}  ${name}`);
}
function approx(name: string, got: number, want: number, tol = 0.3) {
  ok(`${name} (${got.toFixed(2)}~${want})`, Math.abs(got - want) <= tol);
}

const wide: StrokeProgram = { viewBox: [0, 0, 700, 300], groups: [], minLabelSize: 14, focusRegions: [{ bounds: [0, 0, 200, 300], members: [], startGroup: 0, endGroup: 0, kind: "teach", meaning: "x" }] };

console.log("projectedLabelPx (uniform meet scale = min):");
approx("mobile 390x800", projectedLabelPx(wide, { w: 390, h: 800 }), 14 * (390 / 700));
approx("desktop 1100x850", projectedLabelPx(wide, { w: 1100, h: 850 }), 14 * (850 / 300 < 1100 / 700 ? 850 / 300 : 1100 / 700));

console.log("decideCamera:");
ok("mobile too-small + regions -> focus", decideCamera(wide, { w: 390, h: 800 }) === "focus");
ok("desktop readable -> whole", decideCamera(wide, { w: 1100, h: 850 }) === "whole");
ok("too-small but NO regions -> needed-but-unavailable", decideCamera({ ...wide, focusRegions: [] }, { w: 390, h: 800 }) === "needed-but-unavailable");
ok("threshold is 14px", READABLE_PX === 14);

console.log("regionViewBox (padded, aspect-matched, no distortion):");
const region: FocusRegion = { bounds: [100, 50, 200, 100], members: [], startGroup: 0, endGroup: 0, kind: "teach", meaning: "x" };
const vb = regionViewBox(region, { w: 390, h: 780 }, 0.1);
// portrait target aspect 0.5; region (padded) aspect 240/120=2 > 0.5 -> grow height
const aspect = vb[2] / vb[3];
approx("matches viewport aspect", aspect, 390 / 780, 0.02);
ok("contains original bounds (x)", vb[0] <= 100 && vb[0] + vb[2] >= 300);
ok("contains original bounds (y)", vb[1] <= 50 && vb[1] + vb[3] >= 150);

console.log(`\n${failures === 0 ? "ALL PASS" : failures + " FAILURES"}`);
process.exit(failures ? 1 : 0);
