import { useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { uid } from "../../shared/domain";
import type { CanvasLayout,WorkspaceSnapshot } from "../../shared/types";
import TeamMembers from "./TeamMembers";

export default function StudioOrganization(
  { snapshot: s, onSave, onInvite }: {
    snapshot: WorkspaceSnapshot;
    onInvite: () => void;
    onSave: (layout: CanvasLayout) => Promise<unknown>;
  },
) {
  const client = useQueryClient();
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  async function run(action: () => Promise<unknown>) {
    setBusy(true);
    setError("");
    try {
      await action();
      await client.invalidateQueries({ queryKey: ["workspace"] });
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="studio-organization">
      <TeamMembers snapshot={s} onInvite={onInvite} />
      <details>
        <summary>Saved groups</summary>
        <p className="fine-print">Organize existing members into visual groups.</p>
      {s.layout.groups.map((group) => (
        <div className="studio-saved-group" key={group.id}>
          <form
            className="button-row"
            onSubmit={(event) => {
              event.preventDefault();
              const name = String(new FormData(event.currentTarget).get("name"))
                .trim();
              void run(() =>
                onSave({
                  ...s.layout,
                  groups: s.layout.groups.map((g) =>
                    g.id === group.id ? { ...g, name } : g
                  ),
                })
              );
            }}
          >
            <label>
              Saved group<input
                aria-label={`Group name for ${group.name}`}
                name="name"
                defaultValue={group.name}
                required
                maxLength={60}
              />
            </label>
            <button className="button secondary" disabled={busy}>
              Rename group
            </button>
            <button
              type="button"
              className="text-button"
              disabled={busy}
              onClick={() =>
                void run(() =>
                  onSave({
                    ...s.layout,
                    groups: s.layout.groups.map((g) =>
                      g.id === group.id ? { ...g, collapsed: !g.collapsed } : g
                    ),
                  })
                )}
            >
              {group.collapsed ? "Expand" : "Collapse"} {group.name}
            </button>
          </form>
          {s.layout.people.filter((p) =>
            p.groupId === group.id
          ).map((p) => (
            <p key={p.id}>
              {s.people.find((member) => member.id === p.id)?.name}
            </p>
          ))}
        </div>
      ))}
      <form
        className="button-row"
        onSubmit={(event) => {
          event.preventDefault();
          const form = event.currentTarget,
            name = String(new FormData(form).get("name")).trim();
          void run(async () => {
            await onSave({
              ...s.layout,
              groups: [...s.layout.groups, {
                id: uid(),
                name,
                x: 80,
                y: 80,
                width: 500,
                height: 380,
                collapsed: false,
              }],
            });
            form.reset();
          });
        }}
      >
        <label>
          New role group<input
            name="name"
            required
            minLength={2}
            maxLength={60}
          />
        </label>
        <button className="button secondary" disabled={busy}>
          Add role group
        </button>
      </form>
      {s.people.filter((p) => p.accessRole === "worker").map((person) => (
        <label key={person.id}>
          Group for {person.name}
          <select
            aria-label={`Group for ${person.name}`}
            disabled={busy}
            value={s.layout.people.find((p) =>
              p.id === person.id
            )?.groupId ??
              ""}
            onChange={(event) => {
              const groupId = event.target.value || null;
              const existing = s.layout.people.find((p) => p.id === person.id);
              void run(() =>
                onSave({
                  ...s.layout,
                  people: [
                    ...s.layout.people.filter((p) => p.id !== person.id),
                    {
                      ...(existing ?? { id: person.id, x: 40, y: 60 }),
                      groupId,
                    },
                  ],
                })
              );
            }}
          >
            <option value="">Ungrouped</option>
            {s.layout.groups.map((g) => (
              <option key={g.id} value={g.id}>{g.name}</option>
            ))}
          </select>
        </label>
      ))}
      {error && <p role="alert" className="error-message">{error}</p>}
      </details>
    </section>
  );
}
