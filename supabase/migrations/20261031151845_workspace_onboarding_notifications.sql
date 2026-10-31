-- Extend the existing membership/project model; never infer roles from Auth metadata.
alter table public.memberships drop constraint memberships_auth_user_id_key;
alter table public.memberships add constraint membership_per_workspace unique(workspace_id,auth_user_id);
create index memberships_auth_idx on public.memberships(auth_user_id);
-- This deployment uses one Sandbox REST application for one configured seller.
create function public.configured_sandbox_seller(p_merchant_id text,p_email text) returns uuid
language plpgsql security invoker set search_path='' as $$
declare result uuid; matches integer;
begin
  select count(*),(array_agg(id))[1] into matches,result from private.seller_connections
    where environment='sandbox' and merchant_id=p_merchant_id and lower(email)=lower(p_email);
  if matches<>1 then raise exception 'Exactly one configured Sandbox seller is required'; end if;
  return result;
end $$;
revoke all on function public.configured_sandbox_seller(text,text) from public,anon,authenticated;
grant execute on function public.configured_sandbox_seller(text,text) to service_role;

create table private.workspace_invites (
  id uuid primary key, workspace_id uuid not null references public.workspaces,
  invited_by uuid not null references public.memberships,
  email text not null, name text not null, role_label text not null,
  token_hash text not null unique check(length(token_hash)=64),
  expires_at timestamptz not null default now()+interval '7 days',
  accepted_by uuid references auth.users, created_at timestamptz not null default now()
);
grant all on private.workspace_invites to service_role;

create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces,
  recipient_id uuid not null, project_id uuid references public.projects,
  source_id uuid not null, source_kind text not null,
  text text not null, created_at timestamptz not null default now(), read_at timestamptz,
  foreign key(recipient_id,workspace_id) references public.memberships(id,workspace_id),
  unique(recipient_id,source_kind,source_id)
);
create index notification_inbox_idx on public.notifications(recipient_id,created_at desc);
alter table public.notifications enable row level security;
create policy notification_read on public.notifications for select to authenticated
using(exists(select 1 from public.memberships m where m.id=recipient_id and m.auth_user_id=auth.uid()));
revoke all on public.notifications from public,anon,authenticated;
grant select on public.notifications to authenticated;
grant all on public.notifications to service_role;

-- Service-only transactions. Edge authentication supplies p_auth_id, never a browser claim.
create function public.create_workspace(p_auth_id uuid,p_id uuid,p_name text,p_person_name text,p_timezone text)
returns uuid language plpgsql security invoker set search_path='' as $$
declare email_address text; member_id uuid:=gen_random_uuid(); person jsonb;
begin
  select email into email_address from auth.users where id=p_auth_id and email_confirmed_at is not null;
  if email_address is null then raise exception 'FORBIDDEN: verified email required'; end if;
  if length(trim(p_name)) not between 2 and 80 or length(trim(p_person_name)) not between 2 and 80
    or not exists(select 1 from pg_timezone_names where name=p_timezone) then raise exception 'VALIDATION'; end if;
  perform pg_advisory_xact_lock(hashtextextended(p_id::text,0));
  if exists(select 1 from public.workspaces where id=p_id) then
    if not exists(select 1 from public.memberships where workspace_id=p_id and auth_user_id=p_auth_id and access_role='employer') then raise exception 'FORBIDDEN'; end if;
    return p_id;
  end if;
  if (select count(*) from public.memberships where auth_user_id=p_auth_id and access_role='employer')>=10 then raise exception 'LIMIT: ten workspaces per account'; end if;
  person:=jsonb_build_object('id',member_id,'authUserId',p_auth_id,'name',trim(p_person_name),'email',email_address,
    'accessRole','employer','role','Workspace owner','initials',upper(left(trim(p_person_name),2)),'color','#cbd2e8','connected',false);
  insert into public.workspaces(id,name,timezone) values(p_id,trim(p_name),p_timezone);
  insert into public.memberships(id,workspace_id,auth_user_id,access_role,data) values(member_id,p_id,p_auth_id,'employer',person);
  insert into public.canvas_layouts(workspace_id,data) values(p_id,jsonb_build_object('schemaVersion',1,'version',0,
    'groups','[]'::jsonb,'people','[]'::jsonb,'cards','[]'::jsonb,'connections','[]'::jsonb,'viewport',jsonb_build_object('x',0,'y',0,'zoom',1)));
  insert into public.workspace_activity(workspace_id,actor_id,text) values(p_id,member_id,'Created the workspace.');
  return p_id;
end $$;
revoke all on function public.create_workspace(uuid,uuid,text,text,text) from public,anon,authenticated;
grant execute on function public.create_workspace(uuid,uuid,text,text,text) to service_role;

create function public.invite_workspace_member(p_actor_id uuid,p_id uuid,p_email text,p_name text,p_role text,p_hash text)
returns uuid language plpgsql security invoker set search_path='' as $$
declare actor public.memberships;
begin
  select * into actor from public.memberships where id=p_actor_id and access_role='employer';
  if not found then raise exception 'FORBIDDEN'; end if;
  if exists(select 1 from public.memberships where workspace_id=actor.workspace_id and lower(data->>'email')=lower(p_email)) then raise exception 'CONFLICT: already a member'; end if;
  if (select count(*) from private.workspace_invites where workspace_id=actor.workspace_id and created_at>now()-interval '1 hour')>=50 then raise exception 'LIMIT: invitation rate'; end if;
  insert into private.workspace_invites(id,workspace_id,invited_by,email,name,role_label,token_hash)
    values(p_id,actor.workspace_id,actor.id,lower(p_email),p_name,p_role,p_hash);
  return p_id;
