import {useState} from "react";
import type {JudgeRole} from "../judgeAccounts";
export default function JudgeAccounts({busy,onSignIn}:{busy:boolean;onSignIn:(role:JudgeRole,code:string)=>Promise<void>}){
  const [code,setCode]=useState("");
  async function enter(role:JudgeRole){const submitted=code;setCode("");await onSignIn(role,submitted);}
  return <section className="judge-access" aria-labelledby="judge-access-title">
    <h2 id="judge-access-title">Judge/team access</h2>
    <p>Use the private team code to open the shared testing workspace.</p>
    <label htmlFor="judge-team-code">Judge/team code</label>
    <input id="judge-team-code" type="password" autoComplete="off" value={code} maxLength={160} disabled={busy} onChange={e=>setCode(e.target.value)}/>
    <div className="judge-account-list">
      {(["employer","freelancer"] as const).map(role=><button key={role} type="button" className="judge-account" disabled={busy||!code.trim()} onClick={()=>void enter(role)} aria-label={`Continue as ${role==="employer"?"Employer":"Freelancer"}`}>
        <span><strong>{role==="employer"?"Employer":"Freelancer"}</strong><small>{role==="employer"?"Create tasks and review work":"Accept tasks and submit work"}</small></span><span aria-hidden="true">→</span>
      </button>)}
    </div>
    <p className="fine-print">Shared workspace data. Use a new, identifiable task for each rehearsal.</p>
  </section>;
}
