-- Project entities are separate rows. JSON payloads share the validated TypeScript
-- contract; monetary invoice columns also have PostgreSQL constraints.
create table public.workspaces (
  id uuid primary key, name text not null, timezone text not null default 'Asia/Manila'
);
create table public.memberships (
  id uuid primary key, workspace_id uuid not null references public.workspaces,
  auth_user_id uuid unique references auth.users(id),
  access_role text not null check (access_role in ('employer','worker')),
  data jsonb not null check (data->>'id' = id::text),
  unique(id, workspace_id)
);
create unique index one_employer_per_workspace on public.memberships(workspace_id) where access_role='employer';
create table public.canvas_layouts (
  workspace_id uuid primary key references public.workspaces,
  version integer not null default 0, data jsonb not null
);
create table public.projects (
  id uuid primary key, workspace_id uuid not null references public.workspaces,
  worker_id uuid not null, version integer not null default 0,
  data jsonb not null check (data->>'id'=id::text),
  foreign key(worker_id, workspace_id) references public.memberships(id, workspace_id)
);
create table public.agreements (id uuid primary key, project_id uuid not null references public.projects, data jsonb not null);
create table public.deliveries (id uuid primary key, project_id uuid not null references public.projects, data jsonb not null);
create table public.revisions (id uuid primary key, project_id uuid not null references public.projects, data jsonb not null);
create table public.proposals (id uuid primary key, project_id uuid not null references public.projects, data jsonb not null);
create table public.invoices (
  id uuid primary key, project_id uuid not null references public.projects,
  provider_id text unique, amount_minor bigint not null check(amount_minor >= 0),
  paid_minor bigint not null check(paid_minor >= 0), pending_minor bigint not null check(pending_minor >= 0),
  currency text not null default 'USD' check(currency='USD'), data jsonb not null,
  check(paid_minor <= amount_minor), check(paid_minor + pending_minor <= amount_minor)
);
create table public.activity_events (id uuid primary key, project_id uuid not null references public.projects, data jsonb not null);
create index projects_worker_idx on public.projects(worker_id, workspace_id);
do $$ declare t text; begin
  foreach t in array array['agreements','deliveries','revisions','proposals','invoices','activity_events'] loop
    execute format('create index %I on public.%I(project_id)', t || '_project_idx', t);
  end loop;
end $$;

-- Provider data, command keys, and delivery inboxes are never client-readable.
create schema if not exists private;
revoke all on schema private from public, anon, authenticated;
grant usage on schema private to service_role;
create table private.seller_connections (
  id uuid primary key, workspace_id uuid not null references public.workspaces,
  worker_id uuid not null unique references public.memberships,
  merchant_id text not null, email text not null, credential_ref text not null default 'PAYPAL',
  environment text not null default 'sandbox' check(environment='sandbox')
);
create table private.command_operations (
  request_id uuid primary key, actor_id uuid not null references public.memberships,
  project_id uuid not null references public.projects, created_at timestamptz not null default now()
);
create table private.webhook_events (
  event_id text primary key, seller_connection_id uuid not null references private.seller_connections,
  invoice_provider_id text, payload jsonb not null, processed_at timestamptz,
  attempts integer not null default 0, last_error text, received_at timestamptz not null default now()
);
create table private.invoice_leases (invoice_id uuid primary key references public.invoices, token uuid not null, expires_at timestamptz not null);
create table private.ai_runs (id uuid primary key default gen_random_uuid(), actor_id uuid not null, project_id uuid, kind text not null, model text not null, prompt_version text not null, result jsonb not null, created_at timestamptz default now());
create table private.payment_records (provider_transaction_id text primary key, invoice_id uuid not null references public.invoices, data jsonb not null);
create table private.invoice_lines (project_id uuid not null references public.projects, charge_id text not null, invoice_id uuid not null references public.invoices, primary key(project_id, charge_id));
create table private.ai_limits (actor_id uuid not null, minute timestamptz not null, requests integer not null, primary key(actor_id,minute));
grant all on all tables in schema private to service_role;

-- Membership lookup helpers live outside the exposed schema and authorize by JWT identity.
create function private.can_read_project(p_project_id uuid) returns boolean
language sql stable security definer set search_path='' as $$
  select exists(select 1 from public.projects p join public.memberships m on m.workspace_id=p.workspace_id
    where p.id=p_project_id and m.auth_user_id=auth.uid() and (m.access_role='employer' or m.id=p.worker_id))
$$;
create function private.is_employer(p_workspace_id uuid) returns boolean
language sql stable security definer set search_path='' as $$
  select exists(select 1 from public.memberships m where m.workspace_id=p_workspace_id and m.auth_user_id=auth.uid() and m.access_role='employer')
