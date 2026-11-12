import { Maximize2, Minimize2 } from "lucide-react";
import { type ReactNode, useCallback, useEffect, useRef, useState } from "react";

export default function FocusCanvas({ children }: { children: ReactNode }) {
  const target = useRef<HTMLDivElement>(null);
  const [full, setFull] = useState(false);
  const exit = useCallback(async () => {
    if (document.fullscreenElement === target.current) {
      await document.exitFullscreen().catch(() => {});
    }
    setFull(!!target.current && document.fullscreenElement === target.current);
  }, []);

  useEffect(() => {
    const escape = (event: KeyboardEvent) => {
      if (!event.defaultPrevented && event.key === "Escape" && target.current?.matches(".is-fullscreen, :fullscreen")) {
        // Exit only this fullscreen surface, retaining surrounding dialogs/drafts.
        event.preventDefault();
        event.stopImmediatePropagation();
        void exit();
      }
    };
    const sync = () => setFull(!!target.current && document.fullscreenElement === target.current);
    const close = () => void exit();
    document.addEventListener("keydown", escape, true);
    document.addEventListener("fullscreenchange", sync);
    document.addEventListener("crewcanvas:exit-focus", close);
    return () => {
      document.removeEventListener("keydown", escape, true);
      document.removeEventListener("fullscreenchange", sync);
      document.removeEventListener("crewcanvas:exit-focus", close);
    };
  }, [exit]);

  async function toggle() {
    if (full) return exit();
    setFull(true);
    try {
      await target.current?.requestFullscreen?.();
    } catch {
      // Keep the same mounted board in the fixed viewport fallback.
    }
  }

  return (
    <div ref={target} className={`focus-canvas ${full ? "is-fullscreen" : ""}`}>
      {children}
      <button
        className="focus-toggle"
        aria-label={full ? "Exit fullscreen" : "Fullscreen canvas"}
        title={full ? "Exit fullscreen · Escape" : "Fullscreen canvas"}
        onClick={() => void toggle()}
      >
        {full ? <Minimize2 size={17} /> : <Maximize2 size={17} />}
      </button>
    </div>
  );
}
