import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const script = fileURLToPath(new URL('./prelaunch-packet.mjs', import.meta.url));
const required = [
  '.env.example',
  '.github/workflows/ci.yml',
  '.github/workflows/release-readiness.yml',
  'apps/mobile/app.config.ts',
  'apps/mobile/eas.json',
  'packages/config/src/release.ts',
  'pnpm-lock.yaml',
  'oss-inventory.json',
  'THIRD_PARTY_NOTICES.md',
  'docs/RELEASE.md',
  'docs/DEPLOYMENT.md',
  'docs/release/EXTERNAL_RELEASE_GATES.md',
  'docs/operations/LEGAL_PUBLICATION.md',
  'docs/operations/EAS_NATIVE_BUILDS.md',
  'docs/store/RELEASE_CHECKLIST.md',
  'docs/store/STORE_LISTING_DRAFTS.md',
  'docs/store/DATA_DISCLOSURE_WORKSHEET.md',
];
const hash = (data) => createHash('sha256').update(data).digest('hex');
function put(repo, path, data) {
  mkdirSync(dirname(join(repo, path)), { recursive: true });
  writeFileSync(join(repo, path), data);
}
function git(repo, ...args) {
  const result = spawnSync('git', args, { cwd: repo, encoding: 'utf8', windowsHide: true });
  assert.equal(result.status, 0, result.stderr);
  return result.stdout.trim();
}
function commit(repo) {
  git(repo, 'add', '.');
  git(
    repo,
    '-c',
    'user.name=Fixture',
    '-c',
    'user.email=fixture@example.invalid',
    'commit',
    '-qm',
    'fixture',
  );
  return git(repo, 'rev-parse', 'HEAD');
}
function fixture(run) {
  const parent = realpathSync(tmpdir());
  const repo = mkdtempSync(join(parent, 'sallah-prelaunch-test-'));
  try {
    git(repo, 'init', '-q', '--initial-branch=codex/fixture');
    git(repo, 'config', 'core.autocrlf', 'false');
    for (const path of required) put(repo, path, 'reviewed fixture\n');
    put(repo, '.gitignore', 'artifacts/\n');
    put(repo, 'supabase/migrations/20260901000000_first.sql', 'select 1;\n');
    put(repo, 'supabase/migrations/20260902000000_second.sql', 'select 2;\n');
    return run(repo, commit(repo));
  } finally {
    const child = relative(parent, resolve(repo));
    assert.ok(child.startsWith('sallah-prelaunch-test-') && !child.includes('..'));
    rmSync(repo, { recursive: true, force: true });
  }
}
function cli(repo, ...args) {
  return spawnSync(process.execPath, [script, ...args, '--repo', repo], {
    encoding: 'utf8',
    windowsHide: true,
  });
}
const generate = (repo, ...args) =>
  cli(repo, 'generate', '--out', 'artifacts/prelaunch/check', ...args);
const packet = (repo) =>
  JSON.parse(readFileSync(join(repo, 'artifacts/prelaunch/check/packet.json'), 'utf8'));
function exportsFixture(repo) {
  put(
    repo,
    'artifacts/mobile/metadata.json',
    JSON.stringify({
      version: 0,
      bundler: 'metro',
      fileMetadata: {
        android: { bundle: '_expo/android.hbc', assets: [{ path: 'assets\\font', ext: 'ttf' }] },
        ios: { bundle: '_expo/ios.hbc', assets: [] },
      },
    }),
  );
  put(repo, 'artifacts/mobile/_expo/android.hbc', 'android bundle');
  put(repo, 'artifacts/mobile/_expo/ios.hbc', 'ios bundle');
  put(repo, 'artifacts/mobile/assets/font', 'font');
  put(
    repo,
    'artifacts/sbom.json',
    JSON.stringify({
      bomFormat: 'CycloneDX',
      specVersion: '1.7',
      version: 1,
      components: [{ type: 'library', name: 'fixture', version: '1.0.0' }],
    }),
  );
}

