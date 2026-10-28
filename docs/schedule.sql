-- Run only after deploying the functions and storing secrets in Supabase Vault.
-- Add Vault secrets through the dashboard: crewcanvas_project_url and
-- crewcanvas_service_key. The key is the server service-role key, never a
-- publishable key. Keep it out of migration files and logs.
create extension if not exists pg_cron;
create extension if not exists pg_net;
select cron.schedule('crewcanvas-reconcile','* * * * *', $$
  select net.http_post(
    url := (select decrypted_secret from vault.decrypted_secrets where name='crewcanvas_project_url') || '/functions/v1/reconcile',
    headers := jsonb_build_object('Content-Type','application/json','apikey',(select decrypted_secret from vault.decrypted_secrets where name='crewcanvas_service_key')),
    body := '{}'::jsonb,
    timeout_milliseconds := 60000
  );
$$);
