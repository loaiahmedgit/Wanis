# Perception Field — Complete Product, Research, and Technical Plan

**Status:** Separate project from Wanis  
**Working name:** Perception Field  
**Version:** 0.1  
**Purpose:** Define a complete plan for an AI-driven visual perception engine that turns image understanding into a real-time animated 3D pin field.

---

# 1. Project Summary

Perception Field is a visual AI system that shows how a machine gradually organizes visual information.

The core interface is inspired by a physical 3D pin art board: a dense grid of pins that can rise, fall, glow, connect, vibrate, and move as the AI interprets an image or video.

Instead of hiding perception behind a final answer, the system presents perception as an evolving spatial field.

The experience begins as noise.

As the AI identifies structure:

- some pins rise,
- some remain inactive,
- clusters form,
- edges sharpen,
- connections appear,
- regions stabilize,
- movement travels through the field,
- uncertain regions continue to fluctuate.

The result is not intended to be a literal scientific visualization of a neural network.

It is a new visual language inspired by:

- neural activation,
- attention,
- saliency,
- depth,
- segmentation,
- confidence,
- information flow,
- and emergent structure.

The project should feel like watching an artificial perceptual system form an understanding in real time.

---

# 2. One-Sentence Definition

> **Perception Field is a real-time visual AI engine that transforms machine perception into a living 3D field of pins, heat, motion, and selective neural-like connections.**

---

# 3. Core Idea

Traditional computer vision behaves like this:

```text
Image or video
      ↓
Hidden model processing
      ↓
Labels, masks, depth, or text
```

Perception Field behaves like this:

```text
Image or video
      ↓
Raw visual uncertainty
      ↓
Saliency, depth, segmentation, motion, and confidence maps
      ↓
A dynamic 3D pin field
      ↓
Selective connections and propagating activation
      ↓
An interpretable evolving visual form
```

The system does not immediately render a polished object.

It shows the object emerging.

---

# 4. The Conceptual Mapping

Each visual property represents part of the AI perception process.

| AI signal | Visual behavior |
|---|---|
| Depth map | Controls how high each pin rises |
| Segmentation map | Groups pins into objects or regions |
| Optical flow | Controls how motion travels through pins |
| Confidence map | Controls stability, sharpness, and noise |
| Saliency map | Controls attention intensity and emphasis |
| Edge map | Controls outlines and structural boundaries |
| Color map | Controls local hue or surface color |
| Feature similarity | Controls which pins may connect |
| Temporal consistency | Controls how strongly shapes persist over time |
| Uncertainty | Produces flicker, vibration, diffusion, or partial formation |
| Activation | Controls brightness, scale, pulse, or emission |
| Object identity | Controls cluster behavior and persistent region IDs |

Important:

> Pins are not pixels, and connections are not literal synapses.

They are an expressive abstraction of machine perception.

---

# 5. Why the Pin Board Works

A physical pin art board already contains the main metaphor:

- every pin exists,
- not every pin is meaningfully active,
- the pins are locally packed,
- an object affects only the relevant region,
- the complete shape emerges from many simple elements,
- the field may look noisy before the shape becomes clear,
- the shape can dissolve and reform without replacing the board.

This maps naturally to machine vision.

The board is the persistent perceptual substrate.

The current interpretation is the temporary state formed across it.

---

# 6. The Neural-Like Connection Layer

The connection system should be selective.

Do not connect every nearby pin.

That would create visual noise and destroy meaning.

Connections should appear only when one or more of the following conditions are true:

1. The pins belong to the same segmented object.
2. Their feature embeddings are similar.
3. They are part of the same edge or contour.
4. Activation is propagating between them.
5. Their confidence is above a threshold.
6. They participate in the same motion region.
7. The system wants to emphasize a causal or structural relationship.

The connection layer should feel sparse, temporary, and intentional.

## Connection meanings

