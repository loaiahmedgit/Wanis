# Flagship Visual Explanations — Storyboards

**Goal:** a learner should understand the concept by watching the animation even with most of the text removed. The canvas is the stage — the diagram is the explanation, not an illustration bolted next to it.

## Systemic changes these storyboards require (not per-scene, one-time)

1. **Full-canvas staging.** Scenes stop being a small card inserted between text lines. When a scene step is active, it takes over the primary visual space (the board's main width, most of the viewport height) — text steps become narration captions *around or under* the stage, not the other way around. The existing `.scene-canvas` card treatment is replaced by a full-stage container.
2. **Typography hierarchy.** Handwriting (Kalam) is reserved for short annotations, arrow labels, and emphasis marks *inside* a scene — never for paragraph-length narration. A clean sans (the app already has Space Grotesk loaded for UI) becomes the narration/title voice. This alone fixes the "everything feels like the same handwritten note" flatness.
3. **A shared primitive layer**, so scenes are *assembled*, not hand-coded from scratch each time:
   - **Camera** — a controller that animates the SVG `viewBox` (x, y, width, height) over time. Powers zoom-in, zoom-out, and pan. Used by DNA (zoom into base pairs, zoom back out) and Big Bang (slow zoom-out as space expands).
   - **FocusRing** — a soft pulsing ring/glow that highlights a specific point or region for a beat, synced with a caption. Used by DNA (highlighting a base pair) and Big Bang (highlighting where a galaxy forms).
   - **TravelingLabel / Callout** — a small handwritten-style label that flies in next to a point and follows it if the point moves. Used across all three.
   - **MorphPath** — interpolates between two path shapes over time (flat ladder → helix; tight grid → expanded grid). One driver function, reused by DNA's twist and Big Bang's expansion.
   - **ParticleField** — a set of small dots with individually-controllable position/color/size, cheap to animate via direct attribute writes (same imperative-refs discipline as everything else). Used by Big Bang (matter/galaxies) and available for future scenes (circuits' current, network/field topics).
   - **RevealStrip** — a sequence of short labels/characters that reveal left-to-right (reused pattern from the DNA sequence extraction; conceptually the same technique already proven in `ProcessFlow`'s staged reveals, generalized).

   These are the actual reusable "visual grammar" — the LLM never touches any of this. It's engineering, done once, that every future scene draws from.

---

## Storyboard 1 — How sine comes from a rotating point

*(Upgrades the existing `unit-circle-wave` into the full-stage version — most tractable, ships first.)*

| Moment | What happens | Primitive(s) |
|---|---|---|
| 1 | Empty stage. A circle traces itself into existence (stroke-draw, as now) — but full-size, centered-left, occupying real canvas space, not a small card. | existing path-draw |
| 2 | A radius line grows from center to the circle's rightmost point. A glowing tracer dot sits at the tip. | existing tracer |
| 3 | Faint dashed guide lines fade in from the point to both axes — "this point has a height and a horizontal position." A `TravelingLabel` "height" appears briefly next to the vertical guide, then fades. | Callout |
| 4 | The graph stage — empty axes, θ from 0 to 2π — slides/fades in to the right, claiming the other half of the canvas. | Camera (pan/reveal) |
| 5 | Rotation begins. The point sweeps counterclockwise at constant angular speed. A horizontal dashed **projector line** continuously connects the circle point's height to the matching height on the graph. | existing rotation + projector |
| 6 | The wave curve grows live, exactly in sync with the point — not a pre-baked reveal, a genuinely growing path (as already built). At the peak (θ=π/2) a `FocusRing` briefly pulses on both the circle point and the curve's peak simultaneously — the "this height IS this height" aha-beat. | MorphPath (growing) + FocusRing |
| 7 | Full rotation completes (θ=2π). A bracket/label "one full turn = 2π" fades in under the completed wave. | Callout |
| 8 | *(stretch, same scene)* A second, differently-colored point 90° ahead of the first fades in, tracing cosine simultaneously on the same graph — visually answering "why are sine and cosine related" without extra narration. | reuse of steps 1-6 |

**Typography in this scene:** axis labels and θ/π markers in the clean sans (they're precise, not annotations). The two "aha" callouts ("height", "one full turn = 2π") in handwriting, since they're the informal aside, not the data.

---

## Storyboard 2 — How DNA stores information

| Moment | What happens | Primitive(s) |
|---|---|---|
| 1 | Two parallel flat "ladder" backbones draw themselves left to right across most of the stage width, with evenly-spaced rungs (base pairs) between them — deliberately flat/2D first, so the *twist* in the next beat reads as a transformation, not a static fact. | path-draw (existing technique) |
| 2 | The flat ladder **morphs** into a double helix — both backbones warp into offset sine curves over ~2s, rungs recalculated each frame to keep connecting the correct points on each strand. This is the visual claim "DNA is a twisted ladder," shown, not stated. | MorphPath |
| 3 | Camera zooms into a 4-6-rung window of the helix (viewBox animates smaller/closer). Everything else fades to low-opacity so the zoomed region is unambiguous. | Camera |
| 4 | One rung at a time gets a `FocusRing` and its two bases label themselves in clean sans, color-coded: A (blue) — T (orange), then C (green) — G (red). Each pairing gets half a beat before the next. | FocusRing + Callout |
| 5 | Camera pulls back out to the full helix. Simultaneously, the base-pair letters "peel off" and reassemble as a horizontal sequence strip beneath the helix: `A T G C T A G G` — each letter appearing in the same color it had on the helix, visually proving "the helix and the sequence are the same information, two views of it." | Camera (zoom out) + RevealStrip |
| 6 | Groups of 3 letters in the strip get an alternating soft background tint (a "codon" grouping cue, kept conceptual, not a biology lecture) — reinforcing "this looks like a code with words in it." | highlighted regions |
| 7 | Hold: helix + glowing sequence strip both visible, narration lands on "millions of these letters make up your DNA." | — |

**Typography:** base letters (A/T/C/G) and the sequence strip in clean sans — they're data/labels, need to be crisply legible, not handwritten. Any "aha" aside ("a twisted ladder") in handwriting.

*(DNA replication — helix unzips, bases separate, matching bases attach, two molecules form — is a natural, distinct follow-up scene reusing the same helix MorphPath machinery in reverse/forward. Not built in this pass; flagged as the obvious next scene once this one ships, since most of the hard part — the helix geometry — is already solved.)*

---

## Storyboard 3 — The Big Bang as expansion of space

| Moment | What happens | Primitive(s) |
|---|---|---|
| 1 | Stage opens on a small, tight, bright cluster of particles at dead center — a `ParticleField` with maybe 40-60 points packed into a tiny radius, subtly pulsing (scale/opacity breathing) to read as "dense, energetic." | ParticleField |
| 2 | A faint background grid (dots or thin lines) fades in, tightly spaced, covering the whole stage — the fabric of space itself, established *before* it starts moving, so the next beat reads as the grid stretching, not objects flying. | grid primitive (simple, part of MorphPath's coordinate remapping) |
| 3 | Expansion begins: the grid itself stretches outward uniformly from center (spacing between grid points increases over time) and the particles — pinned to grid coordinates, not moving independently — appear to separate *because the space between them grows*. This is the one non-negotiable conceptual beat the whole scene exists to deliver. | MorphPath (coordinate scaling) |
| 4 | As expansion progresses, particle color drifts from hot white/blue toward cooler orange/red (a straightforward color interpolation tied to the same progress value driving the expansion) — "cooling as the universe grows." | color morph |
| 5 | A few particles cluster slightly (simple precomputed clustering, not physics) and get a `FocusRing` with a caption "galaxies form" as the camera holds on one cluster briefly. | FocusRing + Callout |
| 6 | Camera slowly zooms **out** for the remainder of the scene (viewBox growing) as expansion continues — the original dense point shrinks to an unremarkable speck among many scattered clusters, delivering the scale/perspective shift. | Camera |
| 7 | Hold on the wide view, gentle continued drift (not a hard stop) with a caption "still expanding today." | — |

**Typography:** captions in clean sans (they're informational beats, not asides) — this scene has no handwritten annotations at all, which is fine; not every scene needs both registers.

---

## Shared-primitive payoff

Notice the overlap already: **Camera** (zoom/pan) is used by both DNA and Big Bang. **FocusRing + Callout** is used by all three. **MorphPath** (shape interpolation over a progress value) powers the sine wave's growth, DNA's ladder→helix twist, *and* Big Bang's grid expansion — it's the same underlying technique (map a progress value to new coordinates, write them imperatively every frame) applied to three different coordinate transforms. Building it once as a real reusable primitive is what makes the "visual grammar" claim true rather than aspirational.

## Build order

1. **Sine (Storyboard 1)** — smallest delta from what already exists and works; validates the full-stage layout change and the Camera/FocusRing/Callout primitives on familiar ground.
2. **DNA (Storyboard 2)** — introduces MorphPath (ladder→helix) and RevealStrip; the most novel geometry.
3. **Big Bang (Storyboard 3)** — introduces ParticleField and reuses Camera + MorphPath from the previous two, should be the fastest of the three once the primitives exist.

Each gets implemented and checked live in the browser (headless screenshot + manual review) before moving to the next, per your instruction — not built all at once and hoped-for.
