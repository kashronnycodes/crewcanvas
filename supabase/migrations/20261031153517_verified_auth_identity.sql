-- Supabase service_role cannot SELECT auth.users directly. Keep that table private;
-- expose only a verified-email lookup inside the unexposed private schema.
create function private.verified_auth_email(p_auth_id uuid) returns text
language sql stable security definer set search_path='' as $$
  select email from auth.users where id=p_auth_id and email_confirmed_at is not null
$$;
revoke all on function private.verified_auth_email(uuid) from public,anon,authenticated;
grant execute on function private.verified_auth_email(uuid) to service_role;

create or replace function public.create_workspace(p_auth_id uuid,p_id uuid,p_name text,p_person_name text,p_timezone text)
returns uuid language plpgsql security invoker set search_path='' as $$
declare email_address text; member_id uuid:=gen_random_uuid(); person jsonb;
begin
  email_address := private.verified_auth_email(p_auth_id);
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

create or replace function public.accept_workspace_invite(p_auth_id uuid,p_hash text)
returns uuid language plpgsql security invoker set search_path='' as $$
declare invitation private.workspace_invites; email_address text; member_id uuid; layout public.canvas_layouts;
begin
  email_address := private.verified_auth_email(p_auth_id);
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

