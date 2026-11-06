import { DEMO_ACCOUNTS } from "../shared/publicDemo";

export const publicDemo = new URLSearchParams(window.location.search).get("demo") === "1";
const sessionKey = "crewcanvas.public-demo.actor.v1";
export function demoSession(): string | null {
  try {
  const account = new URLSearchParams(window.location.search).get("account");
  const requested = DEMO_ACCOUNTS.find((a) => a.key === account)?.id;
  if (requested) {
    sessionStorage.setItem(sessionKey, requested);
    window.history.replaceState({}, "", "/?demo=1");
  }
  const saved = requested ?? sessionStorage.getItem(sessionKey);
  return DEMO_ACCOUNTS.some((a) => a.id === saved) ? saved : null;
  } catch { return null; }
}
export function saveDemoSession(id: string | null) {
  if (id) sessionStorage.setItem(sessionKey, id);
  else sessionStorage.removeItem(sessionKey);
}
