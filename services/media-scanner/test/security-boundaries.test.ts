import { readFile } from 'node:fs/promises';

import { describe, expect, it } from 'vitest';

const runtimeFiles = [
  'auth.ts',
  'capability-http.ts',
  'clamd.ts',
  'contracts.ts',
  'control-client.ts',
  'deadline.ts',
  'ffmpeg-remux.ts',
  'image-sanitizer.ts',
  'index.ts',
  'isolated-sanitizer.ts',
  'manifest.ts',
  'media-policy.ts',
  'pipeline.ts',
  'sanitizer-child.ts',
  'sanitize.ts',
  'worker.ts',
] as const;

describe('scanner mutation probes', () => {
  it('has no push media ingress, Base64 media, shell, or broad data credential path', async () => {
    const entries = await Promise.all(
      runtimeFiles.map(
        async (name) =>
          [name, await readFile(new URL(`../src/${name}`, import.meta.url), 'utf8')] as const,
      ),
    );
    const sources = entries.map(([, source]) => source).join('\n');

    expect(sources).not.toMatch(
      /createServer|\.listen\(|\/v1\/scan(?:[/'"\s]|$)|outputBase64|toString\((?:'base64'|"base64")\)/i,
    );
    expect(sources).not.toMatch(/shell\s*:\s*true/i);
    expect(sources).not.toMatch(
      /service.?role|publishable.?key|supabase.?key|s3.?access|user.?jwt/i,
    );
    expect(sources).not.toMatch(/process\.env|Deno\.env/i);
    expect(
      entries
        .filter(([name]) => !['isolated-sanitizer.ts', 'ffmpeg-remux.ts'].includes(name))
        .map(([, source]) => source)
        .join('\n'),
    ).not.toMatch(/(?:from|require\()\s*['"](?:node:)?child_process['"]/i);
  });

  it('uses only fixed ffmpeg/ffprobe paths with no shell and a process-group kill', async () => {
    const source = await readFile(new URL('../src/ffmpeg-remux.ts', import.meta.url), 'utf8');
    expect(source).toContain("'/opt/sallah-media/bin/ffmpeg'");
    expect(source).toContain("'/opt/sallah-media/bin/ffprobe'");
    expect(source).toContain('shell: false');
    expect(source).toContain("process.kill(-pid, 'SIGKILL')");
    expect(source).toContain('detached: false');
    expect(source).not.toContain("detached: process.platform !== 'win32'");
    expect(source).toContain("'-nostdin'");
    expect(source).not.toMatch(/\bexec\(|\bexecFile\(|\bfork\(|shell\s*:\s*true/i);
  });

  it('uses one fixed no-shell native child with bounded control channels and process-group kill', async () => {
    const source = await readFile(new URL('../src/isolated-sanitizer.ts', import.meta.url), 'utf8');
    expect(source).toContain("new URL('../dist/sanitizer-child.js', import.meta.url)");
    expect(source).toContain('spawn(');
    expect(source).toContain('process.execPath');
    expect(source).toContain('shell: false');
    expect(source).toContain("stdio: ['ignore', 'pipe', 'pipe']");
    expect(source).toContain("process.kill(-pid, 'SIGKILL')");
    expect(source).toContain('MAX_CONTROL_STDOUT_BYTES');
    expect(source).toContain('MAX_CONTROL_STDERR_BYTES');
    expect(source).not.toMatch(/\bexec\(|\bexecFile\(|\bfork\(|shell\s*:\s*true/i);
  });

  it('keeps signed transfer streaming and forbids automatic redirects', async () => {
    const source = await readFile(new URL('../src/capability-http.ts', import.meta.url), 'utf8');
    expect(source).toContain("redirect: 'manual'");
    expect(source).toContain('createReadStream');
    expect(source).not.toMatch(/arrayBuffer\(|Buffer\.concat|readFile\(/);
  });

  it('cleans retired push artifacts before every production build', async () => {
    const packageJson = JSON.parse(
      await readFile(new URL('../package.json', import.meta.url), 'utf8'),
    ) as { scripts?: { build?: string } };
    expect(packageJson.scripts?.build).toBe(
      'node scripts/clean-dist.mjs && tsc -p tsconfig.build.json',
    );
    const cleaner = await readFile(new URL('../scripts/clean-dist.mjs', import.meta.url), 'utf8');
    expect(cleaner).toContain("rm(new URL('../dist/', import.meta.url)");
    expect(cleaner).not.toMatch(/child_process|exec\(|spawn\(|shell\s*:/i);
  });
});
