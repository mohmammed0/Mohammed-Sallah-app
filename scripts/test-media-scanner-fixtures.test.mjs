import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readdir, rm, stat, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { setTimeout as delay } from 'node:timers/promises';

import {
  formatWorkerResultFailure,
  listFixtureWorkerContainers,
  generateAvFixtures,
  runFixtureWorkerCommand,
  verifyAvFixture,
} from './test-media-scanner-supabase.mjs';

async function withFixtureDirectory(run) {
  const directory = await mkdtemp(join(tmpdir(), 'sallah-m2dr3-fixtures-'));
  try {
    return await run(directory);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

test('the pinned worker generates valid nonempty audio/video fixtures from a private Linux temp directory', async () => {
  await withFixtureDirectory(async (directory) => {
    const fixtures = await generateAvFixtures(directory);

    assert.ok(fixtures.m4a.byteLength > 0, 'M4A fixture must be nonempty');
    assert.ok(fixtures.audioMp4.byteLength > 0, 'audio MP4 fixture must be nonempty');
    assert.ok(fixtures.videoMp4.byteLength > 0, 'video MP4 fixture must be nonempty');
    if (process.platform !== 'win32') {
      const mode = (await stat(directory)).mode & 0o777;
      assert.equal(mode & 0o007, 0, 'fixture directory must never be world-accessible');
      assert.equal(mode & 0o070, 0o070, 'the pinned worker must receive group access');
    }
    assert.deepEqual(await readdir(directory), [], 'fixture files must be removed after reading');
  });
});

test('the pinned worker can read a host-created private scanner attempt', async () => {
  await withFixtureDirectory(async (directory) => {
    const fixtures = await generateAvFixtures(directory);
    const attemptDirectory = join(directory, 'attempt-private');
    const inputPath = join(attemptDirectory, 'input.media');
    await mkdir(attemptDirectory, { mode: 0o700 });
    await writeFile(inputPath, fixtures.m4a, { flag: 'wx', mode: 0o600 });

    const probe = await runFixtureWorkerCommand(
      directory,
      '/opt/sallah-media/bin/ffprobe',
      ['-v', 'error', '-show_entries', 'format=format_name', inputPath],
      {
        label: 'private-attempt-probe',
        readOnlyMount: true,
        timeoutMs: 10_000,
      },
    );

    assert.match(probe.stdout, /format_name=mov,mp4,m4a,3gp,3g2,mj2/u);
    if (process.platform !== 'win32') {
      const attemptMode = (await stat(attemptDirectory)).mode & 0o777;
      const inputMode = (await stat(inputPath)).mode & 0o777;
      assert.equal(attemptMode, 0o770, 'the attempt must remain private and group-traversable');
      assert.equal(inputMode, 0o640, 'the input must remain private and group-readable');
    }
  });
});

test(
  'a nested symlink cannot redirect a worker command path',
  { skip: process.platform === 'win32' },
  async () => {
    await withFixtureDirectory(async (directory) => {
      const fixtures = await generateAvFixtures(directory);
      const targetDirectory = join(directory, 'attempt-target');
      const linkedDirectory = join(directory, 'attempt-link');
      await mkdir(targetDirectory, { mode: 0o770 });
      await writeFile(join(targetDirectory, 'input.media'), fixtures.m4a, {
        flag: 'wx',
        mode: 0o640,
      });
      await symlink('attempt-target', linkedDirectory, 'dir');

      await assert.rejects(
        runFixtureWorkerCommand(
          directory,
          '/opt/sallah-media/bin/ffprobe',
          [
            '-v',
            'error',
            '-show_entries',
            'format=format_name',
            join(linkedDirectory, 'input.media'),
          ],
          {
            label: 'linked-attempt-probe',
            readOnlyMount: true,
            timeoutMs: 10_000,
          },
        ),
        /M2_FIXTURE_ARGUMENT_PATH_INVALID/u,
      );
    });
  },
);

test('parallel fixture generation uses distinct paths and leaves no files behind', async () => {
  await withFixtureDirectory(async (directory) => {
    const results = await Promise.all([
      generateAvFixtures(directory),
      generateAvFixtures(directory),
      generateAvFixtures(directory),
    ]);

    assert.equal(results.length, 3);
    for (const result of results) {
      assert.ok(result.m4a.byteLength > 0);
      assert.ok(result.audioMp4.byteLength > 0);
      assert.ok(result.videoMp4.byteLength > 0);
    }
    assert.deepEqual(await readdir(directory), []);
  });
});

test('a hung fixture process is terminated by its explicit deadline', async () => {
  await withFixtureDirectory(async (directory) => {
    const sibling = runFixtureWorkerCommand(directory, '/usr/bin/sleep', ['2'], {
      label: 'parallel-fixture-probe',
      timeoutMs: 5_000,
    });
    await delay(250);
    let timedOutContainer;
    await assert.rejects(
      runFixtureWorkerCommand(directory, '/usr/bin/sleep', ['60'], {
        label: 'fixture-timeout-probe',
        timeoutMs: 200,
      }),
      (error) => {
        assert.match(error.message, /M2_INTEGRATION_PROCESS_TIMEOUT:fixture-timeout-probe/u);
        assert.match(
          error.fixtureContainerName,
          /^sallah-m2-fixture-[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u,
        );
        timedOutContainer = error.fixtureContainerName;
        return true;
      },
    );
    assert.deepEqual(
      await listFixtureWorkerContainers(timedOutContainer),
      [],
      'the exact timed-out container must be absent while a legitimate sibling remains active',
    );
    await sibling;
    const retry = await generateAvFixtures(directory);
    assert.ok(retry.m4a.byteLength > 0);
    assert.deepEqual(await readdir(directory), []);
  });
});

test('a missing worker tool returns bounded actionable diagnostics without the host path', async () => {
  await withFixtureDirectory(async (directory) => {
    await assert.rejects(
      runFixtureWorkerCommand(directory, '/opt/sallah-media/bin/missing-ffmpeg', [], {
        label: 'missing-fixture-tool',
        timeoutMs: 5_000,
      }),
      (error) => {
        assert.match(
          error.message,
          /^M2_INTEGRATION_PROCESS_FAILED:missing-fixture-tool:exit=127:stderr=/u,
        );
        assert.ok(error.message.length < 4_500);
        assert.doesNotMatch(error.message, new RegExp(directory.replaceAll('\\', '\\\\'), 'u'));
        return true;
      },
    );
  });
});

test('worker failures report only a bounded allowlisted stage', () => {
  const details = {
    attemptCount: 1,
    jobState: 'retryable_failure',
    attemptState: 'retryable_failure',
    terminalCategory: 'scanner_unavailable',
  };
  assert.equal(
    formatWorkerResultFailure('clean', 'retryable_failure', details, {
      failureStage: 'remux_input_probe',
    }),
    'M2_WORKER_RESULT_INVALID:clean:retryable_failure:retryable_failure:retryable_failure:scanner_unavailable:stage=remux_input_probe:attempt=1',
  );
  const redacted = formatWorkerResultFailure('clean', 'retryable_failure', details, {
    failureStage: 'https://secret.invalid/private/path?token=forbidden',
  });
  assert.match(redacted, /:stage=worker:attempt=1$/u);
  assert.doesNotMatch(redacted, /secret|private|token|https/u);
});

test('FFprobe rejects an empty M4A instead of trusting file existence', async () => {
  await withFixtureDirectory(async (directory) => {
    const empty = join(directory, 'empty.m4a');
    await writeFile(empty, '');
    await assert.rejects(
      verifyAvFixture(directory, empty, ['audio:aac'], 'empty-m4a'),
      /M2_INTEGRATION_PROCESS_FAILED:verify-empty-m4a/u,
    );
  });
});

test(
  'a symlink cannot be used as the worker fixture mount',
  { skip: process.platform === 'win32' },
  async () => {
    await withFixtureDirectory(async (directory) => {
      const target = await mkdtemp(join(tmpdir(), 'sallah-m2dr3-target-'));
      const link = join(directory, 'mount-link');
      try {
        await symlink(target, link, 'dir');
        await assert.rejects(
          runFixtureWorkerCommand(link, '/usr/bin/true', [], { timeoutMs: 5_000 }),
          /M2_FIXTURE_MOUNT_INVALID/u,
        );
      } finally {
        await rm(target, { recursive: true, force: true });
      }
    });
  },
);
