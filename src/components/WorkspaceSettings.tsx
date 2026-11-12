import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import type { WorkspaceSnapshot } from "../../shared/types";
import { api } from "../services";
import Modal from "./Modal";

export default function WorkspaceSettings({ snapshot, onClose }: {
  snapshot: WorkspaceSnapshot; onClose: () => void;
}) {
  const cache = useQueryClient();
  const [name, setName] = useState(snapshot.name);
  const [timezone, setTimezone] = useState(snapshot.timezone);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  return <Modal title="Workspace settings" onClose={() => { if (!busy) onClose(); }}>
    <form className="stacked-form" onSubmit={async event => {
      event.preventDefault();
      if (busy) return;
      setBusy(true); setError("");
      try {
        await api("workspaces/update", { name: name.trim(), timezone: timezone.trim() });
        await Promise.all([
          cache.invalidateQueries({ queryKey: ["workspace"] }),
          cache.invalidateQueries({ queryKey: ["memberships"] }),
        ]);
        onClose();
      } catch (err) { setError((err as Error).message); }
      finally { setBusy(false); }
    }}>
      <label>Workspace name<input value={name} onChange={e => setName(e.target.value)} required minLength={2} maxLength={80} /></label>
      <label>Timezone<input value={timezone} onChange={e => setTimezone(e.target.value)} required maxLength={80} /></label>
      {error && <p role="alert" className="error-message">{error}</p>}
      <div className="button-row">
        <button type="button" className="button secondary" disabled={busy} onClick={onClose}>Cancel</button>
        <button className="button primary" disabled={busy}>Save workspace settings</button>
      </div>
    </form>
  </Modal>;
}
