import assert from 'node:assert/strict';
import test from 'node:test';
import { findUiBoundaryViolations, importedSpecifiers } from './ui-boundary-policy.mjs';

test('extracts static, exported, required, and dynamic imports', () => {
  assert.deepEqual(
    importedSpecifiers(`
      import { Button } from './button';
      export type { Theme } from '@sallah/config/branding';
      const adapter = require('../adapter');
      const module = import('./lazy');
    `),
    ['./button', '@sallah/config/branding', '../adapter', './lazy'],
  );
});

test('allows presentation and branding dependencies', () => {
  assert.deepEqual(
    findUiBoundaryViolations(
      `import { branding } from '@sallah/config/branding'; import { Text } from 'react-native';`,
      'apps/mobile/src/design-system/button.tsx',
    ),
    [],
  );
});

test('rejects database, Supabase, migration, and secret imports', () => {
  const violations = findUiBoundaryViolations(
    `
      import type { Database } from '@sallah/database/types';
      import { createClient } from '@supabase/supabase-js';
      import migration from '../../../supabase/migrations/example';
      import secret from '../server-only/credentials';
    `,
    'apps/mobile/src/components/unsafe.tsx',
  );
  assert.deepEqual(
    violations.map(({ specifier }) => specifier),
    [
      '@sallah/database/types',
      '@supabase/supabase-js',
      '../../../supabase/migrations/example',
      '../server-only/credentials',
    ],
  );
});
