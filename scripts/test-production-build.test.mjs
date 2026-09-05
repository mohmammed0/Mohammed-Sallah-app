import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { productionRequiredKeys } from './production-config-validation.mjs';
import { runProductionBuild } from './run-production-build.mjs';

const firebase = {
  project_info: { project_id: 'fixture-project', project_number: '1234567890' },
  client: [
    {
      client_info: {
        mobilesdk_app_id: '1:1234567890:android:fixture',
        android_client_info: { package_name: 'sa.sallah.fixture' },
      },
      api_key: [{ current_key: 'synthetic-public-client-key' }],
    },
  ],
  configuration_version: '1',
};
const environment = {
  SALLAH_ANDROID_PACKAGE: 'sa.sallah.fixture',
  GOOGLE_SERVICES_JSON_CONTENT: JSON.stringify(firebase),
};

test('production workflow forwards the whole validator contract only to validation', () => {
  const workflow = readFileSync(
    new URL('../.github/workflows/release-readiness.yml', import.meta.url),
    'utf8',
  );
  const validator = /- run: pnpm config:validate:production\r?\n([\s\S]*?)(?=\r?\n      - )/u.exec(
    workflow,
  )?.[1];
  assert.ok(validator);
  for (const key of productionRequiredKeys)
    assert.match(validator, new RegExp(`^          ${key}:`, 'mu'), key);
  const build = /- run: pnpm build:production\r?\n([\s\S]*)/u.exec(workflow)?.[1];
  assert.ok(build);
  assert.match(build, /NEXT_PUBLIC_SITE_URL: \$\{\{ vars.SALLAH_PUBLIC_URL \}\}/u);
  assert.match(build, /SALLAH_SUPPORT_EMAIL: \$\{\{ vars.SALLAH_SUPPORT_EMAIL \}\}/u);
  assert.match(build, /GOOGLE_SERVICES_JSON_CONTENT: \$\{\{ secrets.GOOGLE_SERVICES_JSON \}\}/u);
  assert.doesNotMatch(
    build,
    /SUPABASE_SECRET_KEY|OPENAI_API_KEY|EXPO_ACCESS_TOKEN|NOTIFICATION_WORKER_SECRET|PUSH_TOKEN_ENCRYPTION_KEY|UPLOAD_SCANNER_.*SECRET/u,
  );
});

test('production Firebase file is scoped to the build and removed on success or failure', () => {
  for (const status of [0, 1]) {
    let path;
    assert.equal(
      runProductionBuild(environment, (env) => {
        path = env.GOOGLE_SERVICES_JSON;
        assert.deepEqual(JSON.parse(readFileSync(path, 'utf8')), firebase);
        assert.equal(env.GOOGLE_SERVICES_JSON_CONTENT, undefined);
        return status;
      }),
      status,
    );
    assert.equal(existsSync(path), false);
  }
  let failurePath;
  assert.throws(
    () =>
      runProductionBuild(environment, (env) => {
        failurePath = env.GOOGLE_SERVICES_JSON;
        throw new Error('synthetic build interruption');
      }),
    /synthetic build interruption/u,
  );
  assert.equal(existsSync(failurePath), false);
  assert.equal(environment.GOOGLE_SERVICES_JSON, undefined);
});

test('production build rejects missing, malformed, server, and mismatched Firebase configuration', () => {
  for (const content of [
    undefined,
    '',
    'not-json',
    JSON.stringify({ type: 'service_account', private_key: 'do-not-log' }),
    JSON.stringify({ ...firebase, client: [] }),
    JSON.stringify({
      ...firebase,
      project_info: { ...firebase.project_info, private_key: 'synthetic-must-not-be-materialized' },
    }),
  ]) {
    assert.throws(
      () =>
        runProductionBuild({ ...environment, GOOGLE_SERVICES_JSON_CONTENT: content }, () =>
          assert.fail('must not build'),
        ),
      /GOOGLE_SERVICES_JSON/u,
    );
  }
  assert.throws(
    () =>
      runProductionBuild({ ...environment, SALLAH_ANDROID_PACKAGE: 'sa.sallah.different' }, () =>
        assert.fail('must not build'),
      ),
    /GOOGLE_SERVICES_JSON/u,
  );
});

test('Turbo forwards and hashes mobile build inputs without forwarding server secrets', () => {
  const inputs = {
    EXPO_PUBLIC_APP_ENV: 'production',
    EAS_PROJECT_ID: '11111111-1111-4111-8111-111111111111',
    SALLAH_IOS_BUNDLE_ID: 'sa.sallah.fixture',
    SALLAH_ANDROID_PACKAGE: 'sa.sallah.fixture',
    SALLAH_ANDROID_GOOGLE_MAPS_API_KEY: 'synthetic-key',
    GOOGLE_SERVICES_JSON: '/tmp/synthetic-google-services.json',
    EAS_BUILD_PLATFORM: 'android',
    NEXT_PUBLIC_SITE_URL: 'https://sallah-fixture.com',
    SALLAH_SUPPORT_EMAIL: 'support@sallah-fixture.com',
  };
  const result = spawnSync(
    process.execPath,
    [
      fileURLToPath(new URL('../node_modules/turbo/bin/turbo', import.meta.url)),
      'run',
      'build',
      '--dry=json',
    ],
    {
      cwd: new URL('../', import.meta.url),
      env: {
        ...process.env,
        ...inputs,
        SUPABASE_SECRET_KEY: 'synthetic-server-secret',
        OPENAI_API_KEY: 'synthetic-server-ai-key',
      },
      encoding: 'utf8',
      timeout: 20_000,
      windowsHide: true,
    },
  );
  assert.equal(result.status, 0, result.stderr);
  const mobile = JSON.parse(result.stdout).tasks.find(
    (task) => task.taskId === '@sallah/mobile#build',
  );
  assert.ok(mobile);
  const variables = mobile.environmentVariables;
  const hashedNames = [...variables.configured, ...variables.inferred].map(
    (value) => value.split('=')[0],
  );
  for (const key of Object.keys(inputs).filter(
    (key) => !key.startsWith('NEXT_PUBLIC_') && key !== 'SALLAH_SUPPORT_EMAIL',
  ))
    assert.ok(hashedNames.includes(key), key);
  const web = JSON.parse(result.stdout).tasks.find((task) => task.taskId === '@sallah/web#build');
  const webHashed = [...web.environmentVariables.inferred, ...web.environmentVariables.configured];
  assert.ok(webHashed.some((value) => value.startsWith('NEXT_PUBLIC_SITE_URL=')));
  assert.ok(webHashed.some((value) => value.startsWith('SALLAH_SUPPORT_EMAIL=')));
  assert.ok(!hashedNames.includes('SALLAH_SUPPORT_EMAIL'));
  assert.ok(!hashedNames.includes('SUPABASE_SECRET_KEY'));
  assert.ok(!hashedNames.includes('OPENAI_API_KEY'));
});