$$;
revoke all on function private.can_read_project(uuid), private.is_employer(uuid) from public, anon;
grant usage on schema private to authenticated;
grant execute on function private.can_read_project(uuid), private.is_employer(uuid) to authenticated;

alter table public.workspaces enable row level security;
alter table public.memberships enable row level security;
alter table public.canvas_layouts enable row level security;
alter table public.projects enable row level security;
create policy workspace_read on public.workspaces for select to authenticated using (private.is_employer(id) or exists(select 1 from public.memberships m where m.workspace_id=workspaces.id and m.auth_user_id=auth.uid()));
create policy member_read on public.memberships for select to authenticated using (auth_user_id=auth.uid() or private.is_employer(workspace_id));
create policy layout_read on public.canvas_layouts for select to authenticated using (private.is_employer(workspace_id));
create policy project_read on public.projects for select to authenticated using (private.can_read_project(id));
do $$ declare t text; begin
  foreach t in array array['agreements','deliveries','revisions','proposals','invoices','activity_events'] loop
    execute format('alter table public.%I enable row level security',t);
    execute format('create policy project_read on public.%I for select to authenticated using (private.can_read_project(project_id))',t);
  end loop;
end $$;
revoke all on all tables in schema public from anon, authenticated;
grant select on public.workspaces,public.memberships,public.canvas_layouts,public.projects,public.agreements,public.deliveries,public.revisions,public.proposals,public.invoices,public.activity_events to authenticated;
grant all on all tables in schema public to service_role;

create function private.preserve_accepted_agreement() returns trigger language plpgsql set search_path='' as $$
begin
  if old.data->>'status'='accepted' and (tg_op='DELETE' or new.data is distinct from old.data) then raise exception 'Accepted agreement snapshots are immutable'; end if;
  if tg_op='DELETE' then return old; end if;
  return new;
end $$;
create trigger immutable_agreement before update or delete on public.agreements for each row execute function private.preserve_accepted_agreement();
create function private.preserve_activity() returns trigger language plpgsql set search_path='' as $$ begin raise exception 'Activity is append-only'; end $$;
create trigger immutable_activity before update or delete on public.activity_events for each row execute function private.preserve_activity();

-- A single transaction commits every entity changed by one validated domain command.
create function public.commit_project(p_actor_id uuid, p_project jsonb, p_expected integer, p_request_id uuid)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare actor public.memberships; existing public.projects; entry jsonb; entity text; project_uuid uuid := (p_project->>'id')::uuid; operation private.command_operations;
begin
  select * into actor from public.memberships where id=p_actor_id;
  if not found then raise exception 'FORBIDDEN'; end if;
  select * into operation from private.command_operations where request_id=p_request_id;
  if found then
    if operation.actor_id<>p_actor_id or operation.project_id<>project_uuid then raise exception 'FORBIDDEN'; end if;
    return jsonb_build_object('duplicate',true,'projectId',project_uuid);
  end if;
  select * into existing from public.projects where id=project_uuid for update;
  if found then
    if existing.workspace_id<>actor.workspace_id or (actor.access_role<>'employer' and existing.worker_id<>actor.id) then raise exception 'FORBIDDEN'; end if;
    if existing.version<>p_expected then raise exception 'CONFLICT: project changed; reload and retry'; end if;
    if (p_project->>'workerId')::uuid<>existing.worker_id or (p_project->>'workspaceId')::uuid<>existing.workspace_id then raise exception 'FORBIDDEN: reassignment'; end if;
    if (p_project->>'version')::integer<>p_expected+1 then raise exception 'CONFLICT: invalid version'; end if;
  else
    if p_expected<>-1 or actor.access_role<>'employer' or (p_project->>'workspaceId')::uuid<>actor.workspace_id then raise exception 'FORBIDDEN'; end if;
    if not exists(select 1 from public.memberships m where m.id=(p_project->>'workerId')::uuid and m.workspace_id=actor.workspace_id and m.access_role='worker') then raise exception 'FORBIDDEN'; end if;
  end if;
  insert into public.projects(id,workspace_id,worker_id,version,data)
  values(project_uuid,actor.workspace_id,(p_project->>'workerId')::uuid,(p_project->>'version')::integer,p_project-'agreements'-'deliveries'-'revisions'-'proposals'-'invoices'-'activity')
  on conflict(id) do update set version=excluded.version,data=excluded.data;
  foreach entity in array array['agreements','deliveries','revisions','proposals'] loop
    for entry in select * from jsonb_array_elements(p_project->entity) loop
      execute format('insert into public.%I(id,project_id,data) values($1,$2,$3) on conflict(id) do update set data=excluded.data where %I.project_id=$2',entity,entity)
        using (entry->>'id')::uuid,project_uuid,entry;
    end loop;
  end loop;
  for entry in select * from jsonb_array_elements(p_project->'invoices') loop
    if entry->>'source'='sandbox' and not exists(select 1 from private.seller_connections s where s.id=(entry->>'sellerConnectionId')::uuid and s.worker_id=(p_project->>'workerId')::uuid) then raise exception 'FORBIDDEN: wrong seller'; end if;
    insert into public.invoices(id,project_id,provider_id,amount_minor,paid_minor,pending_minor,data)
    values((entry->>'id')::uuid,project_uuid,entry->>'providerId',(entry->>'amountMinor')::bigint,(entry->>'paidMinor')::bigint,(entry->>'pendingMinor')::bigint,entry)
    on conflict(id) do update set provider_id=excluded.provider_id,amount_minor=excluded.amount_minor,paid_minor=excluded.paid_minor,pending_minor=excluded.pending_minor,data=excluded.data where invoices.project_id=project_uuid;
    if entry->>'source'='sandbox' then
      insert into private.invoice_lines(project_id,charge_id,invoice_id) select project_uuid,value,(entry->>'id')::uuid from jsonb_array_elements_text(entry->'chargeIds') on conflict(project_id,charge_id) do update set invoice_id=excluded.invoice_id where invoice_lines.invoice_id=excluded.invoice_id;
      if exists(select 1 from private.invoice_lines l where l.project_id=project_uuid and l.charge_id in(select jsonb_array_elements_text(entry->'chargeIds')) and l.invoice_id<>(entry->>'id')::uuid) then raise exception 'CONFLICT: charge already allocated'; end if;
    end if;
  end loop;
  for entry in select * from jsonb_array_elements(p_project->'activity') loop
    insert into public.activity_events(id,project_id,data) values((entry->>'id')::uuid,project_uuid,entry) on conflict(id) do nothing;
  end loop;
  insert into private.command_operations(request_id,actor_id,project_id) values(p_request_id,p_actor_id,project_uuid);
  return jsonb_build_object('projectId',project_uuid,'version',p_project->'version');
