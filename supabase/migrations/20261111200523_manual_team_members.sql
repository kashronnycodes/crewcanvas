-- Manual roster entries never create Auth users or grant account access.
-- Existing records, owner membership and permission policies are unchanged.
create function public.add_workspace_member(p_actor_id uuid,p_id uuid,p_email text,p_name text,p_role text)
returns uuid language plpgsql security invoker set search_path='' as $$
declare actor public.memberships; prior public.memberships; person jsonb;
begin
  select * into actor from public.memberships where id=p_actor_id and access_role='employer';
  if not found then raise exception 'FORBIDDEN'; end if;
  if length(trim(p_name)) not between 2 and 80 or length(trim(p_role)) not between 2 and 80
    or length(trim(p_email))>254 or trim(p_email) !~ '^[^[:space:]@]+@[^[:space:]@]+[.][^[:space:]@]+$'
    then raise exception 'VALIDATION'; end if;
  perform 1 from public.workspaces where id=actor.workspace_id for update;
  select * into prior from public.memberships where id=p_id;
  if found then
    if prior.workspace_id<>actor.workspace_id or prior.access_role<>'worker'
      or lower(prior.data->>'email')<>lower(trim(p_email))
      or prior.data->>'name'<>trim(p_name) or prior.data->>'role'<>trim(p_role) then raise exception 'CONFLICT'; end if;
    return p_id;
  end if;
  if exists(select 1 from public.memberships where workspace_id=actor.workspace_id
    and lower(data->>'email')=lower(trim(p_email))) then raise exception 'CONFLICT: already a member'; end if;
  person:=jsonb_build_object('id',p_id,'name',trim(p_name),'email',lower(trim(p_email)),
    'accessRole','worker','role',trim(p_role),'initials',upper(left(trim(p_name),2)),'color','#cbd2e8','connected',false);
  insert into public.memberships(id,workspace_id,access_role,data) values(p_id,actor.workspace_id,'worker',person);
  insert into public.workspace_activity(workspace_id,actor_id,text) values(actor.workspace_id,actor.id,'Added a team member.');
  return p_id;
end $$;
revoke all on function public.add_workspace_member(uuid,uuid,text,text,text) from public,anon,authenticated;
grant execute on function public.add_workspace_member(uuid,uuid,text,text,text) to service_role;

create or replace function public.invite_workspace_member(p_actor_id uuid,p_id uuid,p_email text,p_name text,p_role text,p_hash text)
returns uuid language plpgsql security invoker set search_path='' as $$
declare actor public.memberships;
begin
  select * into actor from public.memberships where id=p_actor_id and access_role='employer';
  if not found then raise exception 'FORBIDDEN'; end if;
  -- Share the workspace lock with manual creation and invitation acceptance.
  perform 1 from public.workspaces where id=actor.workspace_id for update;
  if exists(select 1 from public.memberships where workspace_id=actor.workspace_id and lower(data->>'email')=lower(p_email) and auth_user_id is not null) then raise exception 'CONFLICT: already a member'; end if;
  if (select count(*) from private.workspace_invites where workspace_id=actor.workspace_id and created_at>now()-interval '1 hour')>=50 then raise exception 'LIMIT: invitation rate'; end if;
  insert into private.workspace_invites(id,workspace_id,invited_by,email,name,role_label,token_hash)
    values(p_id,actor.workspace_id,actor.id,lower(p_email),p_name,p_role,p_hash);
  return p_id;
end $$;
revoke all on function public.invite_workspace_member(uuid,uuid,text,text,text,text) from public,anon,authenticated;
grant execute on function public.invite_workspace_member(uuid,uuid,text,text,text,text) to service_role;

create or replace function public.accept_workspace_invite(p_auth_id uuid,p_hash text)
returns uuid language plpgsql security invoker set search_path='' as $$
declare invitation private.workspace_invites; email_address text; member_id uuid; layout public.canvas_layouts;
begin
  email_address := private.verified_auth_email(p_auth_id);
  if email_address is null then raise exception 'FORBIDDEN: verified email required'; end if;
  select * into invitation from private.workspace_invites where token_hash=p_hash for update;
  if not found or invitation.expires_at<=now() or lower(email_address)<>invitation.email
    or (invitation.accepted_by is not null and invitation.accepted_by<>p_auth_id) then raise exception 'FORBIDDEN: invalid or expired invitation'; end if;
  perform 1 from public.workspaces where id=invitation.workspace_id for update;
  select id into member_id from public.memberships where workspace_id=invitation.workspace_id and auth_user_id=p_auth_id;
  -- Claim the manually added person without changing their ID, profile or assignments.
  if member_id is null then
    select id into member_id from public.memberships where workspace_id=invitation.workspace_id
      and auth_user_id is null and lower(data->>'email')=lower(email_address) for update;
    if member_id is not null then
      update public.memberships set auth_user_id=p_auth_id,
        data=jsonb_set(data,'{authUserId}',to_jsonb(p_auth_id::text)) where id=member_id;
      insert into public.workspace_activity(workspace_id,actor_id,text) values(invitation.workspace_id,member_id,'Joined the workspace.');
    end if;
  end if;
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