| Connection style | Meaning |
|---|---|
| Thin dim line | Weak relationship |
| Bright pulse | Active information flow |
| Thick stable line | Strong structural link |
| Flickering line | Uncertain relation |
| Curved path | Motion or attention path |
| Branching network | Cluster or concept formation |
| Dissolving line | Rejected hypothesis |
| Traveling glow | Inference propagation |

---

# 7. Product Categories

Perception Field could become several different products.

## 7.1 Interactive art and installation

A visual installation where camera input becomes a live pin-field interpretation.

Possible environments:

- galleries,
- museums,
- festivals,
- brand activations,
- AI exhibitions,
- stage visuals,
- conference displays.

## 7.2 Developer visualization engine

An SDK for turning AI perception outputs into real-time 3D visualizations.

Potential users:

- creative technologists,
- AI researchers,
- design studios,
- game developers,
- educational creators,
- data artists.

## 7.3 AI perception interface

A product for examining how a vision system responds to images and video.

It could expose:

- saliency,
- depth,
- segmentation,
- uncertainty,
- object tracks,
- motion fields.

## 7.4 Generative visual system

A tool that converts images, prompts, or live camera input into abstract animated scenes.

## 7.5 Research and explainability experiment

A research project testing whether expressive visual abstractions help humans understand machine perception.

---

# 8. Recommended First Product

The first version should be:

> **A desktop browser prototype where the user uploads one image and watches it emerge as an animated 3D pin field.**

It should not initially support:

- live video,
- mobile,
- full neural network internals,
- arbitrary 3D scenes,
- complex editing,
- cloud collaboration,
- multiple users,
- real-time audio,
- generative video,
- custom model training.

The first proof must demonstrate one thing exceptionally well:

> An image begins as noisy pin activation and gradually resolves into a stable, recognizable, animated structure.

---

# 9. First Demonstration

The ideal first demo:

1. User uploads an image of a hand.
2. The field begins flat and noisy.
3. A saliency pulse identifies the hand region.
4. Pins under the hand begin to rise.
5. The depth shape forms.
6. Fingers become distinct.
7. Edges receive temporary glowing connections.
8. Uncertain background pins continue to fluctuate.
9. The hand becomes stable.
10. The user can rotate the camera.
11. A mode selector reveals the source maps:
    - depth,
    - saliency,
    - segmentation,
    - confidence,
    - composite.

This should look beautiful even if the AI outputs are imperfect.

---

# 10. System Architecture

```text
Input
  ├── Uploaded image
  ├── Camera frame
  └── Video frame sequence

        ↓

Vision Analysis Pipeline
  ├── Image normalization
  ├── Saliency estimation
  ├── Depth estimation
  ├── Segmentation
  ├── Edge detection
  ├── Feature extraction
  ├── Confidence estimation
  └── Optical flow for video

        ↓

Perception State Composer
  ├── Resampling to pin-grid resolution
  ├── Temporal smoothing
  ├── Object tracking
  ├── Region confidence
  ├── Connection candidate selection
  └── Pin target generation

        ↓

Pin Field Runtime
  ├── Pin height
  ├── Pin scale
  ├── Pin color
  ├── Pin glow
  ├── Pin noise
  ├── Pin velocity
  ├── Pin object ID
  └── Pin confidence

        ↓

Connection Runtime
  ├── Sparse graph edges
  ├── Activation pulses
  ├── Edge lifetimes
  ├── Region constraints
  └── Animated information flow

        ↓

Renderer
  ├── Three.js / WebGPU or WebGL
  ├── GPU instancing
  ├── Custom shaders
  ├── Postprocessing
  └── Camera and controls
```

---

# 11. Technical Stack

## Frontend

- React
- TypeScript
- Vite
- React Three Fiber
- Three.js
- `@react-three/drei`
- Zustand for runtime state
- Zod for schema validation
- GSAP for timelines and controlled transitions
- Web Workers for heavy CPU-side processing
- Optional WebGPU path later

## Backend

