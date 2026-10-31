-- Private binary storage; all reads and writes go through the authorized Edge API.
insert into storage.buckets(id,name,public,file_size_limit)
values('crewcanvas-files','crewcanvas-files',false,26214400)
on conflict(id) do nothing;

create table public.workspace_files (
  id uuid primary key,
  workspace_id uuid not null references public.workspaces,
  project_id uuid references public.projects,
  uploaded_by uuid not null references public.memberships,
  version integer not null check(version > 0),
  deleted boolean not null default false,
  data jsonb not null check(data->>'id'=id::text and data->>'workspaceId'=workspace_id::text)
);
create index workspace_files_workspace_idx on public.workspace_files(workspace_id,project_id) where not deleted;
create table public.workspace_activity (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces,
  project_id uuid references public.projects,
  actor_id uuid not null references public.memberships,
  text text not null,
  created_at timestamptz not null default now()
);
create index workspace_activity_time_idx on public.workspace_activity(workspace_id,created_at desc);
alter table public.workspace_files enable row level security;
alter table public.workspace_activity enable row level security;
create policy file_read on public.workspace_files for select to authenticated
using(not deleted and (private.is_employer(workspace_id) or private.can_read_project(project_id)));
create policy activity_read on public.workspace_activity for select to authenticated
using(private.is_employer(workspace_id) or private.can_read_project(project_id));
revoke all on public.workspace_files,public.workspace_activity from public,anon,authenticated;
grant select on public.workspace_files,public.workspace_activity to authenticated;
grant all on public.workspace_files,public.workspace_activity to service_role;

create function public.mutate_workspace_file(p_actor_id uuid,p_file jsonb,p_expected integer,p_delete boolean default false)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare actor public.memberships; old public.workspace_files; pid uuid; fid uuid; event_text text;
begin
  select * into actor from public.memberships where id=p_actor_id;
  if not found or actor.workspace_id::text<>p_file->>'workspaceId' then raise exception 'FORBIDDEN'; end if;
  fid := (p_file->>'id')::uuid;
  pid := nullif(p_file->>'projectId','')::uuid;
  if pid is not null and not exists(select 1 from public.projects p where p.id=pid and p.workspace_id=actor.workspace_id and (actor.access_role='employer' or p.worker_id=actor.id)) then raise exception 'FORBIDDEN'; end if;
  if actor.access_role='worker' and pid is null then raise exception 'FORBIDDEN'; end if;
  -- Serialize creation/replacement/metadata/deletion, including the initial absent row.
  perform pg_advisory_xact_lock(hashtextextended(fid::text,0));
  select * into old from public.workspace_files where id=fid for update;
  if found then
    if old.workspace_id<>actor.workspace_id or (actor.access_role<>'employer' and old.uploaded_by<>actor.id) then raise exception 'FORBIDDEN'; end if;
    if old.deleted or old.version<>p_expected then raise exception 'CONFLICT'; end if;
    if p_file->>'uploadedBy'<>old.uploaded_by::text then raise exception 'FORBIDDEN'; end if;
    if exists(select 1 from jsonb_array_elements(old.data->'versions') with ordinality v(value,n) where v.value is distinct from (p_file->'versions')->(v.n::integer-1)) then raise exception 'CONFLICT: stored versions are immutable'; end if;
    if (p_delete or old.project_id is distinct from pid) and exists(select 1 from public.deliveries d where d.data->>'fileId'=fid::text) then raise exception 'CONFLICT: submitted files are retained'; end if;
    event_text := case when p_delete then 'Deleted file: ' when old.data->'versions'<>p_file->'versions' then 'Uploaded a new version: ' else 'Updated file: ' end;
  else
    if p_expected<>0 or p_delete or p_file->>'uploadedBy'<>actor.id::text then raise exception 'CONFLICT'; end if;
    event_text := 'Uploaded file: ';
  end if;
  if (p_file->>'version')::integer<>p_expected+1 then raise exception 'CONFLICT'; end if;
  insert into public.workspace_files(id,workspace_id,project_id,uploaded_by,version,deleted,data)
  values(fid,actor.workspace_id,pid,(p_file->>'uploadedBy')::uuid,p_expected+1,p_delete,p_file)
  on conflict(id) do update set project_id=excluded.project_id,version=excluded.version,deleted=excluded.deleted,data=excluded.data;
  if p_delete or (old.id is not null and old.project_id is distinct from pid) then
    update public.canvas_layouts set version=version+1,data=jsonb_set(
      jsonb_set(jsonb_set(data,'{cards}',coalesce((select jsonb_agg(c) from jsonb_array_elements(coalesce(data->'cards','[]'::jsonb)) c where not p_delete or c->>'id'<>'file:'||fid::text),'[]'::jsonb)),
      '{connections}',coalesce((select jsonb_agg(c) from jsonb_array_elements(coalesce(data->'connections','[]'::jsonb)) c where c->>'source'<>'file:'||fid::text and c->>'target'<>'file:'||fid::text),'[]'::jsonb)),
      '{version}',to_jsonb(version+1)) where workspace_id=actor.workspace_id;
  end if;
  insert into public.workspace_activity(workspace_id,project_id,actor_id,text)
  values(actor.workspace_id,pid,actor.id,event_text || (p_file->>'name'));
  return p_file;
