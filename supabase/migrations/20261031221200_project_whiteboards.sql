-- Additive project collaboration; existing financial/domain records are untouched.
create table public.board_objects (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id),
  author_id uuid not null default auth.uid() references auth.users(id),
  updated_by uuid not null default auth.uid() references auth.users(id),
  version integer not null default 1 check(version > 0),
  deleted boolean not null default false,
  data jsonb not null,
  updated_at timestamptz not null default now()
);
create index board_objects_project_idx on public.board_objects(project_id);
alter table public.board_objects enable row level security;
revoke all on public.board_objects from public,anon,authenticated;
grant select on public.board_objects to authenticated;
grant insert(id,project_id,data) on public.board_objects to authenticated;
grant update(data,deleted,version) on public.board_objects to authenticated;
grant all on public.board_objects to service_role;
create policy board_read on public.board_objects for select to authenticated using(private.can_read_project(project_id));
create policy board_create on public.board_objects for insert to authenticated with check(private.can_read_project(project_id) and author_id=(select auth.uid()));
create policy board_edit on public.board_objects for update to authenticated using(private.can_read_project(project_id)) with check(private.can_read_project(project_id));

create function private.validate_board_object() returns trigger language plpgsql security invoker set search_path='' as $$
declare k text; n text; point jsonb; ref uuid;
begin
  if tg_op='UPDATE' then
    if new.id<>old.id or new.project_id<>old.project_id or new.author_id<>old.author_id or new.version<>old.version+1 then raise exception 'CONFLICT: invalid board version or identity'; end if;
  else
    perform pg_advisory_xact_lock(hashtextextended(new.project_id::text,718));
    if (select count(*) from public.board_objects where project_id=new.project_id)>=1000 then raise exception 'Board limit reached'; end if;
    if new.version<>1 then raise exception 'Invalid initial board version'; end if;
  end if;
  if jsonb_typeof(new.data)<>'object' or octet_length(new.data::text)>65536 or
    not(new.data ?& array['kind','text','color','x','y','width','height','z','fontSize','bold','align','thickness','points','url','fileId','source','target']) or
    exists(select 1 from jsonb_object_keys(new.data) a where a not in ('kind','text','color','x','y','width','height','z','fontSize','bold','align','thickness','points','url','fileId','source','target')) then raise exception 'Invalid board data'; end if;
  k:=new.data->>'kind';
  if jsonb_typeof(new.data->'kind')<>'string' or jsonb_typeof(new.data->'color')<>'string' or jsonb_typeof(new.data->'align')<>'string' or
    k not in ('note','text','rectangle','circle','diamond','line','arrow','stroke','frame','link','file','connector') or
    new.data->>'color' not in ('sand','sage','sky','rose','ink') or
    jsonb_typeof(new.data->'text')<>'string' or length(new.data->>'text')>6000 or
    jsonb_typeof(new.data->'bold')<>'boolean' or new.data->>'align' not in ('left','center','right') or
    jsonb_typeof(new.data->'url')<>'string' or length(new.data->>'url')>2000 or
    (new.data->>'url'<>'' and new.data->>'url' !~* '^https://') then raise exception 'Invalid board content'; end if;
  foreach n in array array['x','y','width','height','z','fontSize','thickness'] loop
    if jsonb_typeof(new.data->n)<>'number' then raise exception 'Invalid board number'; end if;
  end loop;
  if abs((new.data->>'x')::numeric)>100000 or abs((new.data->>'y')::numeric)>100000 or
    (new.data->>'width')::numeric not between 20 and 3000 or (new.data->>'height')::numeric not between 20 and 3000 or
    (new.data->>'z')::numeric not between -1000 and 1000 or (new.data->>'fontSize')::numeric not between 12 and 72 or
    (new.data->>'thickness')::numeric not between 1 and 16 or
    (new.data->>'z')::numeric<>trunc((new.data->>'z')::numeric) or
    (new.data->>'fontSize')::numeric<>trunc((new.data->>'fontSize')::numeric) then raise exception 'Invalid board dimensions'; end if;
  if jsonb_typeof(new.data->'points')<>'array' or jsonb_array_length(new.data->'points')>1000 then raise exception 'Invalid drawing'; end if;
  for point in select value from jsonb_array_elements(new.data->'points') loop
    if jsonb_typeof(point)<>'array' or jsonb_array_length(point)<>2 or jsonb_typeof(point->0)<>'number' or jsonb_typeof(point->1)<>'number' or (point->>0)::numeric not between 0 and 3000 or (point->>1)::numeric not between 0 and 3000 then raise exception 'Invalid drawing point'; end if;
  end loop;
  foreach n in array array['source','target','fileId'] loop
    if new.data->n<>'null'::jsonb then
      ref:=(new.data->>n)::uuid;
      if n='fileId' then
        if not exists(select 1 from public.workspace_files where id=ref and project_id=new.project_id and not deleted) then raise exception 'Invalid project file'; end if;
      elsif not exists(select 1 from public.board_objects where id=ref and project_id=new.project_id and id<>new.id and data->>'kind'<>'connector') then raise exception 'Invalid connector endpoint'; end if;
    end if;
  end loop;
  if k='connector' and (new.data->>'source' is null or new.data->>'target' is null or new.data->>'source'=new.data->>'target') then raise exception 'Invalid connector'; end if;
  new.updated_by:=auth.uid(); new.updated_at:=clock_timestamp();
  return new;
