// Operator-only setup for deliberately shared judging identities.
// Provider keys and private team passwords are never written to browser config.
import { createClient } from '@supabase/supabase-js';
import { randomBytes, randomUUID } from 'node:crypto';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { projectClient, projectRef, projectUrl } from './project-client.mjs';
const statePath = new URL('../.supabase/judge-access.local.json', import.meta.url);
const envPath = new URL('../.env.local', import.meta.url);
const marker = 'crewcanvas-judge-access-v1';
const { admin, publicKey } = projectClient();
const checked = result => { if (result.error) throw new Error(`Judge setup failed (${result.error.code ?? result.error.status ?? 'backend'}). No credentials logged.`); return result.data; };
const profiles = [
 {key:'client',label:'Client',role:'Client',name:'Judge Client'},
 {key:'freelancer-1',label:'Freelancer 1',role:'Freelancer',name:'Alex Reyes'},
 {key:'freelancer-2',label:'Freelancer 2',role:'Freelancer',name:'Sam Rivera'},
];
const state = existsSync(statePath) ? JSON.parse(readFileSync(statePath,'utf8')) : {
 projectRef, marker, generation: Date.now().toString(), workspaceId:null,
 accounts:profiles.map(p=>({...p,email:`crewcanvas.judges.${Date.now()}.${p.key}@example.com`,password:randomBytes(24).toString('base64url'),id:null})),
};
if(state.projectRef!==projectRef || state.marker!==marker || state.accounts.length!==3)throw new Error('Judge account inventory mismatch. No existing records changed.');
const persist=()=>writeFileSync(statePath,JSON.stringify(state,null,2));
persist();
const sessions=[];
async function api(who,path,body,workspace=state.workspaceId){
 const response=await fetch(`${projectUrl}/functions/v1/crew-api/${path}`,{method:body===undefined?'GET':'POST',headers:{Authorization:`Bearer ${who.session.access_token}`,apikey:publicKey,'Content-Type':'application/json',Origin:'http://127.0.0.1:5173','Idempotency-Key':randomUUID(),...(workspace?{'X-Workspace-Id':workspace}:{})},body:body===undefined?undefined:JSON.stringify(body)});
 const value=await response.json();if(!response.ok)throw new Error(`${path}: ${response.status} ${value.error?.message??'Request failed'}`);return value;
}
try {
 for(const account of state.accounts){
  if(!/^crewcanvas\.judges\.[0-9]+\.(client|freelancer-[12])@example\.com$/.test(account.email))throw new Error('Only designated judging identities may be published.');
  if(!account.id){const created=checked(await admin.auth.admin.createUser({email:account.email,password:account.password,email_confirm:true,app_metadata:{crew_judge:marker}}));account.id=created.user.id;persist();}
  const user=checked(await admin.auth.admin.getUserById(account.id)).user;
  if(user.email!==account.email || user.app_metadata.crew_judge!==marker)throw new Error('Refusing to use an unrelated account.');
  const client=createClient(projectUrl,publicKey,{auth:{persistSession:false,autoRefreshToken:false}});
  const signed=checked(await client.auth.signInWithPassword({email:account.email,password:account.password}));sessions.push({client,session:signed.session});
 }
 const owner=sessions[0];
 if(!state.workspaceId){const created=await api(owner,'workspaces/create',{name:'CrewCanvas Judging',personName:state.accounts[0].name,timezone:'Asia/Manila'},null);state.workspaceId=created.workspaceId;persist();}
 let snapshot=await api(owner,'snapshot');
 for(let i=1;i<3;i++){
  const account=state.accounts[i];
  if(!snapshot.people.some(p=>p.email===account.email)){
   const invitation=await api(owner,'invite',{email:account.email,name:account.name,role:i===1?'Designer':'Video editor'});
   await api(sessions[i],'invites/accept',{token:new URL(invitation.url).searchParams.get('join')},null);
  }
 }
 snapshot=await api(owner,'snapshot');
 if(!state.collectionId){state.collectionId=randomUUID();state.roleIds=[randomUUID(),randomUUID()];persist();}
 const workers=state.accounts.slice(1).map(a=>snapshot.people.find(p=>p.email===a.email));
 if(!snapshot.layout.workflow?.some(c=>c.id===state.collectionId))await api(owner,'layout',{...snapshot.layout,workflow:[{id:state.collectionId,title:'Campaign launch',roles:workers.map((p,i)=>({id:state.roleIds[i],name:p.role,members:[p.id]}))}]});
 const jobs=[{title:'Design the launch card',worker:0,accept:true},{title:'Edit the launch video',worker:1,accept:false}];
 for(const job of jobs){
  snapshot=await api(owner,'snapshot');let task=snapshot.projects.find(p=>p.title===job.title);
  if(!task){await api(owner,'command',{type:'createProject',workerId:workers[job.worker].id,title:job.title,publish:true,organization:{collectionId:state.collectionId,roleId:state.roleIds[job.worker]},terms:{brief:job.worker===0?'Create one launch card using the supplied colors. Include one round of spelling and layout corrections. Extra concepts require a separate agreement.':'Edit a 30-second launch video using the supplied footage. Include captions and one review round. Additional videos require a new agreement.',tasks:[job.title],deliverables:[job.worker===0?'One final PNG':'One 30-second MP4'],amountMinor:'100',currency:'USD',deadline:'2026-12-20',revisionRounds:1,paymentDays:7}});snapshot=await api(owner,'snapshot');task=snapshot.projects.find(p=>p.title===job.title);}
  if(job.accept&&!task.activeAgreementId)await api(sessions[job.worker+1],'command',{type:'decideAgreement',projectId:task.id,agreementId:task.agreements[0].id,accept:true});
 }
 // Verify all published credentials belong only to this synthetic workspace.
 for(let i=0;i<3;i++){
  const account=state.accounts[i];
  const memberships=checked(await admin.from('memberships').select('workspace_id').eq('auth_user_id',account.id));
  if(memberships.length!==1||memberships[0].workspace_id!==state.workspaceId)throw new Error('Account has unrelated workspace access. Browser configuration was not published.');
  const visible=await api(sessions[i],'snapshot');
  if(visible.id!==state.workspaceId||i>0&&visible.projects.some(p=>p.workerId!==visible.actorId))throw new Error('Account permission check failed.');
 }
 state.verifiedAt=new Date().toISOString();persist();
 console.log('PASS legacy judging records preserved. Browser credentials are no longer exported; use the secure judge/team endpoint.');
} finally {await Promise.all(sessions.map(s=>s.client.auth.signOut({scope:'local'})));}
