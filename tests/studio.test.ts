import { beforeEach, describe, expect, it } from "vitest";
import { clearExpiredAuth } from "../src/authSession";
import { applyTheme, initialTheme } from "../src/theme";
beforeEach(() => localStorage.clear());
describe("studio preferences and revoked-session recovery", () => {
  it("persists light/dark preference across a new initialization", () => {
    expect(initialTheme()).toBe("light");
    applyTheme("dark");
    expect(document.documentElement.dataset.theme).toBe("dark");
    expect(initialTheme()).toBe("dark");
    applyTheme("light");
    expect(initialTheme()).toBe("light");
  });
  it("clears only the expired project's credentials and preserves draft work", () => {
    const key = "sb-tsnwowlyrlxpwwetmxns-auth-token";
    for (
      const name of [
        key,
        `${key}-code-verifier`,
        "crewcanvas.board-draft.synthetic",
        "sb-other-auth-token",
      ]
    ) localStorage.setItem(name, "retained");
    clearExpiredAuth(localStorage, "https://tsnwowlyrlxpwwetmxns.supabase.co");
    expect(localStorage.getItem(key)).toBeNull();
    expect(localStorage.getItem(`${key}-code-verifier`)).toBeNull();
    expect(localStorage.getItem("crewcanvas.board-draft.synthetic")).toBe(
      "retained",
    );
    expect(localStorage.getItem("sb-other-auth-token")).toBe("retained");
  });
});
