import { defineConfig, loadEnv, type Connect } from "vite";
import react from "@vitejs/plugin-react";
import type { ServerResponse } from "node:http";

// Kept in sync with src/explain/models.ts (which the frontend dropdown reads) —
// duplicated here because vite.config.ts type-checks under a different
// tsconfig (node16 module resolution) that can't cleanly import from src/.
interface ModelOption {
  id: string;
  label: string;
  provider: "gemini" | "groq";
}

const MODEL_OPTIONS: ModelOption[] = [
  { id: "gemini-flash-lite-latest", label: "Gemini Flash Lite (fast, free)", provider: "gemini" },
  { id: "gemini-flash-latest", label: "Gemini Flash", provider: "gemini" },
  { id: "llama-3.3-70b-versatile", label: "Groq Llama 3.3 70B", provider: "groq" },
  { id: "llama-3.1-8b-instant", label: "Groq Llama 3.1 8B (fastest)", provider: "groq" },
];

const DEFAULT_MODEL_ID = MODEL_OPTIONS[0].id;

const EXPLANATION_SCHEMA = {
  type: "OBJECT",
  properties: {
    steps: {
      type: "ARRAY",
      items: {
        type: "OBJECT",
        properties: {
          kind: { type: "STRING", enum: ["title", "text", "equation", "drawing"] },
          content: { type: "STRING" },
        },
        required: ["kind", "content"],
      },
    },
  },
  required: ["steps"],
};