For the first prototype, avoid a backend unless a hosted model requires one.

If a backend is needed:

- Node.js
- Express
- TypeScript
- Python inference service only when required
- Docker
- PostgreSQL only when accounts, projects, or saved scenes are introduced

## Vision inference

Choose one of three approaches.

### Approach A — Client-side models

Best for privacy and fast experimentation.

Possible technologies:

- ONNX Runtime Web
- Transformers.js
- TensorFlow.js
- MediaPipe
- WebGPU inference

Benefits:

- No image upload to a server.
- Low operating cost.
- Immediate interaction after model load.

Tradeoffs:

- Large model downloads.
- Device performance varies.
- Limited model choices.
- Mobile may struggle.

### Approach B — Hosted inference API

Best for quickest prototype.

Flow:

1. Browser uploads image.
2. Backend forwards it to one or more inference models.
3. Backend returns normalized maps.
4. Browser renders the field.

Benefits:

- Stronger models.
- Easier model swapping.
- Consistent performance.

Tradeoffs:

- Cost.
- Latency.
- Privacy concerns.
- Requires backend.

### Approach C — Hybrid

Recommended after the first demo.

- Client handles edges, color, noise, and simple saliency.
- Server handles depth and segmentation.
- Browser performs all animation and rendering.

---

# 12. Recommended MVP Inference Strategy

For the first prototype:

1. Use one strong monocular depth model.
2. Use one segmentation model.
3. Derive saliency from segmentation confidence or a separate lightweight model.
4. Use edge detection locally.
5. Build confidence heuristically.
6. Do not implement optical flow until image mode works.

The first MVP does not need a language model.

A vision-language model can be added later for object naming and semantic narration.

---

# 13. Data Structures

## 13.1 Perception map bundle

```ts
export interface PerceptionMapBundle {
  width: number;
  height: number;
  depth: Float32Array;
  saliency: Float32Array;
  confidence: Float32Array;
  edges: Float32Array;
  segmentation: Uint16Array;
  color: Uint8Array;
  timestampMs?: number;
}
```

## 13.2 Pin state

```ts
export interface PinState {
  id: number;
  gridX: number;
  gridY: number;

  currentHeight: number;
  targetHeight: number;
  velocity: number;

  activation: number;
  confidence: number;
  saliency: number;
  edgeStrength: number;

  objectId: number;
  colorR: number;
  colorG: number;
  colorB: number;

  noiseAmplitude: number;
  stability: number;
}
```

## 13.3 Connection state

```ts
export interface ConnectionState {
  id: number;
  sourcePinId: number;
  targetPinId: number;

  strength: number;
  confidence: number;
  progress: number;
  lifetimeMs: number;

  type:
    | "structural"
    | "attention"
    | "motion"
    | "uncertain"
    | "rejected";
}
```

## 13.4 Perception frame

```ts
export interface PerceptionFrame {
  frameId: string;
  sourceWidth: number;
  sourceHeight: number;
  gridWidth: number;
  gridHeight: number;
  pins: PinState[];
  connections: ConnectionState[];
  objectCount: number;
  globalConfidence: number;
  generatedAt: number;
}
```

---

# 14. Pin Grid Design

## Grid size

Start with:

- 96 × 96 pins for normal machines.
- 64 × 64 fallback.
- 128 × 128 high-quality mode.

A 96 × 96 grid contains 9,216 pins.

This is enough to show recognizable shapes while remaining manageable with GPU instancing.

## Pin shape

Test three forms:

1. Cylinders.
2. Rounded capsules.
3. Thin rectangular rods.

Recommended starting form:

> Rounded vertical capsules with slightly reflective surfaces.

## Pin spacing

Pins should be close enough to appear like a continuous field but separated enough to remain individually visible.

## Height mapping

Example:

```text
pinHeight = minimumHeight
          + normalizedDepth × depthScale
          + saliency × emphasisScale
```

