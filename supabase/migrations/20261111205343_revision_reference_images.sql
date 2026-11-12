-- Reuse existing private workspace files and immutable revision JSON history.
-- No existing file, task, revision or permission policy is rewritten.
create function private.validate_revision_references() returns trigger
language plpgsql security invoker set search_path='' as $$
declare reference jsonb; f public.workspace_files; refs jsonb := coalesce(new.data->'references','[]'::jsonb);
begin
  if tg_op='UPDATE' and coalesce(old.data->'references','[]'::jsonb) is distinct from refs then
    raise exception 'CONFLICT: revision references are immutable';
  end if;
  if jsonb_typeof(refs)<>'array' or jsonb_array_length(refs)>10 then raise exception 'VALIDATION: revision references'; end if;
  if (select count(*) from jsonb_array_elements(refs))<>(select count(distinct r->>'fileId') from jsonb_array_elements(refs) r)
    then raise exception 'VALIDATION: duplicate reference'; end if;
  for reference in select r from jsonb_array_elements(refs) r order by r->>'fileId' loop
    perform pg_advisory_xact_lock(hashtextextended(reference->>'fileId',0));
    select * into f from public.workspace_files where id=(reference->>'fileId')::uuid;
    if not found or f.deleted or f.project_id is distinct from new.project_id
      or f.data->>'purpose' is distinct from 'revision_reference'
      or not exists(select 1 from public.projects p where p.id=new.project_id and p.workspace_id=f.workspace_id)
      or reference->>'version' is null or (reference->>'version')::integer<0
      or f.data->'versions'->((reference->>'version')::integer) is null
      or coalesce(f.data->'versions'->((reference->>'version')::integer)->>'mime','') not like 'image/%'
      then raise exception 'CONFLICT: valid task reference image required'; end if;
  end loop;
  return new;
end $$;
revoke all on function private.validate_revision_references() from public,anon,authenticated;
create trigger validate_revision_references before insert or update on public.revisions
for each row execute function private.validate_revision_references();

create function private.retain_revision_reference_files() returns trigger
language plpgsql security invoker set search_path='' as $$
begin
  if tg_op='UPDATE' and old.data->>'purpose' is distinct from new.data->>'purpose' then
    raise exception 'CONFLICT: file purpose is immutable';
  end if;
  if new.data->>'purpose'='revision_reference' and (new.project_id is null or coalesce(new.data->>'mime','') not like 'image/%') then
    raise exception 'VALIDATION: task image required';
  end if;
  if tg_op='UPDATE' and (new.deleted or old.project_id is distinct from new.project_id) and exists(
    select 1 from public.revisions r, jsonb_array_elements(coalesce(r.data->'references','[]'::jsonb)) ref
    where ref->>'fileId'=new.id::text
  ) then raise exception 'CONFLICT: revision reference evidence is retained'; end if;
  return new;
end $$;
revoke all on function private.retain_revision_reference_files() from public,anon,authenticated;
create trigger retain_revision_reference_files before insert or update on public.workspace_files
for each row execute function private.retain_revision_reference_files();

create function private.keep_references_out_of_deliveries() returns trigger
language plpgsql security invoker set search_path='' as $$
begin
  if exists(select 1 from public.workspace_files f where f.id=(new.data->>'fileId')::uuid and f.data->>'purpose'='revision_reference') then
    raise exception 'VALIDATION: reference images are not deliverables';
  end if;
  return new;
end $$;
revoke all on function private.keep_references_out_of_deliveries() from public,anon,authenticated;
create trigger keep_references_out_of_deliveries before insert or update on public.deliveries
for each row execute function private.keep_references_out_of_deliveries();
