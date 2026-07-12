export interface ModelOption {
  id: string;
  label: string;
  provider: "gemini" | "groq";
}

export const MODEL_OPTIONS: ModelOption[] = [
  { id: "gemini-flash-lite-latest", label: "Gemini Flash Lite (fast, free)", provider: "gemini" },
  { id: "gemini-flash-latest", label: "Gemini Flash", provider: "gemini" },
  { id: "llama-3.3-70b-versatile", label: "Groq Llama 3.3 70B", provider: "groq" },
  { id: "llama-3.1-8b-instant", label: "Groq Llama 3.1 8B (fastest)", provider: "groq" },
];

export const DEFAULT_MODEL_ID = MODEL_OPTIONS[0].id;