Depth direction may need inversion depending on the source model.

## Height behavior

Do not instantly assign final height.

Use damped spring motion:

```text
acceleration = stiffness × (target - current) - damping × velocity
```

This creates a physical emerging effect.

---

# 15. Confidence Behavior

Confidence is one of the project's strongest visual ideas.

## Low confidence

- pins vibrate,
- heights fluctuate,
- colors remain dim,
- connections appear briefly and disappear,
- edges remain blurry,
- local noise is high.

## Medium confidence

- pins begin forming a stable region,
- movement slows,
- some connections persist,
- color strengthens,
- object boundaries become visible.

## High confidence

- pins settle,
- height becomes precise,
- edges sharpen,
- key structural connections remain,
- noise nearly disappears,
- the shape becomes readable.

## Confidence formula

In early prototypes, confidence may be synthesized from:

- segmentation probability,
- depth consistency,
- edge agreement,
- saliency,
- local neighborhood similarity.

Example heuristic:

```text
confidence =
  0.35 × segmentationConfidence
+ 0.25 × localDepthConsistency
+ 0.20 × edgeAgreement
+ 0.20 × saliency
```

This is not a scientifically exact confidence score.

It is a rendering control signal.

---

# 16. Segmentation Behavior

Each segmented object receives:

- a stable object ID,
- a region color identity,
- a local pin cluster,
- a confidence value,
- optional connection rules.

The visualization should not simply color every object differently.

Instead:

- use subtle hue shifts,
- use stronger differences only in analysis mode,
- preserve a coherent visual art direction.

## Object emergence

Objects should not all appear simultaneously.

Possible order:

1. Highest saliency object.
2. Largest confident region.
3. Secondary objects.
4. Background structure.
5. Fine detail.

This creates a perception narrative.

---

# 17. Saliency Behavior

Saliency represents where the system appears to focus.

Visual options:

- expanding heat pulse,
- local pin glow,
- wave propagation,
- temporary elevation boost,
- radial connection burst,
- camera focus shift.

Saliency should guide attention without permanently changing the final geometry.

---

# 18. Depth Behavior

Depth controls form.

Possible mappings:

### Direct relief

Depth becomes pin height.

### Inverted relief

Closer objects rise higher.

### Centered depth

Depth values are centered around a neutral plane.

### Layered depth

Depth is quantized into layers for a more graphic aesthetic.

Start with direct or inverted relief and expose a toggle.

---

# 19. Edge Behavior

Edges should help the viewer recognize structure.

Possible edge treatments:

- brighter pin tips,
- taller edge pins,
- thin glowing lines,
- temporary contour tracing,
- traveling pulses around boundaries.

Avoid outlining every edge permanently.

Use edge animation during formation, then reduce it.

---

# 20. Motion and Optical Flow

Video mode comes after image mode.

For video:

- optical flow controls lateral pin movement,
- motion vectors create traveling waves,
- tracked objects preserve their pin clusters,
- confidence drops when tracking is lost,
- the field should not reset every frame.

## Temporal smoothing

Without smoothing, the pin board will flicker.

Use:

- exponential moving averages,
- object ID persistence,
- flow-based warping,
- hysteresis thresholds,
- delayed decay.

Example:

```text
smoothedValue =
  previousValue × 0.85
+ currentValue × 0.15
```

The exact coefficient should vary by signal.

---

# 21. Connection Graph Generation

The connection graph should be sparse.

## Candidate generation

For each active pin:

1. Find nearby pins.
2. Reject pins from unrelated segments.
3. Compare feature similarity.
4. Compare depth difference.
5. Compare edge orientation.
6. Compare confidence.
7. Score the connection.
8. Keep only the strongest few.

## Example score

```text
connectionScore =
  0.30 × segmentMatch
+ 0.20 × featureSimilarity
+ 0.15 × depthSimilarity
+ 0.15 × edgeAlignment
+ 0.10 × confidence
+ 0.10 × saliency
```

