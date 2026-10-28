import { useState } from "react";
import { ArrowRight, ShieldCheck } from "lucide-react";
import { supabase } from "../services";
export default function InvitationSetup() {
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  return (
    <div className="login-screen">
      <div className="brand">✦ CrewCanvas</div>
      <div className="login-card">
        <span className="eyebrow">YOU'RE PART OF THE CREW</span>
        <h1>Make yourself at home.</h1>
        <p>
          Your invitation is verified. Choose a password to access your assigned
          work.
        </p>
        <form
          className="stacked-form"
          onSubmit={async (e) => {
            e.preventDefault();
            if (password !== confirmation) {
              setError("Passwords do not match.");
              return;
            }
            setBusy(true);
            setError("");
            try {
              const { error } = await supabase!.auth.updateUser({ password });
              if (error) throw error;
              window.location.assign("/");
            } catch (error) {
              setError((error as Error).message);
              setBusy(false);
            }
          }}
        >
          <label>
            Password
            <input
              type="password"
              autoComplete="new-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              minLength={12}
              required
            />
          </label>
          <label>
            Confirm password
            <input
              type="password"
              autoComplete="new-password"
              value={confirmation}
              onChange={(e) => setConfirmation(e.target.value)}
              minLength={12}
              required
            />
          </label>
          {error && (
            <p className="error-message" role="alert">
              {error}
            </p>
          )}
          <button className="button primary" disabled={busy}>
            Open your workspace
            <ArrowRight size={15} />
          </button>
          <p className="fine-print">
            <ShieldCheck size={12} /> Your account can access only your assigned
            projects.
          </p>
        </form>
      </div>
    </div>
  );
}