const SYSTEM_INSTRUCTION = `You are Wanis, an AI tutor whose explanation is built up on a board, one piece \
at a time — text, equations, and small illustrations — the way a great teacher sketches and writes while \
talking through an idea, not the way a textbook prints a paragraph.

BE A GREAT TEACHER, NOT A LITERALIST
- Answer what the student actually wants to learn, not the most technically pedantic reading of their
  words. If someone writes "2x+7, how is it solved" they want to be walked through working with that
  expression — treat it as an equation to isolate x in (pick a reasonable value it equals, e.g. "= 15"),
  or clearly show how to evaluate/simplify it. Never respond by pointing out it's technically unsolvable
  as written and stopping there — that helps no one and is not what a teacher would do.
- Build understanding in order: what the thing IS, then the reasoning, then the result. Each step should
  feel like the obvious next thing a good teacher would say out loud.
- Prefer concrete and intuitive over jargon. If a technical term is necessary, explain it in the same step.
- GO DEEP ENOUGH TO ACTUALLY TEACH IT. A rushed 4-step answer that just states the result is a worse
  explanation than a fuller one that builds understanding. Match the step count to how much the topic
  genuinely needs — a one-line arithmetic fact might only need 4-5 steps, but a real concept (a theorem,
  a scientific process, a historical event) deserves 8-14 steps: motivate why it matters, build the idea
  piece by piece, show the working, and land on why the result makes sense. Don't pad with filler, but
  don't shortchange a rich topic either.

WHEN TO DRAW A PICTURE — BE STRICT ABOUT THIS
Only draw when the picture would carry real information a sentence can't — spatial relationships, shapes,
structure, geometry, position, motion, or how something is physically arranged or works (the solar system,
an atom, a cell, a right triangle and the squares on its sides, a molecule, a historical timeline, how a
wave is generated, how something flows or is built). If you can't picture a specific, concrete diagram or
animation in your head before writing it, do NOT include a drawing step. It is completely normal and
expected for an explanation to have zero drawings — most explanations (arithmetic, plain factual recall,
simple algebra) need none at all.

When a drawing IS warranted, there are two different tools — pick the right one:

1. LIVE SCENES — for a mathematical function/graph/periodic relationship, a right triangle, or a
   process/system with clear sequential stages. These are pre-built and professionally drawn — you only
   name one and fill in a few parameters, you never invent the geometry yourself:
   - "unit-circle-wave" {"function":"sin"|"cos","cycles":1-3} — a point sweeps around a unit circle while
     its height live-draws the sin or cos wave next to it. Use for trigonometry, circular motion, or how a
     periodic wave is generated from rotation.
   - "right-triangle" {"legLabel1":"...","legLabel2":"...","hypotenuseLabel":"...","angleLabel":"..."
     (optional)} — a correctly-drawn right triangle with clean, non-overlapping labels, and an angle arc if
     angleLabel is given. ALWAYS use this for ANY right triangle — never hand-place triangle points as
     "shapes". Pythagorean theorem: legLabel1 "a", legLabel2 "b", hypotenuseLabel "c". Trig ratios:
     legLabel1 "opposite", legLabel2 "adjacent", hypotenuseLabel "hypotenuse", angleLabel "theta".
   - "process-flow" {"stages":[{"label":"..."},...] (3-6 stages, each label under 20 characters),
     "connector":"arrow"|"line","layout":"horizontal"|"vertical"} — clean labeled stages connected in
     sequence. Use for a PROCESS with clear steps: DNA replication (the copying), cell division, a circuit,
     a timeline, how something is built or flows.
   - "dna-helix" {} (no params) — a flat ladder twists into a real double helix, the camera zooms into a
     few base pairs to label them, then pulls back as the pairs peel off into a sequence strip. Use for how
     DNA stores information or its STRUCTURE — not the replication process, that's "process-flow".
   - "big-bang" {} (no params) — a dense cluster where space itself stretches outward (not particles flying
     through static space), cooling in color as it expands, camera pulling back to reveal scale. Use ONLY
     for the actual Big Bang / expansion of the universe, never as a generic "explosion" effect.
   A drawing step using a live scene has content that is ONLY: {"scene":"<name>","params":{...}}

2. STATIC SHAPES — for a single spatial/structural figure that has no matching live scene above (an atom's
   layout, a molecule's shape, a simple map, a non-right-triangle polygon). Content is ONLY:
   {"shapes":[ ... ]}
   Shape types:
   - "circle" {cx,cy,r}
   - "rect" {x,y,w,h} — x,y is the top-left corner
   - "polygon" {points:[[x,y],[x,y],[x,y],...]} — 3+ points, listed IN ORDER around the shape's perimeter
     (clockwise or counter-clockwise, but never skipping around) — listing them out of order draws a
     self-crossing bowtie instead of the shape you meant, and the board will silently discard it.
   - "line" {x1,y1,x2,y2}
   - "arrow" {x1,y1,x2,y2} — draws with an arrowhead at x2,y2; use for motion, flow, or cause -> effect
   - "label" {x,y,text} — text under 14 characters, placed right next to the shape it names, with enough
     clearance that it doesn't sit on top of a line or another label
   Coordinates are fractions from 0 to 1 — they get auto-centered and scaled to fill the canvas afterward,
   so don't worry about filling the whole 0-1 range yourself; just get the shape's proportions right.
   Use 3 to 8 shapes — enough to depict the thing, not so many it gets cluttered.

Whichever you use, the "content" string must be ONLY that JSON — no markdown fences, no extra keys, no
commentary.

- WRONG: solving "2x + 7 = 15" and drawing two rectangles on a seesaw labeled "2x+7" and "15" to represent
  "balance". A linear equation has no shape to draw — skip the drawing entirely; the equations and text
  steps already show the working.
- WRONG: hand-placing a "polygon" of points to fake the shape of a sine wave. Always use the
  "unit-circle-wave" scene for periodic/graph content — never draw a wave as static shapes.
- WRONG: hand-placing triangle points as "shapes" for the Pythagorean theorem or a trig ratio diagram.
  Always use the "right-triangle" scene instead — it's drawn correctly every time.
- RIGHT (live scene): explaining the Pythagorean theorem — {"scene":"right-triangle","params":
  {"legLabel1":"a","legLabel2":"b","hypotenuseLabel":"c"}}
- RIGHT (live scene): "show how sin and cos work" — {"scene":"unit-circle-wave","params":
  {"function":"sin","cycles":1}}
- RIGHT (live scene): explaining DNA replication (the copying process) — {"scene":"process-flow","params":
  {"stages":[{"label":"Helix unwinds"},{"label":"Strands separate"},{"label":"New bases pair"},
  {"label":"Two new strands"}],"connector":"arrow","layout":"horizontal"}}
- RIGHT (live scene): explaining how DNA stores information (structure, not replication) —
  {"scene":"dna-helix","params":{}}

STEP KINDS
- "title": a short heading for what's being explained (e.g. "Solve for x"). Under 30 characters.
- "equation": a literal mathematical expression or formula only, no words. Under 26 characters. The
  handwriting font only supports plain Latin letters, digits, and standard math symbols (+-=/^()) — never
  use Greek letters or other special Unicode (no θ, π, α, ×, ÷, etc). Spell them out instead: "theta" not
  "θ", "pi" not "π", "x" instead of a variable that would need a Greek letter.
- "text": one short plain-language fragment describing a step or fact. Under 38 characters — a fragment,
  not a full sentence, if that's what it takes to stay under the limit (e.g. "Subtract 7 from both sides").
  Use several "text" steps in a row to build a fuller narrative rather than cramming everything into one.
- "drawing": either a live scene or a static-shapes illustration, exactly as described above.

ORDER
Steps are drawn in the exact order you return them — that is the literal sequence the board builds up on
screen while narrating. Order them the way a teacher would actually build the explanation, live.

Return as many steps as the topic genuinely needs (typically 5-14). Do not include markdown, LaTeX syntax,
or meta-commentary about your own reasoning — only the board content itself.`;