## Limits

- Maximum 2–4 active connections per pin.
- Maximum global connection count.
- Fade connections after a short lifetime.
- Use level-of-detail reduction on weaker devices.

---

# 22. Rendering Strategy

## GPU instancing

Render all pins as instanced geometry.

Do not create thousands of separate React components.

Use:

- `THREE.InstancedMesh`
- instance matrices,
- instance colors,
- shader attributes.

## Shader inputs

Per pin:

- height,
- activation,
- confidence,
- noise,
- object ID,
- edge strength,
- saliency.

## Shader behaviors

- tip glow,
- vertical gradient,
- heat coloration,
- confidence flicker,
- activation pulse,
- edge shimmer,
- subtle displacement.

## Connections

Possible rendering techniques:

- line segments,
- instanced tubes,
- screen-space curves,
- shader-generated arcs.

Start with simple line segments and traveling emissive pulses.

---

# 23. Visual States

## State 1 — Dormant

- flat board,
- near-dark,
- slight ambient movement.

## State 2 — Sensing

- random low-amplitude activity,
- scanning wave,
- unstable heat spots.

## State 3 — Hypothesis

- rough cluster appears,
- shape remains incomplete,
- uncertain links flicker.

## State 4 — Formation

- depth stabilizes,
- edges trace,
- object regions organize.

## State 5 — Recognition

- main object becomes readable,
- confidence rises,
- key connections persist.

## State 6 — Revision

- one region destabilizes,
- connections dissolve,
- pins reorganize.

## State 7 — Stable perception

- shape holds,
- motion becomes subtle,
- analysis controls become available.

---

# 24. Animation Timeline for One Image

Example 8-second sequence:

```text
0.0–0.8s  Board wakes with low noise
0.8–1.6s  Saliency pulse scans the field
1.6–2.8s  Main object region begins rising
2.8–4.0s  Depth structure forms
4.0–5.0s  Edges trace and temporary links appear
5.0–6.2s  Secondary regions emerge
6.2–7.2s  Confidence settles unstable areas
7.2–8.0s  Final shape holds with subtle motion
```

The sequence should adapt to image complexity.

---

# 25. User Experience

## Main screen

```text
+------------------------------------------------------+
| Logo | Upload | Camera | Modes | Settings            |
+------------------------------------------------------+
|                                                      |
|                 3D Perception Field                  |
|                                                      |
|                                                      |
+------------------------------------------------------+
| Timeline | Play/Pause | Reset | Map selector         |
+------------------------------------------------------+
```

## Main controls

- Upload image.
- Start camera.
- Play emergence.
- Pause.
- Scrub timeline.
- Rotate view.
- Reset field.
- Toggle connections.
- Toggle heat.
- Toggle depth.
- Toggle segmentation.
- Toggle confidence.
- Export still.
- Export video later.

## Analysis modes

- Composite.
- Depth.
- Saliency.
- Segmentation.
- Confidence.
- Edges.
- Connections.
- Motion.

---

# 26. Visual Art Direction

The interface should feel:

- scientific,
- mysterious,
- spatial,
- premium,
- alive,
- restrained,
- not cyberpunk,
- not a generic neural network animation.

## Suggested palette

Base:

- near-black navy,
- graphite,
- dark metallic gray.

Signal colors:

- cyan for activation,
- green for confidence,
- amber for uncertainty,
- magenta only for contradiction or revision.

Avoid rainbow heatmaps in the main artistic mode.

Offer scientific heatmaps only in analysis mode.

## Lighting

- soft directional top light,
- subtle rim lighting,
- low ambient fill,
- emissive pin tips,
- restrained bloom.

---

# 27. What Makes the Project Original

The originality is not just the pin board.

It is the combination of:

1. Persistent pin substrate.
2. Partial activation.
3. Selective neural-like connections.
4. Confidence-driven stability.
5. Perception emerging over time.
6. Revision rather than instant replacement.
7. Multiple vision maps fused into one animated spatial language.