test('generates and verifies a clean immutable packet without inventing external passes', () =>
  fixture((repo, head) => {
    const result = generate(repo, '--expect-head', head);
    assert.equal(result.status, 0, result.stderr);
    const value = packet(repo);
    assert.equal(value.source.checkoutCommit, head);
    assert.equal(value.source.branch, 'codex/fixture');
    assert.equal(value.source.tree, git(repo, 'rev-parse', 'HEAD^{tree}'));
    assert.equal(value.migrations.length, 2);
    assert.equal(value.migrations[0].sha256, hash('select 1;\n'));
    assert.equal(value.externalReadiness.production, 'NOT_EVALUATED');
    assert.equal(value.externalReadiness.legalApproval, 'NOT_EVALUATED');
    assert.deepEqual(value.artifacts, []);
    const verified = cli(repo, 'verify', '--packet', 'artifacts/prelaunch/check/packet.json');
    assert.equal(verified.status, 0, verified.stderr);
  }));

test('requires every selected release template to exist in the committed tree', () =>
  fixture((repo) => {
    rmSync(join(repo, 'docs/store/RELEASE_CHECKLIST.md'));
    commit(repo);
    assert.notEqual(generate(repo).status, 0);
  }));

test('rejects tracked unstaged and staged edits instead of attaching them to HEAD', () => {
  for (const staged of [false, true])
    fixture((repo) => {
      put(repo, 'docs/RELEASE.md', 'changed');
      if (staged) git(repo, 'add', 'docs/RELEASE.md');
      assert.notEqual(generate(repo).status, 0);
    });
});

test('rejects hidden working-file drift even when Git assume-unchanged hides it', () =>
  fixture((repo) => {
    git(repo, 'update-index', '--assume-unchanged', 'docs/RELEASE.md');
    put(repo, 'docs/RELEASE.md', 'hidden drift');
    assert.notEqual(generate(repo).status, 0);
  }));

test('does not bind a replacement Git tree to the original immutable commit', () =>
  fixture((repo, original) => {
    put(repo, 'docs/RELEASE.md', 'replacement tree\n');
    const replacement = commit(repo);
    git(repo, 'checkout', '--detach', '-q', original);
    git(repo, 'replace', original, replacement);
    git(repo, 'checkout', '--force', '--detach', '-q', original);
    assert.equal(git(repo, 'rev-parse', 'HEAD'), original);
    assert.equal(readFileSync(join(repo, 'docs/RELEASE.md'), 'utf8'), 'replacement tree\n');
    assert.notEqual(generate(repo).status, 0);
  }));

test('accepts Git-normalized CRLF checkout bytes without relabeling immutable blob hashes', () =>
  fixture((repo) => {
    put(repo, '.gitattributes', '* text eol=crlf\n');
    commit(repo);
    rmSync(join(repo, 'docs/RELEASE.md'));
    git(repo, 'checkout-index', '--', 'docs/RELEASE.md');
    assert.equal(readFileSync(join(repo, 'docs/RELEASE.md'), 'utf8'), 'reviewed fixture\r\n');
    git(repo, 'add', 'docs/RELEASE.md');
    assert.equal(git(repo, 'status', '--porcelain', '--untracked-files=no'), '');
    const result = generate(repo);
    assert.equal(result.status, 0, result.stderr);
    assert.equal(
      packet(repo).templates.find((file) => file.path === 'docs/RELEASE.md').sha256,
      hash('reviewed fixture\n'),
    );
  }));

test('rejects stale expected source and packets after a later commit', () =>
  fixture((repo, head) => {
    assert.equal(generate(repo).status, 0);
    put(repo, 'new-file.txt', 'new');
    commit(repo);
    assert.notEqual(generate(repo, '--expect-head', head).status, 0);
    assert.notEqual(
      cli(repo, 'verify', '--packet', 'artifacts/prelaunch/check/packet.json').status,
      0,
    );
  }));

test('checks both export platforms, Windows asset separators and supplied SBOM bytes', () =>
  fixture((repo, head) => {
    exportsFixture(repo);
    const result = generate(
      repo,
      '--mobile-export',
      'artifacts/mobile',
      '--sbom',
      'artifacts/sbom.json',
      '--artifact-source-sha',
      head,
    );
    assert.equal(result.status, 0, result.stderr);
    assert.equal(packet(repo).artifacts.length, 2);
    assert.equal(
      cli(repo, 'verify', '--packet', 'artifacts/prelaunch/check/packet.json').status,
      0,
    );
    put(repo, 'artifacts/mobile/_expo/android.hbc', 'modified after packet');
    assert.notEqual(
      cli(repo, 'verify', '--packet', 'artifacts/prelaunch/check/packet.json').status,
      0,
    );
  }));

