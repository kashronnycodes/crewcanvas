-- Optional whiteboard presentation metadata only. No financial or access policy changes.
create or replace function private.validate_board_object() returns trigger language plpgsql security invoker set search_path='' as $$
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
    exists(select 1 from jsonb_object_keys(new.data) a where a not in ('kind','text','color','x','y','width','height','z','fontSize','bold','align','thickness','points','url','fileId','source','target','locked','groupId','fileVersion','taskId')) then raise exception 'Invalid board data'; end if;
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
  if new.data ? 'locked' and jsonb_typeof(new.data->'locked')<>'boolean' then raise exception 'Invalid lock'; end if;
  if new.data ? 'groupId' and new.data->'groupId'<>'null'::jsonb then ref:=(new.data->>'groupId')::uuid; end if;
  if new.data ? 'taskId' and new.data->'taskId'<>'null'::jsonb and (new.data->>'taskId')::uuid<>new.project_id then raise exception 'Invalid task reference'; end if;
  if new.data ? 'fileVersion' and new.data->'fileVersion'<>'null'::jsonb then
    if jsonb_typeof(new.data->'fileVersion')<>'number' or (new.data->>'fileVersion')::numeric<0 or (new.data->>'fileVersion')::numeric<>trunc((new.data->>'fileVersion')::numeric) then raise exception 'Invalid file version'; end if;
    if not exists(select 1 from public.workspace_files where id=(new.data->>'fileId')::uuid and project_id=new.project_id and not deleted and jsonb_array_length(data->'versions')>(new.data->>'fileVersion')::integer) then raise exception 'Invalid project file version'; end if;
  end if;
  new.updated_by:=auth.uid(); new.updated_at:=clock_timestamp();
  return new;
end $$;
