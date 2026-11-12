import { money } from "../../shared/domain";
import { taskPayment } from "../../shared/studio";
import type { Person,Project } from "../../shared/types";
export default function PaymentOverview({ project, person, employer, busy, onIssue }: {
    project: Project;
    person?: Person;
    employer: boolean;
    busy: boolean;
    onIssue: (id: string) => Promise<boolean>;
}) {
    const f = taskPayment(project);
    const sellerAvailable = project.origin === "sandbox" && person?.connected;
    return (<section className="task-payment-overview" aria-label="Task payment responsibilities">
      <div className="section-heading">
        <h3>Task payment</h3>
        <span className="pill">{f.status}</span>
      </div>
      <dl className="task-payment-grid">
        <div>
          <dt>Agreed task price</dt>
          <dd>
            {project.activeAgreementId
            ? money(f.base.toString())
            : "Not accepted yet"}
          </dd>
        </div>
        <div>
          <dt>Accepted revision charges</dt>
          <dd>{money(f.charges.toString())}</dd>
        </div>
        <div>
          <dt>Amount already paid</dt>
          <dd>{money(f.settled.toString())}</dd>
        </div>
        <div>
          <dt>Remaining amount due</dt>
          <dd>{money(f.remaining.toString())}</dd>
        </div>
      </dl>
      <p>Payment due date: {f.due ?? "Available after invoicing"}</p>
      <p>
        <strong>Next action:</strong> {f.canIssue && !sellerAvailable
            ? "Employer & freelancer · configure an authorized Sandbox seller before invoicing"
            : f.next}
      </p>
      {(<small>
            {project.origin === "sample"
                ? "Historical sample records"
                : "PayPal Sandbox · test money"}
          </small>)}
      <div className="button-row">
        {!employer && f.canIssue &&
            (project.origin === "sandbox" && person?.connected) &&
            (<button className="button primary" disabled={busy} onClick={() => void onIssue(project.id)}>
              {"Issue invoice"}
            </button>)}
        {employer &&
            f.payable.map((invoice) => (<a className="button primary" key={invoice.id} href={invoice.recipientUrl!} target="_blank" rel="noopener noreferrer">
              Pay now · {invoice.number} · Sandbox
            </a>))}
      </div>
      <small>Work approval and payment status are tracked separately.</small>
    </section>);
}
