begin;

create function public.abandon_ai_intake_session(p_session_id uuid) returns void
language plpgsql security definer set search_path='' as $$
declare actor uuid:=auth.uid(); current_status text;
begin
  if actor is null then raise exception 'AUTH_REQUIRED'; end if;
  select status into current_status
  from public.ai_sessions
  where id=p_session_id and user_id=actor and purpose='service_request_intake'
  for update;
  if current_status is null then raise exception 'AI_SESSION_NOT_ABANDONABLE'; end if;
  if current_status='abandoned' then return; end if;
  if current_status<>'active' then raise exception 'AI_SESSION_NOT_ABANDONABLE'; end if;
  update public.ai_sessions
  set status='abandoned',ended_at=now(),updated_at=now()
  where id=p_session_id;
end $$;

revoke all on function public.abandon_ai_intake_session(uuid) from public,anon,authenticated;
grant execute on function public.abandon_ai_intake_session(uuid) to authenticated;

commit;
