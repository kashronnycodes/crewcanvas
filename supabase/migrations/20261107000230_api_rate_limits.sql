-- Shared fixed UTC-minute counters. One row per user/policy/resource, not per request.
create table private.api_rate_counters (
  auth_user_id uuid not null references auth.users(id) on delete cascade,
  policy text not null check (policy in ('api','payment_issue','payment_reconcile','payment_verify','upload','ai','payment_issue_project','payment_reconcile_project')),
  scope_id uuid not null default '00000000-0000-0000-0000-000000000000',
  window_start timestamptz not null,
  requests integer not null check (requests between 1 and 10000),
  expires_at timestamptz not null,
  primary key(auth_user_id,policy,scope_id),
  check ((policy in ('payment_issue_project','payment_reconcile_project')) = (scope_id <> '00000000-0000-0000-0000-000000000000'))
);
create index api_rate_expiry_idx on private.api_rate_counters(expires_at);
alter table private.api_rate_counters enable row level security;
revoke all on private.api_rate_counters from public,anon,authenticated;
grant select,insert,update,delete on private.api_rate_counters to service_role;

-- Bounded, indexed, non-blocking cleanup; callable by trusted maintenance too.
create function public.cleanup_api_rate_limits() returns integer
language plpgsql security invoker set search_path='' as $$
declare removed integer;
begin
  with expired as (
    select auth_user_id,policy,scope_id from private.api_rate_counters
    where expires_at < clock_timestamp() order by expires_at limit 100
    for update skip locked
  ) delete from private.api_rate_counters c using expired e
    where (c.auth_user_id,c.policy,c.scope_id)=(e.auth_user_id,e.policy,e.scope_id);
  get diagnostics removed = row_count;
  return removed;
end $$;
revoke all on function public.cleanup_api_rate_limits() from public,anon,authenticated;
grant execute on function public.cleanup_api_rate_limits() to service_role;

create function private.consume_api_limit(p_identity uuid,p_policy text,p_limit integer,p_scope uuid default '00000000-0000-0000-0000-000000000000') returns jsonb
language plpgsql security invoker set search_path='' as $$
declare instant timestamptz := clock_timestamp(); minute_start timestamptz;
  used integer; max_limit integer;
begin
  max_limit := case p_policy when 'api' then 10000 when 'ai' then 100
    when 'upload' then 100 when 'payment_issue' then 100 when 'payment_reconcile' then 100
    when 'payment_verify' then 100 when 'payment_issue_project' then 20 when 'payment_reconcile_project' then 30 end;
  if p_identity is null or max_limit is null or p_limit is null or p_limit<1 or p_limit>max_limit or p_scope is null then
    raise exception 'Invalid server rate-limit policy';
  end if;
  minute_start := date_trunc('minute',instant);
  insert into private.api_rate_counters as counter(auth_user_id,policy,scope_id,window_start,requests,expires_at)
    values(p_identity,p_policy,p_scope,minute_start,1,minute_start+interval '24 hours')
    on conflict(auth_user_id,policy,scope_id) do update
      set window_start=excluded.window_start,
          requests=case when counter.window_start<excluded.window_start then 1 else counter.requests+1 end,
          expires_at=excluded.expires_at
      where counter.window_start<excluded.window_start or (counter.window_start=excluded.window_start and counter.requests<p_limit)
    returning requests into used;
  return jsonb_build_object('allowed',used is not null,'retryAfter',
    case when used is null then greatest(1,ceil(extract(epoch from minute_start+interval '1 minute'-clock_timestamp()))::integer) else 0 end);
end $$;
revoke all on function private.consume_api_limit(uuid,text,integer,uuid) from public,anon,authenticated;
grant execute on function private.consume_api_limit(uuid,text,integer,uuid) to service_role;

-- Only Edge/server code can choose identities, limits or scopes.
create function public.api_rate_limit(p_identity uuid,p_policies text[],p_limits jsonb,p_scope uuid default '00000000-0000-0000-0000-000000000000') returns jsonb
language plpgsql security invoker set search_path='' as $$
declare policy_name text; result jsonb;
begin
  if p_policies is null or cardinality(p_policies) not between 1 and 2 then raise exception 'Invalid policy list'; end if;
  if p_scope <> '00000000-0000-0000-0000-000000000000' and not exists (
    select 1 from public.projects p join public.memberships m on m.workspace_id=p.workspace_id
    where p.id=p_scope and m.auth_user_id=p_identity and (m.access_role='employer' or m.id=p.worker_id)
  ) then raise insufficient_privilege using message='Project access denied'; end if;
  perform public.cleanup_api_rate_limits();
  -- Consistent ordering prevents multi-policy calls acquiring counters in opposing order.
  for policy_name in select distinct unnest(p_policies) order by 1 loop
    result := private.consume_api_limit(p_identity,policy_name,(p_limits->>policy_name)::integer,p_scope);
    if not (result->>'allowed')::boolean then return result; end if;
  end loop;
  return jsonb_build_object('allowed',true,'retryAfter',0);