end $$;
revoke all on function public.mutate_workspace_file(uuid,jsonb,integer,boolean) from public,anon,authenticated;
grant execute on function public.mutate_workspace_file(uuid,jsonb,integer,boolean) to service_role;
-- Serialize evidence submission against deletion/reattachment. Edge prechecks alone
-- cannot prevent a race between two requests.
create function private.validate_delivery_file() returns trigger
language plpgsql security invoker set search_path='' as $$
declare f public.workspace_files; fid uuid;
begin
  if new.data->>'fileId' is null then return new; end if;
  fid := (new.data->>'fileId')::uuid;
  perform pg_advisory_xact_lock(hashtextextended(fid::text,0));
  select * into f from public.workspace_files where id=fid;
  if not found or f.deleted or f.project_id is distinct from new.project_id or not exists(select 1 from public.projects p where p.id=new.project_id and p.workspace_id=f.workspace_id)
    or (new.data->>'fileVersion') is null or (new.data->>'fileVersion')::integer<0
    or f.data->'versions'->((new.data->>'fileVersion')::integer) is null then raise exception 'CONFLICT: valid project file version required'; end if;
  if tg_op='UPDATE' and (old.data->>'fileId' is distinct from new.data->>'fileId' or old.data->>'fileVersion' is distinct from new.data->>'fileVersion') then raise exception 'CONFLICT: delivery evidence is immutable'; end if;
  return new;
end $$;
revoke all on function private.validate_delivery_file() from public,anon,authenticated;
create trigger validate_delivery_file before insert or update on public.deliveries
for each row execute function private.validate_delivery_file();
-- Activity is append-only, including to privileged callers.
create trigger immutable_workspace_activity before update or delete on public.workspace_activity
for each row execute function private.preserve_activity();

-- Read provider transactions only after deriving access from the membership table.
create function public.workspace_payment_records(p_actor_id uuid) returns jsonb
language sql security invoker set search_path='' as $$
  select coalesce(jsonb_agg(r.data),'[]'::jsonb)
  from private.payment_records r join public.invoices i on i.id=r.invoice_id
  join public.projects p on p.id=i.project_id
  join public.memberships m on m.workspace_id=p.workspace_id
  where m.id=p_actor_id and (m.access_role='employer' or m.id=p.worker_id)
    and i.data->>'source'='sandbox'
$$;
revoke all on function public.workspace_payment_records(uuid) from public,anon,authenticated;
grant execute on function public.workspace_payment_records(uuid) to service_role;
