// Disposable integration-test fixture only; never a source of production legal approval.
export function assertDisposableLocalTarget(config, environment = process.env) {
  let target;
  try {
    target = new URL(config.apiUrl);
  } catch {
    throw new Error('LOCAL_DISPOSABLE_SUPABASE_REQUIRED');
  }
  if (
    environment.APP_ENV !== 'test' ||
    environment.SALLAH_DISPOSABLE_DB_CONFIRMED !== '1' ||
    (environment.DOCKER_HOST && environment.DOCKER_HOST !== 'unix:///var/run/docker.sock') ||
    (environment.DOCKER_CONTEXT && environment.DOCKER_CONTEXT !== 'default') ||
    target.protocol !== 'http:' ||
    !['127.0.0.1', 'localhost'].includes(target.hostname) ||
    target.port !== '54321' ||
    target.username ||
    target.password ||
    target.search ||
    target.hash ||
    target.pathname !== '/'
  ) {
    throw new Error('LOCAL_DISPOSABLE_SUPABASE_REQUIRED');
  }
}

export async function withDisposableLegalFixture(config, query, run, environment = process.env) {
  assertDisposableLocalTarget(config, environment);
  const quote = (value) => `'${value.replaceAll("'", "''")}'`;
  const suffix = crypto.randomUUID();
  // A committed unique marker excludes the whole async HTTP journey, including its restore.
  // An interrupted run deliberately requires a fresh disposable db reset, not a timed takeover.
  const previous = JSON.parse(
    query(
      `begin;
       do $fixture_claim$ declare claimed integer; begin
         insert into public.system_settings(key,value) values('test.legal.http-fixture-lock',jsonb_build_object('owner',${quote(suffix)}))
           on conflict(key) do nothing;
         get diagnostics claimed=row_count;
         if claimed<>1 then raise exception 'LOCAL_LEGAL_FIXTURE_ALREADY_ACTIVE'; end if;
       end $fixture_claim$;
       select coalesce((select jsonb_build_object('value',value) from public.system_settings where key='legal.consent'),'null'::jsonb);
       commit;`,
    ),
  );
  const version = `test-http-v1-${suffix}`;
  const nextVersion = `test-http-v2-${suffix}`;
  const reference = `test-fixture-only:http-journey:${suffix}`;
  const documents = (policyVersion, kinds, age) => `
    with stamp as materialized (select clock_timestamp()-interval '${age}' as observed)
    insert into public.legal_documents(document_type,version,locale,content_hash,published_at,
      effective_at,requires_acceptance,title,body,approved_at,approval_reference)
    select kind,${quote(policyVersion)},locale,
      encode(extensions.digest(convert_to('TEST ONLY: synthetic '||kind||' '||locale||' '||${quote(policyVersion)},'UTF8'),'sha256'),'hex'),
      stamp.observed,stamp.observed,true,'TEST ONLY: synthetic '||kind,
      'TEST ONLY: synthetic '||kind||' '||locale||' '||${quote(policyVersion)},
      stamp.observed,${quote(reference)}
    from unnest(array[${kinds.map(quote).join(',')}]) kind
    cross join unnest(array['ar','en','ur','hi']) locale cross join stamp;
  `;
  try {
    query(`begin;
      ${documents(version, ['privacy', 'terms', 'community'], '1 minute')}
      insert into public.system_settings(key,value)
      values('legal.consent','{"enabled":true,"scope":"disposable-http-test-only"}')
      on conflict(key) do update set value=excluded.value;
      commit;`);
    return await run({
      version,
      nextVersion,
      rotate: () => query(`begin; ${documents(nextVersion, ['terms'], '1 second')} commit;`),
    });
  } finally {
    const restore =
      previous === null
        ? "delete from public.system_settings where key='legal.consent';"
        : `insert into public.system_settings(key,value) values('legal.consent',${quote(JSON.stringify(previous.value))}::jsonb)
         on conflict(key) do update set value=excluded.value;`;
    query(`begin; ${restore}
      update public.legal_documents set withdrawn_at=clock_timestamp()
      where approval_reference=${quote(reference)} and withdrawn_at is null;
      delete from public.system_settings where key='test.legal.http-fixture-lock' and value->>'owner'=${quote(suffix)};
      commit;`);
  }
}
