-- Hosted scheduling extensions are unavailable in embedded PostgreSQL tests.
-- The service-only setup RPC below is still created and permission-tested there.
do $$ begin
  if exists(select 1 from pg_available_extensions where name='pg_cron') then
    create extension if not exists pg_cron;
  end if;
  if exists(select 1 from pg_available_extensions where name='pg_net') then
    create extension if not exists pg_net;
  end if;
end $$;

-- Store the existing server key in Vault without placing it in SQL source or logs.
-- This helper has one fixed destination and cannot schedule arbitrary HTTP requests.
create function private.configure_reconciliation(p_service_key text) returns bigint
language plpgsql security definer set search_path='' as $$
declare secret_id uuid; existing_key text; job_id bigint; existing_command text;
  command_text text := $command$
    select net.http_post(
      url := (select decrypted_secret from vault.decrypted_secrets where name='crewcanvas_project_url') || '/functions/v1/reconcile',
      headers := jsonb_build_object('Content-Type','application/json','apikey',(select decrypted_secret from vault.decrypted_secrets where name='crewcanvas_service_key')),
      body := '{}'::jsonb, timeout_milliseconds := 60000
    );
  $command$;
begin
  if p_service_key is null or length(p_service_key)<40 then raise exception 'A valid server credential is required'; end if;
  select id,decrypted_secret into secret_id,existing_key from vault.decrypted_secrets where name='crewcanvas_service_key';
  if secret_id is null then
    perform vault.create_secret(p_service_key,'crewcanvas_service_key');
  elsif existing_key<>p_service_key then raise exception 'Existing scheduler credential differs; review rotation explicitly'; end if;
  select id,decrypted_secret into secret_id,existing_key from vault.decrypted_secrets where name='crewcanvas_project_url';
  if secret_id is null then
    perform vault.create_secret('https://tsnwowlyrlxpwwetmxns.supabase.co','crewcanvas_project_url');
  elsif existing_key<>'https://tsnwowlyrlxpwwetmxns.supabase.co' then raise exception 'Unexpected scheduler project'; end if;
  select jobid,command into job_id,existing_command from cron.job where jobname='crewcanvas-reconcile';
  if job_id is null then
    job_id:=cron.schedule('crewcanvas-reconcile','* * * * *',command_text);
  elsif existing_command<>command_text then raise exception 'Existing reconciliation job differs; refusing to overwrite'; end if;
  return job_id;
end $$;
revoke all on function private.configure_reconciliation(text) from public,anon,authenticated;
grant execute on function private.configure_reconciliation(text) to service_role;
create function public.configure_reconciliation(p_service_key text) returns bigint
language sql security invoker set search_path='' as $$
  select private.configure_reconciliation(p_service_key)
$$;
revoke all on function public.configure_reconciliation(text) from public,anon,authenticated;
grant execute on function public.configure_reconciliation(text) to service_role;
