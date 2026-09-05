import assert from 'node:assert/strict';
import test from 'node:test';
import { assertDisposableLocalTarget, withDisposableLegalFixture } from './local-legal-fixture.mjs';

const environment = { APP_ENV: 'test', SALLAH_DISPOSABLE_DB_CONFIRMED: '1' };
for (const apiUrl of [
  'https://project.supabase.co',
  'http://127.0.0.1.example.com:54321',
  'http://127.0.0.1:54321@outside.example',
  'http://user:password@localhost:54321',
  'http://localhost:54321/hosted-proxy',
  'http://localhost:54321?target=hosted',
  'not-a-url',
]) {
  test(`disposable fixture rejects target ${apiUrl}`, () => {
    assert.throws(
      () => assertDisposableLocalTarget({ apiUrl }, environment),
      /LOCAL_DISPOSABLE_SUPABASE_REQUIRED/,
    );
  });
}
test('disposable fixture requires explicit acknowledgment and test environment', () => {
  for (const input of [{}, { APP_ENV: 'test' }, { ...environment, APP_ENV: 'production' }]) {
    assert.throws(
      () => assertDisposableLocalTarget({ apiUrl: 'http://127.0.0.1:54321' }, input),
      /LOCAL_DISPOSABLE_SUPABASE_REQUIRED/,
    );
  }
});
test('disposable fixture accepts an acknowledged local Supabase API', () => {
  assert.doesNotThrow(() =>
    assertDisposableLocalTarget({ apiUrl: 'http://127.0.0.1:54321' }, environment),
  );
});

test('a remote Docker override cannot select the fixture database', () => {
  for (const override of [{ DOCKER_HOST: 'ssh://remote.example' }, { DOCKER_CONTEXT: 'remote' }]) {
    assert.throws(
      () =>
        assertDisposableLocalTarget(
          { apiUrl: 'http://127.0.0.1:54321' },
          { ...environment, ...override },
        ),
      /LOCAL_DISPOSABLE_SUPABASE_REQUIRED/,
    );
  }
});

test('a rejected overlap never enters the journey or restores another run settings', async () => {
  let queries = 0;
  let entered = false;
  await assert.rejects(
    withDisposableLegalFixture(
      { apiUrl: 'http://127.0.0.1:54321' },
      () => {
        queries++;
        throw new Error('LOCAL_LEGAL_FIXTURE_ALREADY_ACTIVE');
      },
      () => {
        entered = true;
      },
      environment,
    ),
    /LOCAL_LEGAL_FIXTURE_ALREADY_ACTIVE/,
  );
  assert.equal(queries, 1);
  assert.equal(entered, false);
});

test('a refused target cannot run SQL or a journey', async () => {
  let activity = 0;
  await assert.rejects(
    withDisposableLegalFixture(
      { apiUrl: 'https://project.supabase.co' },
      () => {
        activity++;
      },
      () => {
        activity++;
      },
      environment,
    ),
    /LOCAL_DISPOSABLE_SUPABASE_REQUIRED/,
  );
  assert.equal(activity, 0);
});

for (const failure of ['journey', 'setup', null]) {
  test(`fixture restores the previous setting and withdraws test documents after ${failure ?? 'success'}`, async () => {
    const statements = [];
    const query = (sql) => {
      statements.push(sql);
      if (statements.length === 1)
        return JSON.stringify({ value: { enabled: false, note: "owner's baseline" } });
      if (statements.length === 2 && failure === 'setup') throw new Error('SETUP_FAILED');
      return '';
    };
    const action = withDisposableLegalFixture(
      { apiUrl: 'http://127.0.0.1:54321' },
      query,
      () => {
        if (failure === 'journey') throw new Error('JOURNEY_FAILED');
        return 'done';
      },
      environment,
    );
    if (failure) await assert.rejects(action, new RegExp(`${failure.toUpperCase()}_FAILED`));
    else assert.equal(await action, 'done');
    assert.equal(statements.length, 3);
    assert.match(statements[2], /owner''s baseline/);
    assert.match(statements[2], /withdrawn_at=clock_timestamp\(\)/);
    assert.match(statements[2], /approval_reference='test-fixture-only:http-journey:/);
  });
}

test('an absent baseline setting is deleted again after the fixture', async () => {
  const statements = [];
  await withDisposableLegalFixture(
    { apiUrl: 'http://localhost:54321' },
    (sql) => {
      statements.push(sql);
      return statements.length === 1 ? 'null' : '';
    },
    () => {},
    environment,
  );
  assert.match(statements.at(-1), /delete from public.system_settings where key='legal.consent'/);
});