This combination should be documented carefully.

Before public launch, consider:

- prior-art research,
- documenting development dates,
- preserving sketches and prototypes,
- discussing intellectual-property strategy with a qualified professional.

---

# 28. MVP Scope

## Required

- Image upload.
- One depth model.
- One segmentation model.
- Local edge extraction.
- Derived saliency.
- Derived confidence.
- 64×64 or 96×96 pin grid.
- Pin height animation.
- Confidence-based noise.
- Sparse connections.
- Composite mode.
- Debug modes.
- Camera controls.
- Replay.
- Performance meter.

## Excluded

- Video.
- Live camera.
- Accounts.
- Cloud projects.
- Payments.
- Collaboration.
- Language model narration.
- Generative images.
- Mobile app.
- VR.
- Physical hardware.
- Full research claims.

---

# 29. Development Phases

## Phase 0 — Concept validation

Deliverables:

- written visual language,
- sketches,
- animation storyboard,
- pin behavior rules,
- connection behavior rules.

Success condition:

> A designer or engineer can understand the concept without verbal explanation.

## Phase 1 — Pin field prototype

Build:

- flat pin grid,
- GPU instancing,
- camera,
- height texture,
- basic shader,
- spring animation.

Use a manually generated grayscale image as the depth map.

Success condition:

> A grayscale image forms a readable 3D relief.

## Phase 2 — Multi-map composer

Add:

- depth,
- edges,
- saliency,
- confidence,
- segmentation.

Success condition:

> Each map visibly changes the field in a distinct, understandable way.

## Phase 3 — Emergence timeline

Add:

- staged formation,
- controlled noise,
- saliency scan,
- edge tracing,
- stabilization.

Success condition:

> The shape appears to be discovered rather than simply loaded.

## Phase 4 — Connection graph

Add:

- sparse candidates,
- local region constraints,
- pulses,
- connection lifetimes,
- rejected hypotheses.

Success condition:

> Connections add meaning without obscuring the shape.

## Phase 5 — Real AI inference

Add real depth and segmentation models.

Success condition:

> A user can upload a normal photo and receive a convincing result.

## Phase 6 — Video and camera

Add:

- optical flow,
- object tracking,
- temporal smoothing,
- live updates.

Success condition:

> Moving objects deform the field smoothly without complete resets.

## Phase 7 — Productization

Add:

- export,
- presets,
- saved projects,
- onboarding,
- performance fallback,
- analytics.

---

# 30. First 14-Day Build Plan

## Days 1–2

- Create React + TypeScript project.
- Add React Three Fiber.
- Build a 64×64 instanced pin grid.
- Add orbit camera.
- Add per-pin height.

## Days 3–4

- Load a grayscale image.
- Map brightness to height.
- Add spring interpolation.
- Add basic lighting and material.

## Days 5–6

- Add saliency and confidence textures.
- Map confidence to jitter and stability.
- Add color heat.

## Days 7–8

- Add formation timeline.
- Add scanning wave.
- Add edge tracing.

## Days 9–10

- Add sparse connections.
- Add animated pulses.
- Add maximum connection limits.

## Days 11–12

- Connect a real depth model.
- Connect a segmentation model.
- Normalize outputs.

## Days 13–14

- Add upload UI.
- Add debug mode selector.
- Add replay.
- Optimize performance.
- Record first demo.

---

# 31. Performance Requirements

Target:

- 60 FPS on a modern laptop.
- 30 FPS minimum fallback.
- Initial grid: 64×64.
- Quality grid: 96×96.
- Avoid more than one heavy canvas.
- Avoid React state updates every frame.
- Use refs and GPU buffers.
- Process maps in Web Workers.
- Pause when tab is hidden.
- Respect reduced motion.
- Lower device pixel ratio on weak devices.

## Performance budget

