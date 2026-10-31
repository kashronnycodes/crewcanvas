import { type ReactNode, useEffect, useRef, useState } from "react";
import { Maximize2, Minimize2 } from "lucide-react";
export default function FocusCanvas({ children }: { children: ReactNode }) {
  const target = useRef<HTMLDivElement>(null);
  const [full, setFull] = useState(false);
  useEffect(() => {
    const escape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setFull(false);
    };
    const sync = () => {
      if (!document.fullscreenElement) setFull(false);
    };
    const exit = () => {
      setFull(false);
      if (document.fullscreenElement) {
        void document.exitFullscreen().catch(() => {});
      }
    };
    document.addEventListener("keydown", escape);
    document.addEventListener("fullscreenchange", sync);
    document.addEventListener("crewcanvas:exit-focus", exit);
    return () => {
      document.removeEventListener("keydown", escape);
      document.removeEventListener("fullscreenchange", sync);
      document.removeEventListener("crewcanvas:exit-focus", exit);
    };
  }, []);
  async function toggle() {
    if (full) {
      if (document.fullscreenElement) {
        await document.exitFullscreen().catch(() => {});
      }
      setFull(false);
    } else {
      setFull(true);
      await target.current?.requestFullscreen?.().catch(
        () => {/* Fixed viewport fallback. */},
      );
    }
  }
  return (
    <div ref={target} className={`focus-canvas ${full ? "is-fullscreen" : ""}`}>
      {children}
      <button
        className="focus-toggle"
        aria-label={full ? "Exit fullscreen" : "Fullscreen canvas"}
        title={full ? "Exit fullscreen · Escape" : "Fullscreen canvas"}
        onClick={() =>
          void toggle()}
      >
        {full ? <Minimize2 size={17} /> : <Maximize2 size={17} />}
      </button>
    </div>
  );
}
