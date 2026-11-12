import { ExternalLink,Plus } from "lucide-react";
import { useState } from "react";
import { newBoardData } from "../../shared/board";
import type { Delivery,Project,WorkspaceSnapshot } from "../../shared/types";
import { boardService } from "../boardService";
import { FilePreview } from "./WorkspaceFiles";

export function externalPreview(url: string): string | null {
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== "https:" || parsed.username || parsed.password) {
      return null;
    }
    if (parsed.hostname === "drive.google.com") {
      const id = parsed.pathname.match(/^\/file\/d\/([\w-]+)/)?.[1] ??
        parsed.searchParams.get("id");
      return id && /^[\w-]+$/.test(id)
        ? `https://drive.google.com/file/d/${id}/preview`
        : null;
    }
    if (parsed.hostname === "docs.google.com") {
      const match = parsed.pathname.match(
        /^\/(document|presentation|spreadsheets)\/d\/([\w-]+)/,
      );
      return match
        ? `https://docs.google.com/${match[1]}/d/${match[2]}/preview`
        : null;
    }
  } catch {
    /* A provider without an embeddable URL remains an ordinary link. */
  }
  return null;
}
export default function DeliverablePreview(
  { snapshot: s, project: p, delivery: d }: {
    snapshot: WorkspaceSnapshot;
    project: Project;
    delivery: Delivery;
  },
) {
  const [error, setError] = useState(""),
    [adding, setAdding] = useState(false),
    [added, setAdded] = useState(false);
  const file = s.files?.find((f) => f.id === d.fileId && f.projectId === p.id);
  const embed = !d.fileId ? externalPreview(d.url) : null;
  return (
    <section className="deliverable-preview" aria-label={`Preview ${d.label}`}>
      <div className="section-heading">
        <strong>{d.label}</strong>
        <span className="eyebrow">
          {d.fileId
            ? `FILE v${(d.fileVersion ?? 0) + 1}`
            : `DELIVERY ${p.deliveries.indexOf(d) + 1}`}
        </span>
      </div>
      {file
        ? (
          <div className="deliverable-media">
            <FilePreview file={file} version={d.fileVersion} full />
          </div>
        )
        : embed
        ? (
          <>
            <iframe
              title={`Preview of ${d.label}`}
              src={embed}
              loading="lazy"
              sandbox="allow-scripts allow-same-origin"
              referrerPolicy="no-referrer"
              onError={() =>
                setError("The provider could not load this preview.")}
            />
            <p className="fine-print">
              Preview requires the original file’s sharing permission. If it
              stays blank or asks for access, open the original.
            </p>
          </>
        )
        : (
          <p className="muted">
            {d.fileId
              ? "This file version is unavailable. Ask the uploader for access."
              : "Open the original file to review this version."}
          </p>
        )}
      {!d.fileId && (
        <a
          className="button secondary"
          href={d.url}
          target="_blank"
          rel="noopener noreferrer"
        >
          <ExternalLink size={13} /> Open original
        </a>
      )}
      <button
        className="button secondary"
        disabled={adding || !!d.fileId && !file}
        onClick={async () => {
          setAdding(true);
          setError("");
          try {
            const existing = await boardService.load(p.id),
              baseY = Math.max(
                600,
                ...existing.filter((r) =>
                  !r.deleted
                ).map((r) =>
                  r.data.y + r.data.height + 40
                ),
              );
            const anchor = await boardService.save(p.id, crypto.randomUUID(), {
              ...newBoardData("note", 120, baseY),
              text: `Task · ${p.title}`,
              taskId: p.id,
            }, 0);
            const card = await boardService.save(p.id, crypto.randomUUID(), {
              ...newBoardData(file ? "file" : "link", 480, baseY),
              text: `${d.label} · ${
                d.fileId
                  ? `file v${(d.fileVersion ?? 0) + 1}`
                  : "external delivery"
              }`,
              fileId: file?.id ?? null,
              fileVersion: file ? d.fileVersion ?? 0 : null,
              taskId: p.id,
              url: file ? "" : d.url,
              width: 300,
              height: 300,
            }, 0);
            await boardService.save(p.id, crypto.randomUUID(), {
              ...newBoardData("connector"),
              text: "Deliverable for task",
              source: anchor.id,
              target: card.id,
            }, 0);
            window.dispatchEvent(new Event("crewcanvas:board-changed"));
            setAdded(true);
          } catch (e) {
            setError((e as Error).message);
          } finally {
            setAdding(false);
          }
        }}
      >
        <Plus size={13} />
        {adding
          ? "Adding…"
          : added
          ? "Added to task whiteboard"
          : "Add to whiteboard"}
      </button>
      {error && <p role="alert" className="error-message">{error}</p>}
    </section>
  );
}
