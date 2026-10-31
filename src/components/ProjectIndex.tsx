import { useState } from "react";
import {
  ArrowUpRight,
  CalendarDays,
  CheckCircle2,
  FileCheck2,
  History,
  Sparkles,
  Wallet,
  X,
} from "lucide-react";
import type { WorkspaceAnswer, WorkspaceSnapshot } from "../../shared/types";
import { activeAgreement, money, todayIn } from "../../shared/domain";
import { answerWorkspace, projectFinance } from "../../shared/workspace";
import { api, mode } from "../services";
export default function ProjectIndex(
  { snapshot: s, search, onOpen }: {
    snapshot: WorkspaceSnapshot;
    search: string;
    onOpen: (workerId: string, filter?: "all", projectId?: string) => void;
  },
) {
  const actor = s.people.find((p) => p.id === s.actorId)!,
    employer = actor.accessRole === "employer";
  const [answer, setAnswer] = useState<WorkspaceAnswer | null>(null),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  async function summarize() {
    setBusy(true);
    setError("");
    try {
      setAnswer(
        mode === "demo"
          ? answerWorkspace(s, "summary", "demo")
          : await api("ai/workspace", {
            text:
              "Summarize my authorized projects, deadlines, outstanding feedback and next steps. Use project titles rather than internal identifiers in the narrative. Do not invent information.",
          }),
      );
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  const projects = s.projects.filter((p) =>
    `${p.title} ${
      s.people.find((person) => person.id === p.workerId)?.name ?? ""
    }`.toLowerCase().includes(search.toLowerCase())
  );
  const today = todayIn(s.timezone),
    next = [...projects].filter((p) => p.state !== "accepted").sort((a, b) =>
      (activeAgreement(a)?.deadline ?? "9999").localeCompare(
        activeAgreement(b)?.deadline ?? "9999",
      )
    );
  const groups = employer
    ? s.people.filter((person) => person.accessRole === "worker").map(
      (person) => ({
        name: person.name,
        role: person.role,
        projects: projects.filter((p) => p.workerId === person.id),
      }),
    )
    : [{
      name: "My assigned projects",
      role: "Agreements, feedback and payments in one place",
      projects: [...next, ...projects.filter((p) => p.state === "accepted")],
    }];
  return (
    <div className="freelance-projects">
      <div className="project-index-heading">
        <div>
          <span className="eyebrow">
            {employer ? "YOUR CREATIVE TEAM" : "YOUR NEXT CHAPTER"}
          </span>
          <h2>
            {employer
              ? "Good work starts with your people."
              : "Your work, clearly in view."}
          </h2>
        </div>
        <button
          className="button secondary"
          disabled={busy}
          onClick={() => void summarize()}
        >
          <Sparkles size={14} />
          {busy
            ? "Summarizing…"
            : employer
            ? "Summarize workspace"
            : "Summarize my work"}
        </button>
      </div>
      {error && <p role="alert" className="error-message">{error}</p>}
      {answer && (
        <section className="project-ai-answer">
          <div>
            <strong>
              {answer.mode === "live" ? "AI workspace summary" : "Demo summary"}
            </strong>
            <button
              aria-label="Dismiss AI summary"
              onClick={() => setAnswer(null)}
            >
              <X size={15} />
            </button>
          </div>
          <p>{answer.text}</p>
          <small>
            AI suggestions need your review. Agreements and payment records
            remain authoritative.
          </small>
        </section>
      )}
      {groups.map((group) => (
        <section className="freelancer-group" key={group.name}>
          <div className="freelancer-heading">
            <strong>{group.name}</strong>
            <span>{group.role}</span>
          </div>
          <div className="freelance-project-grid">
            {group.projects.map((p) => {
              const a = activeAgreement(p),
                f = projectFinance(p),
                overdue = a?.deadline && a.deadline < today &&
                  p.state !== "accepted";
              return (
                <article className="freelance-project" key={p.id}>
                  <div className="project-meta">
                    <span className={`workflow-state state-${p.state}`}>
                      {p.state.replaceAll("_", " ")}
                    </span>
                    <span>
                      {p.origin === "sample" ? "Sample data" : "Sandbox"}
                    </span>
                  </div>
                  <button
                    className="project-title-link"
                    onClick={() => onOpen(p.workerId, "all", p.id)}
                  >
                    {p.title}
                    <ArrowUpRight size={18} />
                  </button>
                  <p>
                    {a?.deliverables.join(" · ") ||
                      "Review the proposed agreement to get started."}
                  </p>
                  <div
                    className={`project-deadline ${
                      overdue ? "is-overdue" : ""
                    }`}
                  >
                    <CalendarDays size={14} />
                    {a?.deadline ?? "Deadline awaiting agreement"}
                    {overdue ? " · overdue" : ""}
                  </div>
                  <dl>
                    <div>
                      <dt>
                        <FileCheck2 size={14} /> Deliveries
                      </dt>
                      <dd>{p.deliveries.length}</dd>
                    </div>
                    <div>
                      <dt>
                        <History size={14} /> Revision requests
                      </dt>
                      <dd>{p.revisions.length}</dd>
                    </div>
                    <div>
                      <dt>
                        <Wallet size={14} />{" "}
                        {employer ? "Verified settlement" : "Payment received"}
                      </dt>
                      <dd>{money(f.settled.toString())}</dd>
                    </div>
                  </dl>
                  <footer>
                    <span>
                      {p.origin === "sample"
                        ? "Sample payment records"
                        : "PayPal Sandbox · test money"}
                    </span>
                    <button onClick={() => onOpen(p.workerId, "all", p.id)}>
                      {p.state === "submitted"
                        ? employer ? "Review delivery" : "View submission"
                        : p.state === "changes_requested"
                        ? "Review feedback"
                        : "Open project"}
                      <ArrowUpRight size={14} />
                    </button>
                  </footer>
                </article>
              );
            })}
            {!group.projects.length && (
              <div className="project-empty">
                <CheckCircle2 size={18} />
                <span>
                  {search ? "No matching projects" : "No assigned projects yet"}
                </span>
              </div>
            )}
          </div>
        </section>
      ))}
      {!groups.length && (
        <div className="empty-state">
          <h3>Your next collaboration starts here.</h3>
          <p>
            Invite a freelancer, create a project, and agree the work together.
          </p>
        </div>
      )}
    </div>
  );
}
