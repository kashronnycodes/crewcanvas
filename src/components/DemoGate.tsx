import { useState, type ReactNode } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { demoSession, saveDemoSession } from "../demoSession";
import { setDemoActor } from "../services";
import { useTheme } from "../theme";
import DemoAccounts from "./DemoAccounts";

export default function DemoGate({ children }: { children: (signOut: () => void) => ReactNode }) {
  const cache = useQueryClient();
  const [actor, setActor] = useState(() => {
    const id = demoSession();
    if (id) setDemoActor(id);
    return id;
  });
  const [error, setError] = useState("");
  const [theme, toggleTheme] = useTheme();
  function select(id: string | null) {
    try {
      saveDemoSession(id);
      if (id) setDemoActor(id);
      cache.removeQueries({ queryKey: ["workspace"] });
      setActor(id);
    } catch {
      setError("Browser storage is unavailable. Enable storage to explore the demo.");
    }
  }
  if (actor) return <>{children(() => select(null))}</>;
  return <div className="login-screen">
    <div className="brand">✦ CrewCanvas</div>
    <div className="login-card">
      <span className="eyebrow">A SPACE FOR GOOD WORK</span>
      <h1>Make yourself at home.</h1>
      <p>Clear agreements. Connected people. Room to create.</p>
      <DemoAccounts onSelect={select} />
      {error && <p role="alert">{error}</p>}
      <div className="demo-footer-actions">
        <a href="/">Back to CrewCanvas</a>
        <button className="button secondary" onClick={toggleTheme}>Switch to {theme === "light" ? "dark" : "light"} mode</button>
      </div>
    </div>
    <span className="login-footer">A little structure. A lot of possibility.</span>
  </div>;
}
