import { type ReactNode, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

// Portal menus stay above both floating selection actions and clipped canvases.
export default function ToolPopover(
  { label, icon, children }: {
    label: string;
    icon: ReactNode;
    children: ReactNode;
  },
) {
  const anchor = useRef<HTMLButtonElement>(null),
    menu = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState<
    { left: number; top: number } | null
  >(null);
  useEffect(() => {
    if (!position) return;
    const dismiss = (event: PointerEvent) => {
      if (
        !anchor.current?.contains(event.target as globalThis.Node) &&
        !menu.current?.contains(event.target as globalThis.Node)
      ) setPosition(null);
    };
    const keyboard = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        setPosition(null);
        anchor.current?.focus();
      }
    };
    const close = () => setPosition(null);
    document.addEventListener("pointerdown", dismiss);
    document.addEventListener("keydown", keyboard);
    window.addEventListener("resize", close);
    menu.current?.querySelector("button")?.focus();
    return () => {
      document.removeEventListener("pointerdown", dismiss);
      document.removeEventListener("keydown", keyboard);
      window.removeEventListener("resize", close);
    };
  }, [position]);
  return (
    <span className="tool-popover">
      <button
        ref={anchor}
        title={label}
        aria-label={label}
        aria-expanded={!!position}
        onClick={() => {
          const box = anchor.current!.getBoundingClientRect();
          setPosition(
            position ? null : {
              left: Math.max(8, Math.min(innerWidth - 190, box.right + 8)),
                top: Math.max(8, box.bottom + 210 > innerHeight ? box.top - 210 : box.top),
            },
          );
        }}
      >
        {icon}
      </button>
      {position &&
        createPortal(
          <div
            ref={menu}
            className="tool-floating"
            aria-label={`${label} options`}
            style={position}
            onClick={(e) => {
              if ((e.target as HTMLElement).closest("button")) {
                setPosition(null);
              }
            }}
          >
            {children}
          </div>,
          document.fullscreenElement ?? anchor.current?.closest(".focus-canvas.is-fullscreen") ?? document.body,
        )}
    </span>
  );
}
