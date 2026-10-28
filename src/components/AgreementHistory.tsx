import type { Agreement } from "../../shared/types";
import { money } from "../../shared/domain";
export default function AgreementHistory({
  agreements,
  activeId,
}: {
  agreements: Agreement[];
  activeId: string | null;
}) {
  return (
    <details className="agreement-history">
      <summary>
        Agreement history · {agreements.length}{" "}
        {agreements.length === 1 ? "version" : "versions"}
      </summary>
      {agreements.map((a, i) => (
        <div key={a.id}>
          <span className="eyebrow">
            VERSION {i + 1} ·{" "}
            {a.id === activeId
              ? "CURRENT ACCEPTED TERMS"
              : a.status.toUpperCase()}
          </span>
          <h4>
            {money(a.amountMinor)} · {a.deadline}
          </h4>
          <p>{a.brief}</p>
          <ul>
            {a.deliverables.map((d, i) => (
              <li key={i}>{d}</li>
            ))}
          </ul>
          {!!a.tasks?.length && <p>Tasks: {a.tasks.join(" · ")}</p>}
          <small>
            {a.revisionRounds} rounds · payment within {a.paymentDays} days of
            acceptance
          </small>
        </div>
      ))}
    </details>
  );
}
