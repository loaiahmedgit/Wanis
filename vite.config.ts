import { defineConfig, loadEnv, type Connect } from "vite";
import react from "@vitejs/plugin-react";
import type { ServerResponse } from "node:http";

// "gemini-2.5-flash" returns 404 for this key ("no longer available to new
// users" per Gemini's own error) — using the rolling "-latest" alias instead,
// which is also what the user's own AI Studio quickstart curl example used.
const GEMINI_MODEL = "gemini-flash-latest";

const EXPLANATION_SCHEMA = {
  type: "OBJECT",
  properties: {
    steps: {
      type: "ARRAY",
      items: {
        type: "OBJECT",
        properties: {
          kind: { type: "STRING", enum: ["title", "text", "equation"] },
          content: { type: "STRING" },
        },
        required: ["kind", "content"],
      },
    },
  },
  required: ["steps"],
};

const SYSTEM_INSTRUCTION = `You are Wanis, an AI tutor whose explanation is drawn, one short line at a time, \
onto a small pin board — not read as a paragraph. Given a student's question, return an ordered sequence \
of 3 to 7 board lines that walk through the explanation step by step, the way a teacher would write on a \
real board while talking.

Rules for each line's "content":
- Keep it SHORT: under 40 characters, ideally under 30. It must fit on one line with no wrapping.
- kind "title": a short heading for what's being explained (e.g. "Solve for x").
- kind "equation": a literal mathematical expression or formula, nothing else.
- kind "text": a short plain-language sentence fragment describing one step or fact.
- Order matters: this is the exact sequence the board will draw in.
- Do not include markdown, LaTeX syntax, or explanations of your own reasoning — only the board content itself.`;

/** Reads the whole request body as text. */
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

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  const apiKey = env.GEMINI_API_KEY;

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
            if (!apiKey) {
              sendJson(res, 500, { error: "GEMINI_API_KEY not set in .env" });
              return;
            }

            try {
              const raw = await readBody(req);
              const { prompt } = JSON.parse(raw) as { prompt?: string };
              if (!prompt || !prompt.trim()) {
                sendJson(res, 400, { error: "Missing prompt" });
                return;
              }

              const geminiRes = await fetch(
                `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`,
                {
                  method: "POST",
                  headers: {
                    "Content-Type": "application/json",
                    "X-goog-api-key": apiKey,
                  },
                  body: JSON.stringify({
                    systemInstruction: { parts: [{ text: SYSTEM_INSTRUCTION }] },
                    contents: [{ parts: [{ text: prompt }] }],
                    generationConfig: {
                      responseMimeType: "application/json",
                      responseSchema: EXPLANATION_SCHEMA,
                    },
                  }),
                },
              );

              if (!geminiRes.ok) {
                const errText = await geminiRes.text();
                console.error("Gemini API error:", geminiRes.status, errText);
                sendJson(res, 502, { error: "Gemini API request failed" });
                return;
              }

              const geminiJson = (await geminiRes.json()) as {
                candidates?: { content?: { parts?: { text?: string }[] } }[];
              };
              const text = geminiJson.candidates?.[0]?.content?.parts?.[0]?.text;
              if (!text) {
                sendJson(res, 502, { error: "Gemini returned no content" });
                return;
              }

              const parsed = JSON.parse(text) as { steps: { kind: string; content: string }[] };
              sendJson(res, 200, { prompt, steps: parsed.steps });
            } catch (err) {
              console.error("explain-api error:", err);
              sendJson(res, 500, { error: "Internal error generating explanation" });
            }
          });
        },
      },
    ],
  };
});
