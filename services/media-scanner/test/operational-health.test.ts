import { mkdtemp, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { afterEach, describe, expect, it } from 'vitest';

import * as scanner from '../src/index.js';
import type { WorkerRunResult } from '../src/worker.js';

const temporary: string[] = [];
afterEach(async () => {
  await Promise.all(temporary.splice(0).map((path) => rm(path, { recursive: true, force: true })));
});

async function fixture() {
  expect(scanner.createScannerHealthMonitor).toBeTypeOf('function');
  let now = 1_800_000_000_000;
  const directory = await mkdtemp(join(tmpdir(), 'sallah-health-'));
  temporary.push(directory);
  const path = join(directory, 'state.json');
  const logs: string[] = [];
  const monitor = scanner.createScannerHealthMonitor(() => now);
  const publish = scanner.createScannerHealthPublisher(path, (line) => logs.push(line));
  const snapshot = () => {
    const value = monitor.snapshot();
    publish(value);
    return value;
  };
  return {
    path,
    logs,
    monitor,
    snapshot,
    clock: () => now,
    advance: (ms: number) => {
      now += ms;
    },
  };
}

describe('private scanner operational heartbeat', () => {
  it('executes the compiled probe selected by both Compose profiles with no sensitive output', async () => {
    const f = await fixture();
    const record = {
      schema: 'sallah.scanner-health.v1',
      state: 'healthy',
      category: 'idle',
      observedAtMs: Date.now(),
      lastReadyAtMs: Date.now() - 100,
    };
    for (const profile of ['compose.yaml', 'compose.preview.yaml']) {
      const compose = await readFile(
        new URL(`../../../infra/media-scanner/${profile}`, import.meta.url),
        'utf8',
      );
      const entry = /test:\s*\['CMD', 'node', '(?<entry>dist\/healthcheck\.js)'\]/u.exec(compose)
        ?.groups?.entry;
      expect(entry).toBe('dist/healthcheck.js');
      expect(compose).toContain(
        '/tmp/scanner-health:rw,noexec,nosuid,nodev,size=1m,uid=65532,gid=65532,mode=0700',
      );
      expect(compose).not.toContain('process.kill(1,0)');
      const executable = fileURLToPath(new URL(`../${entry}`, import.meta.url));
      await writeFile(f.path, JSON.stringify(record));
      const healthy = spawnSync(process.execPath, [executable, f.path], {
        encoding: 'utf8',
        timeout: 5_000,
      });
      expect(healthy.status).toBe(0);
      expect(healthy.stdout + healthy.stderr).toBe('');
      await writeFile(f.path, '{"privateUrl":"https://secret.example?token=private"}');
      const unhealthy = spawnSync(process.execPath, [executable, f.path], {
        encoding: 'utf8',
        timeout: 5_000,
      });
      expect(unhealthy.status).toBe(1);
      expect(unhealthy.stdout + unhealthy.stderr).toBe('');
    }
  });

  it('starts unavailable, becomes ready after a control round trip, and stops explicitly', async () => {
    const f = await fixture();
    f.snapshot();
    expect(scanner.readScannerHealth(f.path, f.clock())).toBe(false);
    f.monitor.ready();
    f.snapshot();
    expect(scanner.readScannerHealth(f.path, f.clock())).toBe(true);
    f.monitor.result({ status: 'idle' });
    f.snapshot();
    expect(scanner.readScannerHealth(f.path, f.clock())).toBe(true);
    f.monitor.stop();
    f.snapshot();
    expect(scanner.readScannerHealth(f.path, f.clock())).toBe(false);
  });

  it('rejects a stale heartbeat and a hung job even when heartbeat continues', async () => {
    const f = await fixture();
    f.monitor.ready();
    f.snapshot();
    f.advance(30_001);
    expect(scanner.readScannerHealth(f.path, f.clock())).toBe(false);
    f.snapshot();
    expect(scanner.readScannerHealth(f.path, f.clock())).toBe(true);
    f.advance(90_000);
    f.snapshot();
    expect(scanner.readScannerHealth(f.path, f.clock())).toBe(true);
    f.advance(30_000);
    expect(f.snapshot()).toMatchObject({ state: 'degraded', category: 'readiness_expired' });
    expect(scanner.readScannerHealth(f.path, f.clock())).toBe(false);
  });

  it.each(['signature_stale', 'control_unavailable'] as const)(
    'exposes %s safely and recovers on readiness',
    async (category) => {
      const f = await fixture();
      f.monitor.ready();
      f.monitor.result({ status: 'retryable_failure', category });
      expect(f.snapshot()).toMatchObject({ state: 'degraded', category });
      expect(scanner.readScannerHealth(f.path, f.clock())).toBe(false);
      f.monitor.ready();
      f.snapshot();
      expect(scanner.readScannerHealth(f.path, f.clock())).toBe(true);
    },
  );

  it('never serializes attempt IDs, URLs, arbitrary categories or raw errors and bounds log frequency', async () => {
    const f = await fixture();
    f.monitor.ready();
    f.monitor.result({
      status: 'retryable_failure',
      attemptId: 'private-object-id',
      category: 'https://private.example/?token=secret',
      error: 'Bearer private-secret',
    } as unknown as WorkerRunResult);
    expect(f.snapshot()).toMatchObject({ category: 'processing_failed' });
    for (let i = 0; i < 1_000; i += 1) {
      f.monitor.ready();
      f.monitor.result({ status: 'idle' });
      f.snapshot();
    }
    expect(f.logs).toHaveLength(1);
    f.advance(60_000);
    f.snapshot();
    expect(f.logs).toHaveLength(2);
    const content = `${await readFile(f.path, 'utf8')}\n${f.logs.join('\n')}`;
    expect(content).not.toMatch(/private-object|https:|token|secret|Bearer|attemptId|error/);
    expect((await readFile(f.path, 'utf8')).length).toBeLessThan(512);
  });

  it('rejects malformed, oversized, future and extra-field health records', async () => {
    const f = await fixture();
    expect(scanner.readScannerHealth(f.path, f.clock())).toBe(false);
    f.monitor.ready();
    const valid = f.snapshot();
    for (const value of [
      '{',
      'x'.repeat(2_000),
      JSON.stringify({ ...valid, observedAtMs: f.clock() + 1 }),
      JSON.stringify({ ...valid, lastReadyAtMs: f.clock() + 1 }),
      JSON.stringify({ ...valid, privateUrl: 'https://private.example' }),
      JSON.stringify({ ...valid, category: 'control_unavailable' }),
    ]) {
      await writeFile(f.path, value);
      expect(scanner.readScannerHealth(f.path, f.clock())).toBe(false);
    }
  });

  it('fails closed for a health-file symlink', async (context) => {
    const f = await fixture();
    f.monitor.ready();
    f.snapshot();
    const link = `${f.path}.link`;
    try {
      await symlink(f.path, link);
    } catch (error) {
      if (process.platform === 'win32' && (error as NodeJS.ErrnoException).code === 'EPERM')
        context.skip('Windows symlink permission is unavailable');
      throw error;
    }
    expect(scanner.readScannerHealth(link, f.clock())).toBe(false);
  });
});