end $$;
revoke all on function private.validate_board_object() from public,anon,authenticated;
create trigger validate_board_object before insert or update on public.board_objects for each row execute function private.validate_board_object();

create table public.board_comments (
  id uuid primary key default gen_random_uuid(),
  object_id uuid not null references public.board_objects(id),
  author_id uuid not null default auth.uid() references auth.users(id),
  author_name text not null check(length(author_name) between 1 and 100),
  body text not null check(length(body) between 1 and 2000),
  reply_to uuid references public.board_comments(id),
  resolved boolean not null default false,
  created_at timestamptz not null default now()
);
alter table public.board_comments enable row level security;
create index board_comments_object_idx on public.board_comments(object_id,created_at);
revoke all on public.board_comments from public,anon,authenticated;
grant select on public.board_comments to authenticated;
grant insert(id,object_id,author_name,body,reply_to) on public.board_comments to authenticated;
grant update(resolved) on public.board_comments to authenticated;
grant all on public.board_comments to service_role;
create policy comment_read on public.board_comments for select to authenticated using(exists(select 1 from public.board_objects b where b.id=object_id and private.can_read_project(b.project_id)));
create policy comment_create on public.board_comments for insert to authenticated with check(author_id=(select auth.uid()) and exists(select 1 from public.board_objects b where b.id=object_id and not b.deleted and private.can_read_project(b.project_id)));
create policy comment_resolve on public.board_comments for update to authenticated using(exists(select 1 from public.board_objects b where b.id=object_id and private.can_read_project(b.project_id))) with check(exists(select 1 from public.board_objects b where b.id=object_id and private.can_read_project(b.project_id)));

-- Display attribution is derived from the current membership, never user-supplied.
create function private.board_comment_author() returns trigger language plpgsql security invoker set search_path='' as $$
begin
  select m.data->>'name' into new.author_name from public.memberships m
  join public.projects p on p.workspace_id=m.workspace_id join public.board_objects b on b.project_id=p.id
  where b.id=new.object_id and m.auth_user_id=auth.uid();
  if new.author_name is null then raise exception 'FORBIDDEN'; end if;
  if new.reply_to is not null and not exists(select 1 from public.board_comments where id=new.reply_to and object_id=new.object_id) then raise exception 'Invalid reply'; end if;
  return new;
end $$;
revoke all on function private.board_comment_author() from public,anon,authenticated;
create trigger board_comment_author before insert on public.board_comments for each row execute function private.board_comment_author();

-- Soft deletes remain SELECT-authorized, so Realtime applies the same row policy
-- to every notification, including deletion/undo. No public Broadcast is used.
do $$ begin
  if exists(select 1 from pg_publication where pubname='supabase_realtime') then
    alter publication supabase_realtime add table public.board_objects,public.board_comments;
  end if;
end $$;