- Pin draw calls: ideally 1–3.
- Connection draw calls: ideally 1–2.
- Texture resolution: no larger than required.
- Avoid dynamic geometry reconstruction each frame.
- Reuse buffers.

---

# 32. Failure Modes

## No recognizable depth

Fallback:

- use luminance relief,
- reduce depth scale,
- emphasize edges.

## Poor segmentation

Fallback:

- merge uncertain small regions,
- treat image as one object,
- display uncertainty instead of false precision.

## Too much visual noise

Fix:

- lower connection count,
- reduce bloom,
- reduce jitter,
- hide low-confidence pins.

## Shape appears instantly

Fix:

- stage map influence,
- delay confidence stabilization,
- animate saliency before depth.

## Visual looks like a music visualizer

Fix:

- tie every motion to a specific perception signal,
- remove decorative random movement,
- show debug maps during development.

## Neural connections obscure form

Fix:

- render only high-value edges,
- fade them quickly,
- use depth-aware opacity,
- keep most links near the surface.

---

# 33. Evaluation

The system must be evaluated as both technology and visual communication.

## Technical metrics

- FPS.
- Inference latency.
- Memory usage.
- Map processing time.
- Connection count.
- Upload-to-animation time.
- Temporal stability.

## Perceptual metrics

Ask users:

- Can you identify the object before the final state?
- Does the animation feel like perception forming?
- Do confidence changes feel understandable?
- Do connections feel meaningful?
- Is the final form readable?
- Is the visualization beautiful?
- Is it too noisy?
- Does it feel original?

## Success criteria for first public demo

- 80% of testers recognize the main object.
- Most testers describe the process as “forming,” “understanding,” or “discovering.”
- The field remains above 30 FPS on target hardware.
- The shape does not collapse into random visual noise.
- The connection layer improves the experience rather than distracting.

---

# 34. AI-Agent Working Rules

Any AI coding agent working on this project must follow these rules:

1. Do not rebuild the entire system in one prompt.
2. Work in vertical slices.
3. Preserve the project’s visual metaphor.
4. Do not replace the pin field with particles.
5. Do not replace perception signals with random animation.
6. Keep connections sparse.
7. Use GPU instancing.
8. Validate all map dimensions and ranges.
9. Separate inference from rendering.
10. Keep debug visualizations available.
11. Add performance measurements early.
12. Do not add accounts, payments, or unrelated product infrastructure to the prototype.
13. Document visual mappings in code.
14. Avoid hidden magic constants.
15. Use deterministic seeds for reproducible demos.
16. Test with several image types:
    - hand,
    - face,
    - object,
    - animal,
    - landscape,
    - cluttered scene.

---

# 35. Suggested Repository Structure

```text
perception-field/
  apps/
    web/
  packages/
    perception-schema/
    pin-runtime/
    connection-runtime/
    vision-adapters/
    shaders/
    config/
  assets/
    test-images/
    test-maps/
  docs/
    CONCEPT.md
    VISUAL_LANGUAGE.md
    ARCHITECTURE.md
    EVALUATION.md
```

For the very first prototype, a simpler structure is acceptable:

```text
src/
  components/
  field/
  shaders/
  vision/
  state/
  utils/
```

Do not create empty packages without a real need.

---

# 36. First Coding-Agent Prompt

```text
Build the first technical prototype for a project called Perception Field.

Perception Field is a real-time 3D visualization system inspired by a physical pin art board. A dense grid of pins forms the shape of an input image over time.

Use:
- React
- TypeScript
- Vite
- Three.js
- React Three Fiber
- @react-three/drei
- Zustand
- Zod

For this first slice, do not use any AI model yet.

Requirements:
1. Create a full-screen 3D scene with a 64×64 grid of vertical rounded pins.
2. Render the pins with THREE.InstancedMesh. Do not create one React component per pin.
3. Load a local grayscale depth-map image.
4. Map pixel brightness to each pin's target height.
5. Animate each pin from a flat board to its target height using damped spring motion.
6. Add orbit controls and a reset camera button.
7. Add a replay button that returns the board to flat and reforms the image.
8. Add simple lighting, subtle emissive pin tips, and restrained bloom.
9. Add a debug panel with:
   - depth scale,
   - spring stiffness,
   - damping,
   - grid spacing,
   - animation speed.
10. Show FPS and pin count.
11. Keep frame-by-frame animation outside React state.
12. Add graceful fallback if the depth image fails to load.
13. Keep the implementation modular and strongly typed.

The prototype is complete when a grayscale hand depth map forms a recognizable hand relief from a flat 3D pin board while maintaining smooth performance.
```

