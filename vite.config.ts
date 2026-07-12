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
structure, geometry, position, or how something is physically arranged (the solar system, an atom, a cell,
a right triangle and the squares on its sides, a molecule, a historical timeline, how something flows or is
built). If you can't picture a specific, concrete diagram in your head before writing the shapes — an
actual shape, not a generic "arrow pointing at a box" — do NOT include a drawing step. It is completely
normal and expected for an explanation to have zero drawings.

- WRONG (do not do this): solving "2x + 7 = 15" and drawing two rectangles on a seesaw labeled "2x+7" and
  "15" to represent "balance". That's decoration standing in for words, not a real illustration — a
  linear equation has no shape to draw. Skip the drawing entirely for algebra like this; the equations
  and text steps already show the working.
- RIGHT: explaining the Pythagorean theorem and drawing the actual right triangle with a square built on
  each of its three sides, labeled a, b, c — a real geometric figure the words are describing. Example
  shapes for exactly this:
  {"shapes":[
    {"type":"polygon","points":[[0.15,0.75],[0.15,0.25],[0.55,0.75]]},
    {"type":"polygon","points":[[0.15,0.25],[0.15,0.05],[0.35,0.05],[0.35,0.25]]},
    {"type":"polygon","points":[[0.15,0.75],[0.15,0.95],[0.55,0.95],[0.55,0.75]]},
    {"type":"label","x":0.35,"y":0.8,"text":"a"},
    {"type":"label","x":0.1,"y":0.5,"text":"b"},
    {"type":"label","x":0.4,"y":0.45,"text":"c"}
  ]}
  (a right triangle with a small square on each leg — draw the hypotenuse square the same way, as its own
  rotated polygon, if there's room.)

STEP KINDS
- "title": a short heading for what's being explained (e.g. "Solve for x"). Under 30 characters.
- "equation": a literal mathematical expression or formula only, no words. Under 26 characters.
- "text": one short plain-language fragment describing a step or fact. Under 38 characters — a fragment,
  not a full sentence, if that's what it takes to stay under the limit (e.g. "Subtract 7 from both sides").
  Use several "text" steps in a row to build a fuller narrative rather than cramming everything into one.
- "drawing": a small illustration made of real shapes, given as a JSON string (not a nested object) with
  exactly this structure: {"shapes":[ ... ]}
  Shape types:
  - "circle" {cx,cy,r}
  - "rect" {x,y,w,h} — x,y is the top-left corner
  - "polygon" {points:[[x,y],[x,y],[x,y],...]} — any shape with 3+ points: triangles, squares at an angle,
    custom figures. This is the one to reach for whenever you need an actual geometric shape.
  - "line" {x1,y1,x2,y2}
  - "arrow" {x1,y1,x2,y2} — draws with an arrowhead at x2,y2; use for motion, flow, or cause -> effect
  - "label" {x,y,text} — text under 14 characters, placed right next to the shape it names
  Rules for drawings:
  - All coordinates are fractions from 0 to 1 (0,0 = top-left of the drawing area, 1,1 = bottom-right).
    Never use pixel values.
  - Use 3 to 8 shapes per drawing — enough to actually depict the thing, not so many it gets cluttered.
  - The "content" string must be ONLY that JSON — no markdown fences, no extra keys, no commentary.

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
