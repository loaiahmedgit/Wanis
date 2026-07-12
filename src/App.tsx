import { useEffect, useMemo, useState } from "react";
import { Scene } from "./components/Scene";
import { DebugPanel } from "./components/DebugPanel";
import { Toolbar } from "./components/Toolbar";
import { getExplanationPlan } from "./explain/getExplanationPlan";
import { DEFAULT_PROMPT } from "./explain/examples";
import { layoutPlan } from "./field/layout";
import type { ExplanationPlan } from "./explain/types";
import { useFieldStore } from "./state/store";
import "./App.css";

export default function App() {
  const gridWidth = useFieldStore((s) => s.gridWidth);
  const gridHeight = useFieldStore((s) => s.gridHeight);
  const planToken = useFieldStore((s) => s.planToken);
  const requestNewPlan = useFieldStore((s) => s.requestNewPlan);

  const [promptInput, setPromptInput] = useState(DEFAULT_PROMPT);
  const [plan, setPlan] = useState<ExplanationPlan | null>(null);
  const [isThinking, setIsThinking] = useState(false);

  async function runPrompt(prompt: string) {
    setIsThinking(true);
    const nextPlan = await getExplanationPlan(prompt);
    setPlan(nextPlan);
    setIsThinking(false);
    requestNewPlan();
  }

  // Show something immediately on load.
  useEffect(() => {
    runPrompt(DEFAULT_PROMPT);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const steps = useMemo(
    () => (plan ? layoutPlan(plan, gridWidth, gridHeight) : []),
    [plan, gridWidth, gridHeight],
  );

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!promptInput.trim() || isThinking) return;
    runPrompt(promptInput);
  }

  return (
    <div className="app-root">
      {steps.length > 0 && (
        <Scene steps={steps} gridWidth={gridWidth} gridHeight={gridHeight} planToken={planToken} />
      )}

      <form className="prompt-bar" onSubmit={handleSubmit}>
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

      <div className="hud">
        <div className="hud-title">
          <span className="hud-dot" />
          Perception Field <span className="hud-phase">— explanation-board prototype</span>
        </div>
        <DebugPanel />
        <Toolbar pinCount={gridWidth * gridHeight} />
      </div>
    </div>
  );
}