end $$;
revoke all on function public.api_rate_limit(uuid,text[],jsonb,uuid) from public,anon,authenticated;
grant execute on function public.api_rate_limit(uuid,text[],jsonb,uuid) to service_role;

-- Preserve the current minute during rolling deployment. All workspace actors
-- belonging to an Auth user now consume one shared AI allowance.
lock table private.ai_limits in share row exclusive mode;
insert into private.api_rate_counters(auth_user_id,policy,window_start,requests,expires_at)
select m.auth_user_id,'ai',date_trunc('minute',statement_timestamp()),least(10000,sum(l.requests))::integer,date_trunc('minute',statement_timestamp())+interval '24 hours'
from private.ai_limits l join public.memberships m on m.id=l.actor_id
where m.auth_user_id is not null and l.minute=date_trunc('minute',statement_timestamp())
group by m.auth_user_id;

create function private.ai_allow_shared(p_payload jsonb) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare identity_id uuid; result jsonb;
begin
  select auth_user_id into identity_id from public.memberships where id=(p_payload->>'actorId')::uuid;
  if identity_id is null then raise exception 'Invalid AI actor'; end if;
  perform public.cleanup_api_rate_limits();
  result := private.consume_api_limit(identity_id,'ai',coalesce((p_payload->>'limit')::integer,10));
  -- Older Edge releases keep receiving the original boolean contract.
  return case when p_payload->>'details'='true' then result else result->'allowed' end;
end $$;
revoke all on function private.ai_allow_shared(jsonb) from public,anon,authenticated;
grant execute on function private.ai_allow_shared(jsonb) to service_role;

-- Keep provider bookkeeping unchanged; replace only the AI admission branch.
create or replace function public.provider_store(p_action text,p_payload jsonb) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare result jsonb;
begin
  case p_action
  when 'configure_seller' then
    insert into private.seller_connections(id,workspace_id,worker_id,merchant_id,email) values((p_payload->>'id')::uuid,(p_payload->>'workspaceId')::uuid,(p_payload->>'workerId')::uuid,p_payload->>'merchantId',p_payload->>'email') on conflict(id) do update set merchant_id=excluded.merchant_id,email=excluded.email;
  when 'command_result' then select to_jsonb(o) into result from private.command_operations o where o.request_id=(p_payload->>'requestId')::uuid and o.actor_id=(p_payload->>'actorId')::uuid;
  when 'seller' then select to_jsonb(s) into result from private.seller_connections s where s.worker_id=(p_payload->>'workerId')::uuid;
  when 'webhook_insert' then
    insert into private.webhook_events(event_id,seller_connection_id,invoice_provider_id,payload) values(p_payload->>'eventId',(p_payload->>'sellerConnectionId')::uuid,p_payload->>'providerId',p_payload->'event') on conflict(event_id) do nothing;
    select to_jsonb(e) into result from private.webhook_events e where e.event_id=p_payload->>'eventId';
  when 'webhook_pending' then select coalesce(jsonb_agg(to_jsonb(e)),'[]'::jsonb) into result from (select * from private.webhook_events where processed_at is null order by received_at limit 30) e;
  when 'webhook_done' then update private.webhook_events set processed_at=now(),last_error=null where event_id=p_payload->>'eventId';
  when 'webhook_error' then update private.webhook_events set attempts=attempts+1,last_error=left(p_payload->>'error',1000) where event_id=p_payload->>'eventId';
  when 'lease' then
    insert into private.invoice_leases(invoice_id,token,expires_at) values((p_payload->>'invoiceId')::uuid,(p_payload->>'token')::uuid,now()+interval '90 seconds') on conflict(invoice_id) do update set token=excluded.token,expires_at=excluded.expires_at where invoice_leases.expires_at<now() returning to_jsonb(invoice_leases) into result;
  when 'release' then delete from private.invoice_leases where invoice_id=(p_payload->>'invoiceId')::uuid and token=(p_payload->>'token')::uuid;
  when 'ai_allow' then result := private.ai_allow_shared(p_payload);
  when 'ai_run' then insert into private.ai_runs(actor_id,project_id,kind,model,prompt_version,result) values((p_payload->>'actorId')::uuid,(p_payload->>'projectId')::uuid,p_payload->>'kind',p_payload->>'model',p_payload->>'promptVersion',p_payload->'result');
  when 'payment_record' then insert into private.payment_records(provider_transaction_id,invoice_id,data) values(p_payload->>'transactionId',(p_payload->>'invoiceId')::uuid,p_payload->'data') on conflict(provider_transaction_id) do update set data=excluded.data;
  else raise exception 'Unknown provider store action';
  end case;
  return coalesce(result,'null'::jsonb);
end $$;
revoke all on function public.provider_store(text,jsonb) from public,anon,authenticated;
grant execute on function public.provider_store(text,jsonb) to service_role;


-- No active code writes the legacy per-actor counter after this transaction.
drop table private.ai_limits;