---

# 37. Second Coding-Agent Prompt

```text
Extend the Perception Field prototype with saliency, confidence, and edge maps.

Requirements:
1. Load three additional grayscale maps:
   - saliency
   - confidence
   - edges
2. Validate that all maps have identical dimensions.
3. Resample them to the pin-grid resolution.
4. Map saliency to temporary activation glow.
5. Map confidence to:
   - lower jitter at high confidence
   - higher jitter at low confidence
   - faster settling at high confidence
6. Map edges to brighter pin tips and temporary contour tracing.
7. Add a staged animation timeline:
   - dormant
   - sensing
   - hypothesis
   - formation
   - recognition
   - stable
8. Add a mode selector:
   - composite
   - depth
   - saliency
   - confidence
   - edges
9. Keep the final visual restrained and readable.
10. Do not add connections yet.

The slice is complete when the same pin field visibly communicates depth, attention, confidence, and boundaries without looking like random effects.
```

---

# 38. Third Coding-Agent Prompt

```text
Add a sparse neural-like connection layer to Perception Field.

Requirements:
1. Build connection candidates only between nearby pins.
2. Score candidates using:
   - same region
   - similar height
   - edge strength
   - confidence
   - saliency
3. Keep at most 3 active connections per pin.
4. Enforce a global maximum connection count.
5. Render connections efficiently in one or very few draw calls.
6. Support connection types:
   - structural
   - attention
   - uncertain
   - rejected
7. Animate traveling pulses along active connections.
8. Fade uncertain connections quickly.
9. Keep stable structural connections subtle.
10. Add a toggle for connections.
11. Add debug controls for threshold and connection density.
12. Ensure the shape remains readable with connections enabled.

The slice is complete when connections appear selectively during formation and make the field feel like an organizing perceptual network without becoming a web of visual clutter.
```

---

# 39. Future Directions

Possible future features:

- live camera mode,
- video interpretation,
- sound-reactive perception,
- text prompt influence,
- multi-sensory inputs,
- physical robotic pin board,
- VR mode,
- projection mapping,
- generative sculpture export,
- research mode,
- object comparison,
- model comparison,
- explainability overlays,
- semantic narration,
- SDK,
- installation mode,
- collaborative gallery.

---

# 40. Final Locked Decisions

For the first version:

- This is a separate project from Wanis.
- The product is a visual AI perception engine.
- The core metaphor is a physical 3D pin art board.
- Pins are the persistent perceptual substrate.
- Pin height represents depth.
- Segmentation organizes objects.
- Saliency directs attention.
- Confidence controls stability and noise.
- Optical flow will control motion later.
- Connections are sparse and selective.
- The visualization is expressive, not a literal neural-network diagram.
- The MVP starts with uploaded still images.
- The first prototype uses manually supplied maps before real AI inference.
- Three.js and GPU instancing power the visualization.
- Real AI models are added only after the visual language works.
- The first success is a recognizable shape emerging from noise and stabilizing over time.

---

# 41. North-Star Experience

> A user uploads an image. The board wakes as noise. Attention moves through the field. A rough shape rises. Connections appear only where structure is forming. Uncertain regions shake and dissolve. Depth settles. Edges sharpen. The system appears to discover the image rather than simply display it.

That experience is the project.
