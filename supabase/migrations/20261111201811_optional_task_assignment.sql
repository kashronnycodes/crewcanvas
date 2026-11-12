-- Null means deliberately unassigned. No existing task or assignee is rewritten.
alter table public.projects alter column worker_id drop not null;
-- Sample profiles can never impersonate Auth users, including via service-side writes.
alter table public.memberships add constraint sample_members_have_no_account check (
  data->'sample' is distinct from 'true'::jsonb or
  (auth_user_id is null and access_role='worker' and not (data ? 'authUserId'))
);

create or replace function public.commit_project(p_actor_id uuid, p_project jsonb, p_expected integer, p_request_id uuid)
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
    if existing.workspace_id<>actor.workspace_id or (actor.access_role<>'employer' and existing.worker_id is distinct from actor.id) then raise exception 'FORBIDDEN'; end if;
    if existing.version<>p_expected then raise exception 'CONFLICT: project changed; reload and retry'; end if;
    if (p_project->>'workspaceId')::uuid is distinct from existing.workspace_id then raise exception 'FORBIDDEN'; end if;
    if (p_project->>'workerId')::uuid is distinct from existing.worker_id then
      if actor.access_role<>'employer' then raise exception 'FORBIDDEN: reassignment'; end if;
      if existing.data->>'activeAgreementId' is not null
        or exists(select 1 from public.invoices where project_id=project_uuid)
        or exists(select 1 from public.deliveries where project_id=project_uuid)
        or exists(select 1 from public.revisions where project_id=project_uuid)
        or exists(select 1 from public.proposals where project_id=project_uuid)
        then raise exception 'CONFLICT: preserve agreed work and payment history'; end if;
    end if;
    if (p_project->>'version')::integer<>p_expected+1 then raise exception 'CONFLICT: invalid version'; end if;
  else
    if p_expected<>-1 or actor.access_role<>'employer' or (p_project->>'workspaceId')::uuid is distinct from actor.workspace_id then raise exception 'FORBIDDEN'; end if;
  end if;
  if p_project->>'workerId' is not null and not exists(select 1 from public.memberships m
    where m.id=(p_project->>'workerId')::uuid and m.workspace_id=actor.workspace_id and m.access_role='worker')
    then raise exception 'FORBIDDEN: invalid assignee'; end if;
  insert into public.projects(id,workspace_id,worker_id,version,data)
  values(project_uuid,actor.workspace_id,(p_project->>'workerId')::uuid,(p_project->>'version')::integer,p_project-'agreements'-'deliveries'-'revisions'-'proposals'-'invoices'-'activity')
  on conflict(id) do update set worker_id=excluded.worker_id,version=excluded.version,data=excluded.data;
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


-- Explicit operator setup only; no app mount, signup or ordinary workspace calls this.
create function public.add_sample_workspace_member(p_actor_id uuid,p_id uuid,p_key text,p_name text,p_role text)
returns uuid language plpgsql security invoker set search_path='' as $$
declare actor public.memberships; existing_id uuid;
begin
  select * into actor from public.memberships where id=p_actor_id and access_role='employer';
  if not found then raise exception 'FORBIDDEN'; end if;
  if length(trim(p_name)) not between 2 and 80 or length(trim(p_role)) not between 2 and 80
    or p_key !~ '^[a-z0-9-]{2,60}$' then raise exception 'VALIDATION'; end if;
  perform 1 from public.workspaces where id=actor.workspace_id for update;
  select id into existing_id from public.memberships where workspace_id=actor.workspace_id
    and data->'sample'='true'::jsonb and data->>'sampleKey'=p_key;
  if existing_id is not null then return existing_id; end if;
  insert into public.memberships(id,workspace_id,access_role,data) values(p_id,actor.workspace_id,'worker',
    jsonb_build_object('id',p_id,'name',trim(p_name),'role',trim(p_role),'email','',
      'accessRole','worker','sample',true,'sampleKey',p_key,'initials',upper(left(trim(p_name),2)),
      'color','#cbd2e8','connected',false));
  return p_id;
end $$;
revoke all on function public.add_sample_workspace_member(uuid,uuid,text,text,text) from public,anon,authenticated;
grant execute on function public.add_sample_workspace_member(uuid,uuid,text,text,text) to service_role;
