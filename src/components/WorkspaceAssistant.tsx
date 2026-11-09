import { useState } from "react";
import type { WorkspaceAnswer, WorkspaceSnapshot } from "../../shared/types";
import { answerWorkspace, inferIntent } from "../../shared/workspace";
import { api, mode } from "../services";

export default function WorkspaceAssistant(
  { snapshot }: { snapshot: WorkspaceSnapshot },
) {
  const [text, setText] = useState("");
  const [answer, setAnswer] = useState<WorkspaceAnswer | null>(null);
  const [busy, setBusy] = useState(false), [error, setError] = useState("");
  return (
    <details className="studio-assistant">
      <summary>✦ Workspace AI · progress, payments and next steps</summary>
      <form
        className="button-row"
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          setError("");
          try {
            setAnswer(
              mode === "demo"
                ? answerWorkspace(snapshot, inferIntent(text), "demo")
                : await api("ai/workspace", { text }),
            );
          } catch (err) {
            setError((err as Error).message);
          } finally {
            setBusy(false);
          }
        }}
      >
        <label className="assistant-question">
          Ask about your workspace<input
            aria-label="Workspace AI question"
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="What needs my attention?"
            required
            maxLength={2000}
          />
        </label>
        <button className="button secondary" disabled={busy}>
          {busy ? "Thinking…" : "Ask workspace AI"}
        </button>
      </form>
      {error && <p role="alert" className="error-message">{error}</p>}
      {answer && (
        <div className="project-ai-answer" role="status">
          <strong>
            {answer.mode === "demo"
              ? "Simulated demo response"
              : "Workspace AI"}
          </strong>
          <p>{answer.text}</p>
          <small>
            Advisory only. Scope, approval and payment records remain
            authoritative.
          </small>
        </div>
      )}
    </details>
  );
}
