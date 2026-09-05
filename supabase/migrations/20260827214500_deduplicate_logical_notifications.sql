begin;

alter table public.notification_outbox
  add column logical_notification_id uuid;

update public.notification_outbox
set logical_notification_id=id
where channel<>'push' or deduplication_key not like '%:push';

update public.notification_outbox push
set logical_notification_id=origin.id
from public.notification_outbox origin
where push.logical_notification_id is null
  and push.channel='push'
  and origin.channel='in_app'
  and origin.user_id=push.user_id
  and origin.event_type=push.event_type
  and push.deduplication_key=origin.deduplication_key||':push';

update public.notification_outbox
set logical_notification_id=id
where logical_notification_id is null;

alter table public.notification_outbox
  alter column logical_notification_id set not null,
  add constraint notification_outbox_logical_notification_fkey
    foreign key(logical_notification_id)
    references public.notification_outbox(id)
    on delete cascade;

create unique index notification_logical_channel_unique
  on public.notification_outbox(logical_notification_id,channel);

create or replace function private.assign_notification_logical_identity()
returns trigger
language plpgsql
security definer
set search_path=''
as $$
begin
  if new.logical_notification_id is null then
    new.logical_notification_id:=new.id;
    return new;
  end if;
  if new.logical_notification_id=new.id then
    return new;
  end if;
  if not exists(
    select 1
    from public.notification_outbox origin
    where origin.id=new.logical_notification_id
      and origin.logical_notification_id=origin.id
      and origin.user_id=new.user_id
      and origin.event_type=new.event_type
  ) then
    raise exception 'INVALID_LOGICAL_NOTIFICATION';
  end if;
  return new;
end
$$;

revoke all on function private.assign_notification_logical_identity()
from public,anon,authenticated;

create trigger notification_logical_identity
before insert on public.notification_outbox
for each row execute function private.assign_notification_logical_identity();

create or replace function private.enqueue_push_copy()
returns trigger
language plpgsql
security definer
set search_path=''
as $$
declare destination text;
begin
  if new.channel<>'in_app' then return new; end if;
  destination:=private.push_destination(new.event_type);
  if destination is null then return new; end if;
  insert into public.notification_outbox(
    user_id,event_type,channel,payload,deduplication_key,logical_notification_id
  ) values(
    new.user_id,new.event_type,'push',
    jsonb_build_object('schema','sallah.push.v1','destination',destination),
    new.deduplication_key||':push',new.logical_notification_id
  ) on conflict(channel,deduplication_key) do nothing;
  return new;
end
$$;

revoke all on function private.enqueue_push_copy()
from public,anon,authenticated;

comment on column public.notification_outbox.logical_notification_id is
  'Stable logical notification identity shared by private in-app and server-only transport rows.';

commit;
