import { mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve, sep } from 'node:path';
import { pathToFileURL } from 'node:url';
import { validateGoogleServicesConfiguration } from '../packages/config/src/release.ts';
import { spawnTool } from './resolve-tool.mjs';

export function runProductionBuild(environment, build) {
  const content = validateGoogleServicesConfiguration(
    environment.GOOGLE_SERVICES_JSON_CONTENT,
    environment.SALLAH_ANDROID_PACKAGE,
  );
  const parent = realpathSync(tmpdir());
  const directory = mkdtempSync(join(parent, 'sallah-production-build-'));
  // Only remove the directory created by this invocation beneath the resolved temp root.
  if (!realpathSync(directory).startsWith(`${parent}${sep}`))
    throw new Error('BUILD_TEMP_PATH_INVALID');
  const file = join(directory, 'google-services.json');
  try {
    writeFileSync(file, content, { encoding: 'utf8', mode: 0o600, flag: 'wx' });
    const env = { ...environment, GOOGLE_SERVICES_JSON: file };
    delete env.GOOGLE_SERVICES_JSON_CONTENT;
    return build(env);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    process.exitCode = runProductionBuild(process.env, (env) => {
      const result = spawnTool('pnpm', ['build'], { env, stdio: 'inherit', windowsHide: true });
      return result.status ?? 2;
    });
  } catch {
    console.error('PRODUCTION_BUILD_BLOCKED: check Firebase client configuration and build output');
    process.exitCode = 2;
  }
}
