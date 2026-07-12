import { useEffect, useState } from "react";
import { Board } from "./components/Board";
import { getExplanationPlan } from "./explain/getExplanationPlan";
import { DEFAULT_PROMPT } from "./explain/examples";
import { MODEL_OPTIONS, DEFAULT_MODEL_ID } from "./explain/models";
import { loadHandFonts } from "./explain/handFonts";
import type { ExplanationPlan } from "./explain/types";
import "./App.css";

export default function App() {
  const [promptInput, setPromptInput] = useState(DEFAULT_PROMPT);
  const [modelId, setModelId] = useState(DEFAULT_MODEL_ID);
  const [plan, setPlan] = useState<ExplanationPlan | null>(null);
  const [planToken, setPlanToken] = useState(0);
  const [isThinking, setIsThinking] = useState(false);
  const [fontsReady, setFontsReady] = useState(false);

  async function runPrompt(prompt: string) {
    setIsThinking(true);
    const nextPlan = await getExplanationPlan(prompt, modelId);
    setPlan(nextPlan);
    setPlanToken((t) => t + 1);
    setIsThinking(false);
  }

  useEffect(() => {
    loadHandFonts().then(() => setFontsReady(true));
    runPrompt(DEFAULT_PROMPT);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!promptInput.trim() || isThinking) return;
    runPrompt(promptInput);
  }

  return (
    <div className="app-root">
      <div className="board-wrap">
        {plan && fontsReady ? (
          <Board steps={plan.steps} planToken={planToken} />
        ) : (
          <p className="loading">Thinking…</p>
        )}
      </div>

      <form className="prompt-bar" onSubmit={handleSubmit}>
        <select
          className="model-picker"
          value={modelId}
          onChange={(e) => setModelId(e.target.value)}
          disabled={isThinking}
        >
          {MODEL_OPTIONS.map((m) => (
            <option key={m.id} value={m.id}>
              {m.label}
            </option>
          ))}
        </select>
        <input
          type="text"
          value={promptInput}
          onChange={(e) => setPromptInput(e.target.value)}
          placeholder="Ask Wanis to explain something…"
          disabled={isThinking}
        />
        <button type="submit" disabled={isThinking}>
          {isThinking ? "Thinking…" : "Explain"}
        </button>
      </form>
    </div>
  );
}
