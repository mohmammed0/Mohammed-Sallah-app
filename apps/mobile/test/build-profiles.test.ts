/// <reference types="node" />

import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';

const easPath = new URL('../eas.json', import.meta.url);

describe('mobile EAS build profiles', () => {
  it('pins each build to an explicit EAS environment and requires committed source', async () => {
    const config = JSON.parse(await readFile(easPath, 'utf8')) as {
      cli: { requireCommit?: boolean };
      build: Record<string, { environment?: string; developmentClient?: boolean }>;
    };

    expect(config.cli.requireCommit).toBe(true);
    expect(config.build.development?.environment).toBe('development');
    expect(config.build.development?.developmentClient).not.toBe(true);
    expect(config.build.preview?.environment).toBe('preview');
    expect(config.build.production?.environment).toBe('production');
  });

  it('keeps Preview internal and production store-shaped without committing external keys', async () => {
    const raw = await readFile(easPath, 'utf8');
    const config = JSON.parse(raw) as {
      build: {
        preview: { distribution?: string; android?: { buildType?: string } };
        production: { android?: { buildType?: string } };
      };
    };

    expect(config.build.preview).toMatchObject({
      distribution: 'internal',
      android: { buildType: 'apk' },
    });
    expect(config.build.production.android?.buildType).toBe('app-bundle');
    expect(raw).not.toContain('SALLAH_ANDROID_GOOGLE_MAPS_API_KEY');
    expect(raw).not.toContain('AIza');
  });
});
