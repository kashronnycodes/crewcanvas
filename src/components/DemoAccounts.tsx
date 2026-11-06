import { DEMO_ACCOUNTS } from "../../shared/publicDemo";

export default function DemoAccounts({ onSelect }: { onSelect?: (id: string) => void }) {
  return <section className="demo-accounts" aria-labelledby="explore-heading">
    <h2 id="explore-heading">Explore CrewCanvas</h2>
    <p>Try a ready-made workspace using a demo account.</p>
    <p className="demo-explanation">Simulated demo · synthetic data only. AI and payments are simulated. No password needed; changes stay in this browser.</p>
    <div className="demo-account-list">
      {DEMO_ACCOUNTS.map((account) => <article className="demo-account" key={account.key} aria-label={account.name}>
        <div><h3>{account.name}</h3><span className="demo-role">{account.role}</span></div>
        <p>{account.description}</p>
        {onSelect
          ? <button className="button secondary" aria-label={`Use this account: ${account.name}`} onClick={() => onSelect(account.id)}>Use this account</button>
          : <a className="button secondary" aria-label={`Use this account: ${account.name}`} href={`/?demo=1&account=${account.key}`}>Use this account</a>}
      </article>)}
    </div>
  </section>;
}
