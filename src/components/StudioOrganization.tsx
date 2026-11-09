import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import type { CanvasLayout, WorkspaceSnapshot } from "../../shared/types";
import { api, mode, mutateDemo } from "../services";
import { uid } from "../../shared/domain";

export default function StudioOrganization(
  { snapshot: s, onSave }: {
    snapshot: WorkspaceSnapshot;
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
    <details className="studio-organization">
      <summary>People & saved role groups</summary>
      <p className="fine-print">
        Member roles organize the project hierarchy. Saved visual groups retain
        your earlier team organization.
      </p>
      {s.people.filter((p) => p.accessRole === "worker").map((person) => (
        <form
          key={`${person.id}-${person.name}-${person.role}`}
          className="field-grid"
          onSubmit={(event) => {
            event.preventDefault();
            const fields = new FormData(event.currentTarget),
              name = String(fields.get("name")).trim(),
              role = String(fields.get("role")).trim();
            void run(async () => {
              if (mode === "integrated") {
                return api("members/update", { id: person.id, name, role });
              }
              mutateDemo((snapshot, actorId) => {
                if (
                  snapshot.people.find((p) => p.id === actorId)?.accessRole !==
                    "employer"
                ) {
                  throw new Error("Employer access required.");
                }
                const member = snapshot.people.find((p) => p.id === person.id)!;
                Object.assign(member, {
                  name,
                  role,
                  initials: name.split(" ").map((s) => s[0]).slice(0, 2).join(
                    "",
                  ),
                });
              });
            });
          }}
        >
          <label>
            Member name<input
              name="name"
              aria-label={`Name for ${person.name}`}
              minLength={2}
              maxLength={80}
              required
              defaultValue={person.name}
            />
          </label>
          <label>
            Role<input
              name="role"
              aria-label={`Role for ${person.name}`}
              minLength={2}
              maxLength={80}
              required
              defaultValue={person.role}
            />
          </label>
          <button className="button secondary" disabled={busy}>
            Save member
          </button>
        </form>
      ))}
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
  );
}