test('rejects absent paths, missing iOS bundle and arbitrary JSON presented as an SBOM', () => {
  for (const mode of ['missing', 'ios', 'sbom', 'unbound'])
    fixture((repo, head) => {
      exportsFixture(repo);
      if (mode === 'missing') rmSync(join(repo, 'artifacts/mobile/metadata.json'));
      if (mode === 'ios') rmSync(join(repo, 'artifacts/mobile/_expo/ios.hbc'));
      if (mode === 'sbom') put(repo, 'artifacts/sbom.json', '{"secret":"synthetic-do-not-output"}');
      const result = generate(
        repo,
        '--mobile-export',
        'artifacts/mobile',
        '--sbom',
        'artifacts/sbom.json',
        ...(mode === 'unbound' ? [] : ['--artifact-source-sha', head]),
      );
      assert.notEqual(result.status, 0);
      assert.doesNotMatch(result.stderr + result.stdout, /synthetic-do-not-output/);
    });
});

test('rejects oversized metadata and SBOM inputs before parsing', () => {
  for (const kind of ['metadata', 'sbom'])
    fixture((repo, head) => {
      exportsFixture(repo);
      if (kind === 'metadata')
        put(repo, 'artifacts/mobile/metadata.json', Buffer.alloc(1024 * 1024 + 1, 32));
      else put(repo, 'artifacts/sbom.json', Buffer.alloc(16 * 1024 * 1024 + 1, 32));
      const result = generate(
        repo,
        '--mobile-export',
        'artifacts/mobile',
        '--sbom',
        'artifacts/sbom.json',
        '--artifact-source-sha',
        head,
      );
      assert.notEqual(result.status, 0);
      assert.match(result.stderr, /PRELAUNCH_INVALID_FILE_SIZE_OR_TYPE/);
    });
});

test('rejects traversal in caller paths and referenced export metadata', () => {
  fixture((repo) => {
    const result = cli(repo, 'generate', '--out', '../escape');
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /PRELAUNCH_PATH_ESCAPE/);
  });
  fixture((repo, head) => {
    exportsFixture(repo);
    const metadataPath = join(repo, 'artifacts/mobile/metadata.json');
    const metadata = JSON.parse(readFileSync(metadataPath, 'utf8'));
    metadata.fileMetadata.android.bundle = '..\\sbom.json';
    writeFileSync(metadataPath, JSON.stringify(metadata));
    assert.notEqual(
      generate(repo, '--mobile-export', 'artifacts/mobile', '--artifact-source-sha', head).status,
      0,
    );
  });
});

test('rejects symlink or junction export directories and output parents', () =>
  fixture((repo, head) => {
    exportsFixture(repo);
    symlinkSync(join(repo, 'artifacts/mobile'), join(repo, 'artifacts/alias'), 'junction');
    assert.notEqual(
      generate(repo, '--mobile-export', 'artifacts/alias', '--artifact-source-sha', head).status,
      0,
    );
    symlinkSync(join(repo, 'artifacts/mobile'), join(repo, 'artifacts/prelaunch'), 'junction');
    assert.notEqual(generate(repo).status, 0);
  }));

test('rejects duplicate or invalid migration timestamps', () => {
  for (const name of ['20260901000000_duplicate.sql', '20261301000000_invalid.sql'])
    fixture((repo) => {
      put(repo, `supabase/migrations/${name}`, 'select 3;\n');
      commit(repo);
      assert.notEqual(generate(repo).status, 0);
    });
});

