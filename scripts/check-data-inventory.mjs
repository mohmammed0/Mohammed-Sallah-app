import { readFileSync } from 'node:fs';

const migration = readFileSync(
  new URL(
    '../supabase/migrations/20260818101821_scoped_support_and_owner_export.sql',
    import.meta.url,
  ),
  'utf8',
);
const documentation = readFileSync(
  new URL('../docs/privacy/DATA_INVENTORY.md', import.meta.url),
  'utf8',
);

const sqlMatch = migration.match(
  /create(?: or replace)? function public\.get_data_export_manifest\(\)[\s\S]*?select '(\[[\s\S]*?\])'::jsonb/u,
);
if (!sqlMatch?.[1]) throw new Error('Database export manifest was not found');
const databaseManifest = JSON.parse(sqlMatch[1]);
const coverageMatch = migration.match(
  /create function public\.get_data_export_query_coverage\(\)[\s\S]*?select '(\{[\s\S]*?\})'::jsonb/u,
);
if (!coverageMatch?.[1]) throw new Error('Database export query coverage was not found');
const databaseCoverage = JSON.parse(coverageMatch[1]);
const exportBodyMatch = migration.match(
  /create or replace function public\.build_data_export\([\s\S]*?\nend \$\$;/u,
);
if (!exportBodyMatch?.[0]) throw new Error('Database export implementation was not found');
const docsMatch = documentation.match(
  /<!-- export-manifest:start -->([\s\S]*?)<!-- export-manifest:end -->/u,
);
if (!docsMatch?.[1]) throw new Error('Documented export manifest was not found');
const documentedManifest = [...docsMatch[1].matchAll(/^- `([^`]+)`$/gmu)].map((match) => match[1]);
const docsCoverageMatch = documentation.match(
  /<!-- export-query-coverage:start -->([\s\S]*?)<!-- export-query-coverage:end -->/u,
);
if (!docsCoverageMatch?.[1]) throw new Error('Documented export query coverage was not found');
const documentedCoverage = Object.fromEntries(
  [...docsCoverageMatch[1].matchAll(/^- `([^`]+)` → `([^`]+)`$/gmu)].map((match) => [
    match[1],
    match[2],
  ]),
);
const databaseSet = new Set(databaseManifest);
const documentedSet = new Set(documentedManifest);
const missingFromDocs = databaseManifest.filter((key) => !documentedSet.has(key));
const missingFromDatabase = documentedManifest.filter((key) => !databaseSet.has(key));
const coverageKeys = Object.keys(databaseCoverage);
const undocumentedCoverage = coverageKeys.filter(
  (key) => documentedCoverage[key] !== databaseCoverage[key],
);
const staleDocumentedCoverage = Object.keys(documentedCoverage).filter(
  (key) => databaseCoverage[key] !== documentedCoverage[key],
);
const missingQueryAnchors = Object.entries(databaseCoverage)
  .filter(([, anchor]) => !exportBodyMatch[0].includes(anchor))
  .map(([key]) => key);
if (
  databaseManifest.length !== databaseSet.size ||
  documentedManifest.length !== documentedSet.size ||
  missingFromDocs.length ||
  missingFromDatabase.length ||
  coverageKeys.length !== databaseManifest.length ||
  coverageKeys.some((key) => !databaseSet.has(key)) ||
  undocumentedCoverage.length ||
  staleDocumentedCoverage.length ||
  missingQueryAnchors.length
) {
  throw new Error(
    JSON.stringify({
      missingFromDocs,
      missingFromDatabase,
      undocumentedCoverage,
      staleDocumentedCoverage,
      missingQueryAnchors,
    }),
  );
}
console.log(
  `Data export manifest and query coverage match documentation (${databaseManifest.length} categories).`,
);
