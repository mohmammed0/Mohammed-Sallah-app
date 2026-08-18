import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { spawnTool } from './resolve-tool.mjs';

function run(command, args, options = {}) {
  const result =
    command === 'supabase'
      ? spawnTool(command, args, { encoding: 'utf8', ...options })
      : process.platform === 'win32'
        ? spawnSync('wsl.exe', ['-e', command, ...args], {
            encoding: 'utf8',
            shell: false,
            ...options,
          })
        : spawnSync(command, args, { encoding: 'utf8', shell: false, ...options });
  if (result.status !== 0) {
    throw new Error(
      `${command} ${args.join(' ')} failed\n${result.stdout ?? ''}\n${result.stderr ?? ''}`,
    );
  }
  return result.stdout ?? '';
}

run('supabase', [
  'db',
  'reset',
  '--local',
  '--version',
  '20260818140300',
  '--sql-paths',
  './seed.sql',
  '--yes',
]);

const container = run('docker', [
  'ps',
  '--filter',
  'name=supabase_db_sallah',
  '--format',
  '{{.Names}}',
])
  .trim()
  .split(/\r?\n/u)[0];
if (!container) throw new Error('LOCAL_SUPABASE_DATABASE_CONTAINER_REQUIRED');

const psql = (sql) =>
  run(
    'docker',
    ['exec', '-i', container, 'psql', '-U', 'postgres', '-d', 'postgres', '-v', 'ON_ERROR_STOP=1'],
    { input: sql },
  );

psql(`
insert into auth.users(
  id,instance_id,aud,role,email,encrypted_password,email_confirmed_at,
  confirmation_token,recovery_token,email_change_token_new,email_change,
  raw_app_meta_data,raw_user_meta_data,created_at,updated_at
) values(
  'e1000000-0000-4000-8000-000000000001',
  '00000000-0000-0000-0000-000000000000','authenticated','authenticated',
  'legacy-upgrade@test.invalid','',now(),'','','','',
  '{"provider":"email","providers":["email"]}'::jsonb,
  '{"display_name":"Legacy upgrade fixture","preferred_locale":"ar"}'::jsonb,
  now(),now()
);

insert into public.service_requests(
  id,customer_id,category_id,city_id,title,structured_description,original_text,
  requested_start,requested_end,status
)
select fixture.id,'e1000000-0000-4000-8000-000000000001',category.id,city.id,
  fixture.label,fixture.label,fixture.label,fixture.starts_at,fixture.ends_at,'draft'
from (values
  ('e2000000-0000-4000-8000-000000000001'::uuid,'both-null',null::timestamptz,null::timestamptz),
  ('e2000000-0000-4000-8000-000000000002'::uuid,'start-only','2030-01-01T08:00:00Z'::timestamptz,null::timestamptz),
  ('e2000000-0000-4000-8000-000000000003'::uuid,'valid-pair','2030-01-02T08:00:00Z'::timestamptz,'2030-01-02T10:00:00Z'::timestamptz),
  ('e2000000-0000-4000-8000-000000000004'::uuid,'end-only',null::timestamptz,'2030-01-03T10:00:00Z'::timestamptz),
  ('e2000000-0000-4000-8000-000000000005'::uuid,'invalid-pair','2030-01-04T10:00:00Z'::timestamptz,'2030-01-04T09:00:00Z'::timestamptz)
) fixture(id,label,starts_at,ends_at)
cross join lateral(select id from public.service_categories where slug='general-handyman') category
cross join lateral(select id from public.cities where code='riyadh') city;
`);

psql(
  readFileSync(
    new URL(
      '../supabase/migrations/20260818183816_merge_fix_integration_contracts.sql',
      import.meta.url,
    ),
    'utf8',
  ),
);

psql(`
do $$
begin
  if not exists(
    select 1 from public.service_requests where id='e2000000-0000-4000-8000-000000000001'
      and timing_mode='flexible' and requested_start is null and requested_end is null
  ) then raise exception 'BOTH_NULL_NOT_FLEXIBLE'; end if;
  if not exists(
    select 1 from public.service_requests where id='e2000000-0000-4000-8000-000000000002'
      and timing_mode='scheduled' and requested_start='2030-01-01T08:00:00Z'
      and requested_end='2030-01-01T09:00:00Z'
  ) then raise exception 'START_ONLY_NOT_BOUNDED_SCHEDULED'; end if;
  if not exists(
    select 1 from public.service_requests where id='e2000000-0000-4000-8000-000000000003'
      and timing_mode='scheduled' and requested_start='2030-01-02T08:00:00Z'
      and requested_end='2030-01-02T10:00:00Z'
  ) then raise exception 'VALID_PAIR_CHANGED'; end if;
  if not exists(
    select 1 from public.service_requests where id='e2000000-0000-4000-8000-000000000004'
      and timing_mode='flexible' and requested_start is null and requested_end is null
  ) then raise exception 'END_ONLY_NOT_NORMALIZED_FLEXIBLE'; end if;
  if not exists(
    select 1 from public.service_requests where id='e2000000-0000-4000-8000-000000000005'
      and timing_mode='scheduled' and requested_start='2030-01-04T10:00:00Z'
      and requested_end='2030-01-04T11:00:00Z'
  ) then raise exception 'INVALID_PAIR_NOT_BOUNDED_SCHEDULED'; end if;
  if (select count(*) from public.service_requests where id::text like 'e2000000-%')<>5 then
    raise exception 'LEGACY_ROWS_LOST';
  end if;
end $$;
`);

console.log('legacy timing upgrade: 5/5 combinations PASS');