test('preserves the nine historical date-sequence migration IDs without inventing UTC times', () =>
  fixture((repo) => {
    const legacy = [
      '202608170001_foundation.sql',
      '202608170002_marketplace.sql',
      '202608170003_operations.sql',
      '202608170004_security_commands.sql',
      '202608170005_hardening.sql',
      '202608170006_product_commands.sql',
      '202608170007_job_guards.sql',
      '202608170008_admin_customers.sql',
      '202608170009_edge_least_privilege.sql',
    ];
    for (const name of legacy) put(repo, `supabase/migrations/${name}`, 'select 1;\n');
    commit(repo);
    const generated = generate(repo);
    assert.equal(generated.status, 0, generated.stderr);
    const rows = packet(repo).migrations.slice(0, 9);
    assert.deepEqual(
      rows.map((row) => row.version),
      legacy.map((name) => name.split('_')[0]),
    );
    assert.ok(
      rows.every(
        (row) =>
          row.versionFormat === 'legacy-date-sequence' &&
          row.date === '2026-08-17' &&
          row.timestampUtc === null,
      ),
    );
    assert.equal(packet(repo).migrations[9].timestampUtc, '2026-09-01T00:00:00.000Z');
    assert.equal(
      cli(repo, 'verify', '--packet', 'artifacts/prelaunch/check/packet.json').status,
      0,
    );
  }));

test('rejects duplicate legacy IDs and new abbreviated migration versions', () => {
  for (const name of ['202608170001_duplicate.sql', '202609010001_new_short_version.sql'])
    fixture((repo) => {
      put(repo, 'supabase/migrations/202608170001_foundation.sql', 'select 1;\n');
      put(repo, `supabase/migrations/${name}`, 'select 2;\n');
      commit(repo);
      assert.notEqual(generate(repo).status, 0);
    });
});

test('keeps detached CI checkout distinct from the ancestor pull request head', () =>
  fixture((repo, prHead) => {
    put(repo, 'merge-checkout.txt', 'synthetic merge checkout');
    const checkout = commit(repo);
    git(repo, 'checkout', '--detach', '-q', checkout);
    const result = generate(
      repo,
      '--ci-event',
      'pull_request',
      '--ci-checkout-sha',
      checkout,
      '--ci-pr-head-sha',
      prHead,
      '--ci-run-id',
      '123',
    );
    assert.equal(result.status, 0, result.stderr);
    assert.equal(packet(repo).source.branch, null);
    assert.equal(packet(repo).ci.checkoutCommit, checkout);
    assert.equal(packet(repo).ci.pullRequestHead, prHead);
  }));

test('verifies a detached CI packet on a local branch at the identical immutable source', () =>
  fixture((repo, head) => {
    git(repo, 'checkout', '--detach', '-q', head);
    const generated = generate(
      repo,
      '--ci-event',
      'push',
      '--ci-checkout-sha',
      head,
      '--ci-run-id',
      '124',
    );
    assert.equal(generated.status, 0, generated.stderr);
    const original = readFileSync(join(repo, 'artifacts/prelaunch/check/packet.json'));
    assert.equal(packet(repo).source.branch, null);
    git(repo, 'checkout', '-q', 'codex/fixture');
    const verified = cli(repo, 'verify', '--packet', 'artifacts/prelaunch/check/packet.json');
    assert.equal(verified.status, 0, verified.stderr);
    assert.ok(readFileSync(join(repo, 'artifacts/prelaunch/check/packet.json')).equals(original));
    put(repo, 'docs/RELEASE.md', 'later source\n');
    commit(repo);
    assert.notEqual(
      cli(repo, 'verify', '--packet', 'artifacts/prelaunch/check/packet.json').status,
      0,
    );
  }));

test('rejects inconsistent CI identity, packet tampering and output overwrite', () =>
  fixture((repo, head) => {
    assert.notEqual(
      generate(repo, '--ci-event', 'push', '--ci-checkout-sha', '0'.repeat(40), '--ci-run-id', '1')
        .status,
      0,
    );
    assert.equal(generate(repo, '--expect-head', head).status, 0);
    assert.notEqual(generate(repo).status, 0);
    const path = join(repo, 'artifacts/prelaunch/check/packet.json');
    const value = packet(repo);
    value.migrations[0].sha256 = '0'.repeat(64);
    writeFileSync(path, JSON.stringify(value));
    assert.notEqual(
      cli(repo, 'verify', '--packet', 'artifacts/prelaunch/check/packet.json').status,
      0,
    );
  }));
