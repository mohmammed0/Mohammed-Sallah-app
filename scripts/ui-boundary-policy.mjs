import { readFile, readdir } from 'node:fs/promises';
import { extname, join, relative, sep } from 'node:path';

export const PRESENTATION_ROOTS = [
  'apps/mobile/src/components',
  'apps/mobile/src/design-system',
  'apps/web/src/components',
];

const DENIED_IMPORTS = [
  {
    matches: (specifier) =>
      specifier === '@sallah/database' || specifier.startsWith('@sallah/database/'),
    reason: 'generated database rows belong behind a typed adapter or view model',
  },
  {
    matches: (specifier) => specifier === '@supabase/supabase-js',
    reason: 'presentation primitives must not own Supabase access',
  },
  {
    matches: (specifier) => /(?:^|\/)supabase\/(?:migrations|functions)(?:\/|$)/u.test(specifier),
    reason: 'database migrations and Edge implementation are outside the presentation boundary',
  },
  {
    matches: (specifier) =>
      /(?:service[-_]?role|server[-_]?only|credentials?|secrets?)/iu.test(specifier),
    reason: 'server credentials and privileged modules are prohibited in presentation code',
  },
];

const IMPORT_PATTERN =
  /(?:import|export)\s+(?:type\s+)?(?:[^'";]*?\s+from\s+)?['"]([^'"]+)['"]|require\(\s*['"]([^'"]+)['"]\s*\)|import\(\s*['"]([^'"]+)['"]\s*\)/gu;

export function importedSpecifiers(source) {
  return [...source.matchAll(IMPORT_PATTERN)].map((match) => match[1] ?? match[2] ?? match[3]);
}

export function findUiBoundaryViolations(source, file = 'unknown') {
  return importedSpecifiers(source).flatMap((specifier) =>
    DENIED_IMPORTS.filter(({ matches }) => matches(specifier)).map(({ reason }) => ({
      file,
      specifier,
      reason,
    })),
  );
}

async function collectSourceFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) files.push(...(await collectSourceFiles(path)));
    else if (['.js', '.jsx', '.ts', '.tsx'].includes(extname(entry.name))) files.push(path);
  }
  return files;
}

export async function inspectUiBoundaries(repositoryRoot) {
  const violations = [];
  for (const root of PRESENTATION_ROOTS) {
    const absoluteRoot = join(repositoryRoot, ...root.split('/'));
    for (const file of await collectSourceFiles(absoluteRoot)) {
      const displayPath = relative(repositoryRoot, file).split(sep).join('/');
      violations.push(...findUiBoundaryViolations(await readFile(file, 'utf8'), displayPath));
    }
  }
  return violations;
}
