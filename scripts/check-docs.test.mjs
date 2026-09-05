import assert from 'node:assert/strict';
import { mkdtemp, mkdir, rm, symlink, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { checkDocumentation } from './check-docs.mjs';

const fixtureOptions = {
  requiredFiles: [
    'README.md',
    'README.ar.md',
    'README.en.md',
    'docs/README.md',
    'docs/current.md',
    'docs/archive/README.md',
  ],
  gatewayPairs: [
    {
      gateway: 'README.md',
      arabic: 'README.ar.md',
      english: 'README.en.md',
    },
  ],
  counterpartLinks: [],
  indexedFiles: ['docs/current.md', 'docs/archive/README.md'],
};

async function createFixture() {
  const root = await mkdtemp(path.join(os.tmpdir(), 'sallah-docs-check-'));
  await mkdir(path.join(root, 'docs', 'archive'), { recursive: true });
  await writeFile(
    path.join(root, 'README.md'),
    '# بوابة | Gateway\n\n[العربية](README.ar.md) · [English](README.en.md)\n',
  );
  await writeFile(
    path.join(root, 'README.ar.md'),
    '# العربية\n\n[البوابة](README.md) · [English](README.en.md)\n',
  );
  await writeFile(
    path.join(root, 'README.en.md'),
    '# English\n\n[Gateway](README.md) · [العربية](README.ar.md)\n',
  );
  await writeFile(
    path.join(root, 'docs', 'README.md'),
    [
      '# الفهرس | Index',
      '',
      '[Current](current.md)',
      '',
      '## أدلة تاريخية | Historical evidence',
      '',
      '[Archive](archive/README.md)',
      '',
    ].join('\n'),
  );
  await writeFile(path.join(root, 'docs', 'current.md'), '# Current\n');
  await writeFile(
    path.join(root, 'docs', 'archive', 'README.md'),
    '# Archive\n\n[Current status](../current.md)\n',
  );
  return root;
}

test('accepts a complete bilingual fixture', async (t) => {
  const root = await createFixture();
  t.after(() => rm(root, { recursive: true, force: true }));

  const result = await checkDocumentation({ root, ...fixtureOptions });

  assert.equal(result.requiredFiles, fixtureOptions.requiredFiles.length);
  assert.equal(result.gatewayPairs, 1);
  assert.ok(result.relativeLinks >= 7);
});

test('reports every missing required file', async (t) => {
  const root = await createFixture();
  t.after(() => rm(root, { recursive: true, force: true }));
  await rm(path.join(root, 'README.ar.md'));

  await assert.rejects(
    () => checkDocumentation({ root, ...fixtureOptions }),
    /Missing required documentation file: README[.]ar[.]md/,
  );
});

test('rejects a broken relative Markdown link', async (t) => {
  const root = await createFixture();
  t.after(() => rm(root, { recursive: true, force: true }));
  await writeFile(path.join(root, 'docs', 'current.md'), '# Current\n\n[Missing](missing.md)\n');

  await assert.rejects(
    () => checkDocumentation({ root, ...fixtureOptions }),
    /Broken relative Markdown link.*docs[/\\]missing[.]md/,
  );
});

test('rejects a broken reference-style Markdown link', async (t) => {
  const root = await createFixture();
  t.after(() => rm(root, { recursive: true, force: true }));
  await writeFile(
    path.join(root, 'docs', 'current.md'),
    '# Current\n\n[Missing guide][missing]\n\n[missing]: missing.md\n',
  );

  await assert.rejects(
    () => checkDocumentation({ root, ...fixtureOptions }),
    /Broken relative Markdown link.*docs[/\\]missing[.]md/,
  );
});

test('rejects documentation paths that resolve outside the repository through a symlink', async (t) => {
  const root = await createFixture();
  const outside = await mkdtemp(path.join(os.tmpdir(), 'sallah-docs-outside-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  t.after(() => rm(outside, { recursive: true, force: true }));

  await writeFile(path.join(outside, 'escaped.md'), '# Escaped\n');
  await mkdir(path.join(root, '.agents'), { recursive: true });
  await symlink(
    outside,
    path.join(root, '.agents', 'external'),
    process.platform === 'win32' ? 'junction' : 'dir',
  );
  await writeFile(
    path.join(root, 'docs', 'README.md'),
    [
      '# Index',
      '',
      '[Current](current.md)',
      '[Escaped](../.agents/external/escaped.md)',
      '',
      '## Historical evidence',
      '',
      '[Archive](archive/README.md)',
      '',
    ].join('\n'),
  );

  await assert.rejects(
    () =>
      checkDocumentation({
        root,
        ...fixtureOptions,
        requiredFiles: [...fixtureOptions.requiredFiles, '.agents/external/escaped.md'],
        indexedFiles: [...fixtureOptions.indexedFiles, '.agents/external/escaped.md'],
      }),
    /Documentation path resolves outside the repository: [.]agents[/\\]external[/\\]escaped[.]md/,
  );
});

test('rejects a symlink encountered directly while collecting documentation', async (t) => {
  const root = await createFixture();
  const outside = await mkdtemp(path.join(os.tmpdir(), 'sallah-docs-source-outside-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  t.after(() => rm(outside, { recursive: true, force: true }));

  await writeFile(path.join(outside, 'escaped.md'), '# Escaped\n');
  await symlink(
    outside,
    path.join(root, 'docs', 'external-source'),
    process.platform === 'win32' ? 'junction' : 'dir',
  );

  await assert.rejects(
    () => checkDocumentation({ root, ...fixtureOptions }),
    /Symbolic link is not allowed in the documentation tree: docs[/\\]external-source/,
  );
});

test('requires both root language links', async (t) => {
  const root = await createFixture();
  t.after(() => rm(root, { recursive: true, force: true }));
  await writeFile(path.join(root, 'README.md'), '# Gateway\n\n[English](README.en.md)\n');

  await assert.rejects(
    () => checkDocumentation({ root, ...fixtureOptions }),
    /Gateway README[.]md does not link to README[.]ar[.]md/,
  );
});

test('requires current documents to be present in the documentation index', async (t) => {
  const root = await createFixture();
  t.after(() => rm(root, { recursive: true, force: true }));
  await writeFile(
    path.join(root, 'docs', 'README.md'),
    '# Index\n\n## Historical evidence\n\n[Archive](archive/README.md)\n',
  );

  await assert.rejects(
    () => checkDocumentation({ root, ...fixtureOptions }),
    /Documentation index does not link to docs[/\\]current[.]md/,
  );
});

test('rejects archive links presented before the historical section', async (t) => {
  const root = await createFixture();
  t.after(() => rm(root, { recursive: true, force: true }));
  await writeFile(
    path.join(root, 'docs', 'README.md'),
    [
      '# Index',
      '',
      '[Archive as current](archive/README.md)',
      '[Current](current.md)',
      '',
      '## Historical evidence',
      '',
      '[Archive](archive/README.md)',
      '',
    ].join('\n'),
  );

  await assert.rejects(
    () => checkDocumentation({ root, ...fixtureOptions }),
    /Archive link appears in the current-document section/,
  );
});

test('requires each gateway and counterpart to cross-link', async (t) => {
  const root = await createFixture();
  t.after(() => rm(root, { recursive: true, force: true }));
  await writeFile(path.join(root, 'README.en.md'), '# English\n\n[Gateway](README.md)\n');

  await assert.rejects(
    () => checkDocumentation({ root, ...fixtureOptions }),
    /Counterpart README[.]en[.]md does not link to README[.]ar[.]md/,
  );
});

test('requires reciprocal links for non-root bilingual counterparts', async (t) => {
  const root = await createFixture();
  t.after(() => rm(root, { recursive: true, force: true }));
  await mkdir(path.join(root, 'docs', 'ar'), { recursive: true });
  await writeFile(
    path.join(root, 'docs', 'LOCAL_DEVELOPMENT.md'),
    '# Local development\n\n[العربية](ar/LOCAL_DEVELOPMENT.md)\n',
  );
  await writeFile(path.join(root, 'docs', 'ar', 'LOCAL_DEVELOPMENT.md'), '# التطوير المحلي\n');

  await assert.rejects(
    () =>
      checkDocumentation({
        root,
        ...fixtureOptions,
        requiredFiles: [
          ...fixtureOptions.requiredFiles,
          'docs/LOCAL_DEVELOPMENT.md',
          'docs/ar/LOCAL_DEVELOPMENT.md',
        ],
        counterpartLinks: [
          {
            source: 'docs/LOCAL_DEVELOPMENT.md',
            target: 'docs/ar/LOCAL_DEVELOPMENT.md',
          },
          {
            source: 'docs/ar/LOCAL_DEVELOPMENT.md',
            target: 'docs/LOCAL_DEVELOPMENT.md',
          },
        ],
      }),
    /Counterpart docs[/\\]ar[/\\]LOCAL_DEVELOPMENT[.]md does not link to docs[/\\]LOCAL_DEVELOPMENT[.]md/,
  );
});
