-- A missing connection is expected during first-time owner setup. Webhook
-- callers already reject NULL, and ambiguous connections must still fail.
create or replace function public.configured_sandbox_seller(p_merchant_id text,p_email text) returns uuid
language plpgsql security invoker set search_path='' as $$
declare result uuid; matches integer;
begin
  select count(*),(array_agg(id))[1] into matches,result from private.seller_connections
    where environment='sandbox' and merchant_id=p_merchant_id and lower(email)=lower(p_email);
  if matches>1 then raise exception 'Exactly one configured Sandbox seller is required'; end if;
  return result;
end $$;
revoke all on function public.configured_sandbox_seller(text,text) from public,anon,authenticated;
grant execute on function public.configured_sandbox_seller(text,text) to service_role;
