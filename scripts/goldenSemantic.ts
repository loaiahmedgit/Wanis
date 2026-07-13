/**
 * The four SEMANTIC golden fixtures, as a single source of truth shared by the
 * critic benchmark and the fallback-certification script. Each is a hand-built
 * scene graph with a known-correct semantic expectation. (Kept separate from
 * criticBenchmark's visual cases, which need a live render.)
 */
import { parseSceneGraph, type SceneGraph } from "../src/visual/sceneGraph";

const g = (raw: unknown): SceneGraph => {
  const parsed = parseSceneGraph(raw);
  if (!parsed) throw new Error("golden semantic fixture failed to parse — fix the fixture");
  return parsed;
};

const water = (order: string[]) => ({
  objects: [
    { id: "evap", type: "box", label: "Evaporation" },
    { id: "cond", type: "box", label: "Condensation" },
    { id: "precip", type: "box", label: "Precipitation" },
    { id: "collect", type: "box", label: "Collection" },
    { id: "cyc", type: "cycle", members: order, direction: "clockwise" },
  ],
  constraints: [],
});

export interface SemanticGolden {
  name: string;
  question: string;
  graph: SceneGraph;
  expectApprove: boolean;
}

export const SEMANTIC_GOLDEN: SemanticGolden[] = [
  {
    name: "correct water",
    question: "explain the water cycle",
    graph: g(water(["evap", "cond", "precip", "collect"])),
    expectApprove: true,
  },
  {
    name: "reversed water",
    question: "explain the water cycle",
    graph: g(water(["evap", "collect", "precip", "cond"])), // evap -> collection is backwards
    expectApprove: false,
  },
  {
    name: "missing condensation",
    question: "explain the water cycle",
    graph: g({
      objects: [
        { id: "evap", type: "box", label: "Evaporation" },
        { id: "precip", type: "box", label: "Precipitation" },
        { id: "collect", type: "box", label: "Collection" },
        { id: "cyc", type: "cycle", members: ["evap", "precip", "collect"], direction: "clockwise" },
      ],
      constraints: [],
    }),
    expectApprove: false,
  },
  {
    name: "correct food chain",
    question: "how does a food chain work",
    graph: g({
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
    expectApprove: true,
  },
];
