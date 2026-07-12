# Semantic Visual Compiler — the next milestone

## Why

Hand-built scene templates (sine, DNA, Big Bang) look good but are bounded — every
new topic needs a bespoke component. Letting an LLM emit raw coordinates is the
other extreme and demonstrably fails (bowtie polygons, cramped layouts). The
middle path, per external architectural review + this project's own lessons:

```
question → teaching plan → semantic scene graph → deterministic compiler → timed stroke program → pen runtime
                                (LLM)                    (our code)                                (our code)
```

The model declares **objects, relations, and constraints** — never coordinates,
timing, easing, or colors. Our compiler computes all geometry deterministically.
A bounded `freeSketch` object is the escape hatch for things the primitive set
can't express (normalized strokes, scaled into a box the compiler allocates).

## The three representations

1. **Teaching plan** (`src/visual/teachingPlan.ts`) — why each moment exists:
   beats with learningGoal, narration, focus object ids.
2. **Semantic scene graph** (`src/visual/sceneGraph.ts`) — objects + constraints,
   no coordinates. Validated & clamped like every other LLM input in this app.
3. **Timed stroke program** (`src/visual/strokeProgram.ts`) — compiled output:
   ordered stroke groups with semantic meaning, text items, motions. The player
   measures real path lengths at runtime (getTotalLength) and paces the pen.

## Build order

1. ✅ Schemas + deterministic compiler core (pure TS, node-smoke-tested)
2. StrokePlayer runtime — generalize the Line.tsx/Drawing.tsx pen-tracing loop
   to play any StrokeProgram (groups sequentially, strokes traced, texts fade)
3. Parity gate: hand-write a scene graph approximating the unit-circle scene,
   compile it, screenshot it — must be near template quality
4. Third drawing mode: `{"sceneGraph": {...}}` in parseDrawingContent; system
   prompt teaches the LLM the object/constraint vocabulary (not coordinates)
5. Critique loop: render headlessly (existing Playwright harness) → Gemini
   vision judges legibility/overlaps/correctness → retry; separate semantic
   critic checks plan/graph structure before any rendering
6. 36–50-prompt benchmark across categories (precise STEM / processes /
   abstract / physical scenes / adversarial), 3 pipelines compared (raw model
   strokes vs compiled graph vs graph+freeSketch), 2 repair iterations
7. Cache approved programs by normalized concept; correction UI accumulates
   draft/critique/correction/final quads as future fine-tuning data

Fine-tuning (OmniSVG-style checkpoint or open LLM + LoRA on our schema) is
reconsidered ONLY after several hundred corrected real examples exist and the
prompted pipeline's failures are measured, not assumed.

## Non-goals right now

- No model training, no GPU, no new hosting
- Existing templates and shapes system stay untouched (additive only)
- No video output — vector stroke sequences only, so everything stays
  animatable, editable, zoomable
