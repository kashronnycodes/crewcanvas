-- Pre-authentication admission only. No account, workspace or payment rows change.
create table private.judge_access_attempts (
  bucket text not null,
  window_start timestamptz not null,
  attempts integer not null check (attempts > 0),
  primary key (bucket, window_start)
);
revoke all on private.judge_access_attempts from public, anon, authenticated;
grant select, insert, update, delete on private.judge_access_attempts to service_role;

create function public.judge_access_admit(p_fingerprint text)
returns boolean language plpgsql security invoker set search_path = '' as $$
declare v_window timestamptz := date_trunc('minute', clock_timestamp()); v_global integer; v_ip integer;
begin
  if p_fingerprint !~ '^[a-f0-9]{64}$' then raise exception 'Invalid admission key'; end if;
  -- Every caller takes the global row first, avoiding deadlocks and IP-spoofing bypass.
  insert into private.judge_access_attempts values ('global', v_window, 1)
    on conflict (bucket, window_start) do update set attempts = private.judge_access_attempts.attempts + 1
    returning attempts into v_global;
  if v_global > 40 then return false; end if;
  insert into private.judge_access_attempts values (p_fingerprint, v_window, 1)
    on conflict (bucket, window_start) do update set attempts = private.judge_access_attempts.attempts + 1
    returning attempts into v_ip;
  delete from private.judge_access_attempts where window_start < v_window - interval '10 minutes';
  return v_global <= 40 and v_ip <= 6;
end;
$$;
revoke all on function public.judge_access_admit(text) from public, anon, authenticated;
grant execute on function public.judge_access_admit(text) to service_role;