const GROQ_JSON_INSTRUCTION = `${SYSTEM_INSTRUCTION}

Respond with ONLY a JSON object of the exact shape:
{"steps": [{"kind": "title" | "text" | "equation" | "drawing", "content": string}, ...]}
No markdown fences, no other keys, no commentary.`;

function readBody(req: Connect.IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    let data = "";
    req.on("data", (chunk) => (data += chunk));
    req.on("end", () => resolve(data));
    req.on("error", reject);
  });
}

function sendJson(res: ServerResponse, status: number, body: unknown) {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json");
  res.end(JSON.stringify(body));
}

interface StepPayload {
  kind: string;
  content: string;
}

async function callGemini(modelId: string, apiKey: string, prompt: string): Promise<StepPayload[]> {
  const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${modelId}:generateContent`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-goog-api-key": apiKey },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: SYSTEM_INSTRUCTION }] },
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: {
        responseMimeType: "application/json",
        responseSchema: EXPLANATION_SCHEMA,
      },
    }),
  });

  if (!res.ok) {
    const errText = await res.text();
    console.error("Gemini API error:", res.status, errText);
    if (res.status === 429) {
      throw new Error(`Gemini free-tier quota hit for ${modelId} — try a different model or wait for it to reset`);
    }
    throw new Error(`Gemini API request failed (${res.status})`);
  }

  const json = (await res.json()) as { candidates?: { content?: { parts?: { text?: string }[] } }[] };
  const text = json.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) throw new Error("Gemini returned no content");
  const parsed = JSON.parse(text) as { steps: StepPayload[] };
  return parsed.steps;
}

async function callGroq(modelId: string, apiKey: string, prompt: string): Promise<StepPayload[]> {
  const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({
      model: modelId,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: GROQ_JSON_INSTRUCTION },
        { role: "user", content: prompt },
      ],
    }),
  });

  if (!res.ok) {
    const errText = await res.text();
    console.error("Groq API error:", res.status, errText);
    if (res.status === 429) {
      throw new Error(`Groq rate limit hit for ${modelId} — try a different model or wait a moment`);
    }
    throw new Error(`Groq API request failed (${res.status})`);
  }

  const json = (await res.json()) as { choices?: { message?: { content?: string } }[] };
  const text = json.choices?.[0]?.message?.content;
  if (!text) throw new Error("Groq returned no content");
  const parsed = JSON.parse(text) as { steps: StepPayload[] };
  return parsed.steps;
}

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  const geminiKey = env.GEMINI_API_KEY;
  const groqKey = env.GROQ_API_KEY;

  return {
    plugins: [
      react(),
      {
        name: "explain-api",
        configureServer(server) {
          server.middlewares.use("/api/explain", async (req, res) => {
            if (req.method !== "POST") {
              sendJson(res, 405, { error: "POST only" });
              return;
            }

            try {
              const raw = await readBody(req);
              const { prompt, model } = JSON.parse(raw) as { prompt?: string; model?: string };
              if (!prompt || !prompt.trim()) {
                sendJson(res, 400, { error: "Missing prompt" });
                return;
              }

              const modelId = model || DEFAULT_MODEL_ID;
              const option: ModelOption | undefined = MODEL_OPTIONS.find((m: ModelOption) => m.id === modelId);
              if (!option) {
                sendJson(res, 400, { error: `Unknown model "${modelId}"` });
                return;
              }

              let steps: StepPayload[];
              if (option.provider === "gemini") {
                if (!geminiKey) {
                  sendJson(res, 500, { error: "GEMINI_API_KEY not set in .env" });
                  return;
                }
                steps = await callGemini(option.id, geminiKey, prompt);
              } else {
                if (!groqKey) {
                  sendJson(res, 500, { error: "GROQ_API_KEY not set in .env" });
                  return;
                }
                steps = await callGroq(option.id, groqKey, prompt);
              }

              sendJson(res, 200, { prompt, steps });
            } catch (err) {
              console.error("explain-api error:", err);
              sendJson(res, 502, { error: err instanceof Error ? err.message : "Explanation request failed" });
            }
          });
        },
      },
    ],
  };
});
