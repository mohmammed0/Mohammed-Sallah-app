import { readFileSync } from 'node:fs';

const migration = readFileSync(
  new URL('../supabase/migrations/20260818044137_harden_privacy_and_media.sql', import.meta.url),
  'utf8',
);
const documentation = readFileSync(
  new URL('../docs/privacy/DATA_INVENTORY.md', import.meta.url),
  'utf8',
);

const sqlMatch = migration.match(
  /create function public\.get_data_export_manifest\(\)[\s\S]*?select '(\[[\s\S]*?\])'::jsonb/u,
);
if (!sqlMatch?.[1]) throw new Error('Database export manifest was not found');
const databaseManifest = JSON.parse(sqlMatch[1]);
const docsMatch = documentation.match(
  /<!-- export-manifest:start -->([\s\S]*?)<!-- export-manifest:end -->/u,
);
if (!docsMatch?.[1]) throw new Error('Documented export manifest was not found');
const documentedManifest = [...docsMatch[1].matchAll(/^- `([^`]+)`$/gmu)].map((match) => match[1]);
const databaseSet = new Set(databaseManifest);
const documentedSet = new Set(documentedManifest);
const missingFromDocs = databaseManifest.filter((key) => !documentedSet.has(key));
const missingFromDatabase = documentedManifest.filter((key) => !databaseSet.has(key));
if (
  databaseManifest.length !== databaseSet.size ||
  documentedManifest.length !== documentedSet.size ||
  missingFromDocs.length ||
  missingFromDatabase.length
) {
  throw new Error(JSON.stringify({ missingFromDocs, missingFromDatabase }));
}
console.log(`Data export manifest matches documentation (${databaseManifest.length} categories).`);
