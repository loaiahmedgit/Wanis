/**
 * Deterministic unit tests for the pure lesson-board geometry: the shelf packer
 * and the camera fit. No DOM, no API. Exits non-zero on any failure.
 */
import { packBoard, unionRect } from "../src/board/boardLayout";
import { fitTransform } from "../src/board/boardCamera";

let failures = 0;
function eq(name: string, got: unknown, want: unknown) {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (!ok) failures++;
  console.log(`  ${ok ? "PASS" : "FAIL"}  ${name}${ok ? "" : ` — got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`}`);
}
function approx(name: string, got: number, want: number, tol = 0.5) {
  const ok = Math.abs(got - want) <= tol;
  if (!ok) failures++;
  console.log(`  ${ok ? "PASS" : "FAIL"}  ${name}${ok ? "" : ` — got ${got}, want ~${want}`}`);
}

console.log("packBoard — row flow, top-aligned, gap:");
const L1 = packBoard(
  [
    { id: "a", role: "equation", w: 200, h: 80 },
    { id: "b", role: "sceneGraph", w: 300, h: 300 },
    { id: "c", role: "explanation", w: 200, h: 120 },
  ],
  { boardWidth: 1100, gap: 60, dir: "ltr" },
);
eq("all in one row (top-aligned)", L1.regions.every((r) => r.y === 0), true);
eq("a.x", L1.regions[0].x, 0);
eq("b.x (gap applied)", L1.regions[1].x, 260);
eq("c.x", L1.regions[2].x, 620);

console.log("packBoard — heading full-width own row:");
const L2 = packBoard(
  [
    { id: "h", role: "heading", w: 400, h: 70 },
    { id: "x", role: "equation", w: 200, h: 80 },
  ],
  { boardWidth: 1100, gap: 60, dir: "ltr" },
);
eq("heading spans full width", L2.regions[0].w, 1100);
eq("heading content centered", L2.regions[0].content.x, (1100 - 400) / 2);
eq("next section drops below heading", L2.regions[1].y, 130);

console.log("packBoard — wide sceneGraph gets its own row:");
const L3 = packBoard(
  [
    { id: "g", role: "sceneGraph", w: 900, h: 300 }, // > 0.7 * 1100
    { id: "t", role: "equation", w: 200, h: 80 },
  ],
  { boardWidth: 1100, gap: 60, dir: "ltr" },
);
eq("wide graph at natural width", L3.regions[0].w, 900);
eq("next section below the wide graph", L3.regions[1].y, 360);

console.log("packBoard — wrap on overflow:");
const L4 = packBoard(
  [
    { id: "a", role: "equation", w: 700, h: 80 },
    { id: "b", role: "equation", w: 700, h: 80 },
  ],
  { boardWidth: 1100, gap: 60, dir: "ltr" },
);
eq("b wraps to a new row", L4.regions[1].y, 140);
eq("b.x resets to 0", L4.regions[1].x, 0);

console.log("packBoard — RTL mirrors the flow:");
const L5 = packBoard(
  [
    { id: "a", role: "equation", w: 200, h: 80 },
    { id: "b", role: "equation", w: 200, h: 80 },
  ],
  { boardWidth: 1100, gap: 60, dir: "rtl" },
);
eq("first item mirrored to the right edge", L5.regions[0].x, 900);

console.log("unionRect:");
eq("covers both rects", unionRect({ x: 0, y: 0, w: 100, h: 50 }, { x: 200, y: 20, w: 50, h: 100 }), { x: 0, y: 0, w: 250, h: 120 });

console.log("fitTransform — centers + fits within margin:");
const t = fitTransform({ x: 0, y: 0, w: 400, h: 200 }, { w: 1000, h: 600 }, { marginFrac: 0.1, mobile: false });
approx("scale fits (width-bound)", t.scale, 2.0);
approx("tx centers", t.tx, 100);
approx("ty centers", t.ty, 100);

console.log("fitTransform — mobile biases to width:");
const tm = fitTransform({ x: 0, y: 0, w: 400, h: 200 }, { w: 400, h: 800 }, { marginFrac: 0.05, mobile: true });
approx("mobile fills width", tm.scale, 0.9);

console.log(`\n${failures === 0 ? "ALL PASS" : failures + " FAILURES"}`);
process.exit(failures ? 1 : 0);