end $$;
revoke all on function public.invite_workspace_member(uuid,uuid,text,text,text,text) from public,anon,authenticated;
grant execute on function public.invite_workspace_member(uuid,uuid,text,text,text,text) to service_role;

create function public.accept_workspace_invite(p_auth_id uuid,p_hash text)
returns uuid language plpgsql security invoker set search_path='' as $$
declare invitation private.workspace_invites; email_address text; member_id uuid; layout public.canvas_layouts;
begin
  select email into email_address from auth.users where id=p_auth_id and email_confirmed_at is not null;
  if email_address is null then raise exception 'FORBIDDEN: verified email required'; end if;
  select * into invitation from private.workspace_invites where token_hash=p_hash for update;
  if not found or invitation.expires_at<=now() or lower(email_address)<>invitation.email
    or (invitation.accepted_by is not null and invitation.accepted_by<>p_auth_id) then raise exception 'FORBIDDEN: invalid or expired invitation'; end if;
  select id into member_id from public.memberships where workspace_id=invitation.workspace_id and auth_user_id=p_auth_id;
  if member_id is null then
    member_id:=gen_random_uuid();
    insert into public.memberships(id,workspace_id,auth_user_id,access_role,data)
    values(member_id,invitation.workspace_id,p_auth_id,'worker',jsonb_build_object('id',member_id,'authUserId',p_auth_id,
      'name',invitation.name,'email',email_address,'accessRole','worker','role',invitation.role_label,
      'initials',upper(left(invitation.name,2)),'color','#cbd2e8','connected',false));
    select * into layout from public.canvas_layouts where workspace_id=invitation.workspace_id for update;
    update public.canvas_layouts set version=version+1,
      data=jsonb_set(jsonb_set(data,'{people}',coalesce(data->'people','[]'::jsonb)||jsonb_build_array(jsonb_build_object('id',member_id,'groupId',null,'x',450,'y',650))),'{version}',to_jsonb(version+1))
      where workspace_id=invitation.workspace_id;
    insert into public.workspace_activity(workspace_id,actor_id,text) values(invitation.workspace_id,member_id,'Joined the workspace.');
  end if;
  update private.workspace_invites set accepted_by=p_auth_id where id=invitation.id;
  return invitation.workspace_id;
end $$;
revoke all on function public.accept_workspace_invite(uuid,text) from public,anon,authenticated;
grant execute on function public.accept_workspace_invite(uuid,text) to service_role;

-- Notifications are created in the same transaction as the underlying event.
create function private.notify_project_activity() returns trigger language plpgsql security invoker set search_path='' as $$
declare p public.projects;
begin
  select * into p from public.projects where id=new.project_id;
  insert into public.notifications(workspace_id,recipient_id,project_id,source_id,source_kind,text)
    select p.workspace_id,m.id,p.id,new.id,'project',left(new.data->>'text',2000)
    from public.memberships m where m.workspace_id=p.workspace_id and (m.access_role='employer' or m.id=p.worker_id)
      and m.id::text is distinct from new.data->>'actorId'
    on conflict do nothing;
  return new;
end $$;
create trigger project_notifications after insert on public.activity_events for each row execute function private.notify_project_activity();
create function private.notify_workspace_activity() returns trigger language plpgsql security invoker set search_path='' as $$
begin
  insert into public.notifications(workspace_id,recipient_id,project_id,source_id,source_kind,text)
    select new.workspace_id,m.id,new.project_id,new.id,'workspace',left(new.text,2000)
    from public.memberships m where m.workspace_id=new.workspace_id and m.id<>new.actor_id
      and (m.access_role='employer' or exists(select 1 from public.projects p where p.id=new.project_id and p.worker_id=m.id))
    on conflict do nothing;
  return new;
end $$;
create trigger workspace_notifications after insert on public.workspace_activity for each row execute function private.notify_workspace_activity();

-- Add timestamps consistently without changing the existing JSON contracts.
create function private.touch_updated_at() returns trigger language plpgsql set search_path='' as $$
begin new.updated_at:=now(); return new; end $$;
do $$ declare t text; begin
  foreach t in array array['workspaces','memberships','canvas_layouts','projects','agreements','deliveries','revisions','proposals','invoices','workspace_files'] loop
    execute format('alter table public.%I add column created_at timestamptz not null default now(), add column updated_at timestamptz not null default now()',t);
    execute format('create trigger touch_updated_at before update on public.%I for each row execute function private.touch_updated_at()',t);
  end loop;
  for t in select tablename from pg_tables where schemaname='private' loop
    execute format('alter table private.%I enable row level security',t);
  end loop;
end $$;
revoke all on function private.notify_project_activity(),private.notify_workspace_activity(),private.touch_updated_at() from public,anon,authenticated;
