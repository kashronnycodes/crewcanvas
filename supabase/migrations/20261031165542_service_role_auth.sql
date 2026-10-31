-- Verify effective database privilege rather than compare two valid opaque API keys.
create function public.backend_service_authorized() returns boolean
language sql stable security invoker set search_path='' as $$ select current_user='service_role' $$;
revoke all on function public.backend_service_authorized() from public,anon,authenticated;
grant execute on function public.backend_service_authorized() to service_role;
-- This bounded integration supports one membership per Sandbox business seller.
create unique index seller_connection_merchant_idx on private.seller_connections(merchant_id);