end $$;
revoke all on function public.commit_project(uuid,jsonb,integer,uuid) from public,anon,authenticated;
grant execute on function public.commit_project(uuid,jsonb,integer,uuid) to service_role;

create function public.save_canvas(p_actor_id uuid,p_layout jsonb,p_expected integer) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare actor public.memberships; result jsonb;
begin
  select * into actor from public.memberships where id=p_actor_id and access_role='employer';
  if not found then raise exception 'FORBIDDEN'; end if;
  if exists(select 1 from jsonb_array_elements(p_layout->'people') entry where not exists(select 1 from public.memberships m where m.id=(entry->>'id')::uuid and m.workspace_id=actor.workspace_id)) then raise exception 'FORBIDDEN'; end if;
  update public.canvas_layouts set version=version+1,data=jsonb_set(p_layout,'{version}',to_jsonb(version+1)) where workspace_id=actor.workspace_id and version=p_expected returning data into result;
  if result is null then raise exception 'CONFLICT: layout changed; reload'; end if;
  return result;
end $$;
revoke all on function public.save_canvas(uuid,jsonb,integer) from public,anon,authenticated;
grant execute on function public.save_canvas(uuid,jsonb,integer) to service_role;

-- Private data helpers are exposed only as service-role RPCs; the private schema
-- remains outside PostgREST's exposed schemas.
create function public.provider_store(p_action text,p_payload jsonb) returns jsonb
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
  when 'ai_allow' then
    insert into private.ai_limits(actor_id,minute,requests) values((p_payload->>'actorId')::uuid,date_trunc('minute',now()),1) on conflict(actor_id,minute) do update set requests=ai_limits.requests+1 returning to_jsonb(requests<=10) into result;
  when 'ai_run' then insert into private.ai_runs(actor_id,project_id,kind,model,prompt_version,result) values((p_payload->>'actorId')::uuid,(p_payload->>'projectId')::uuid,p_payload->>'kind',p_payload->>'model',p_payload->>'promptVersion',p_payload->'result');
  when 'payment_record' then insert into private.payment_records(provider_transaction_id,invoice_id,data) values(p_payload->>'transactionId',(p_payload->>'invoiceId')::uuid,p_payload->'data') on conflict(provider_transaction_id) do update set data=excluded.data;
  else raise exception 'Unknown provider store action';
  end case;
  return coalesce(result,'null'::jsonb);
end $$;
revoke all on function public.provider_store(text,jsonb) from public,anon,authenticated;
grant execute on function public.provider_store(text,jsonb) to service_role;

-- Scheduler creation is separate and requires the deployed project URL and a
-- Vault-stored server secret. See README; no credentials are embedded here.
