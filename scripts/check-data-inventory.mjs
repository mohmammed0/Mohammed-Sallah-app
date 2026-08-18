import { readFileSync } from 'node:fs';

const baseMigration = readFileSync(
  new URL(
    '../supabase/migrations/20260818101821_scoped_support_and_owner_export.sql',
    import.meta.url,
  ),
  'utf8',
);
const catalogMigration = readFileSync(
  new URL(
    '../supabase/migrations/20260818131931_schema_wide_data_export_classification.sql',
    import.meta.url,
  ),
  'utf8',
);
const documentation = readFileSync(
  new URL('../docs/privacy/DATA_INVENTORY.md', import.meta.url),
  'utf8',
);

const sqlMatch = baseMigration.match(
  /create(?: or replace)? function public\.get_data_export_manifest\(\)[\s\S]*?select '(\[[\s\S]*?\])'::jsonb/u,
);
if (!sqlMatch?.[1]) throw new Error('Database export manifest was not found');
const catalogManifestMatch = catalogMigration.match(
  /get_data_export_manifest_v3\(\) \|\| '(\[[\s\S]*?\])'::jsonb/u,
);
if (!catalogManifestMatch?.[1]) throw new Error('Schema-wide export manifest was not found');
const databaseManifest = [...JSON.parse(sqlMatch[1]), ...JSON.parse(catalogManifestMatch[1])];
const coverageMatch = baseMigration.match(
  /create function public\.get_data_export_query_coverage\(\)[\s\S]*?select '(\{[\s\S]*?\})'::jsonb/u,
);
if (!coverageMatch?.[1]) throw new Error('Database export query coverage was not found');
const databaseCoverage = JSON.parse(coverageMatch[1]);
const catalogCoverageMatch = catalogMigration.match(
  /get_data_export_query_coverage_v3\(\) \|\| jsonb_build_object\(([\s\S]*?)\n  \)\n\$\$/u,
);
if (!catalogCoverageMatch?.[1]) throw new Error('Schema-wide query coverage was not found');
for (const match of catalogCoverageMatch[1].matchAll(/'([^']+)'\s*,\s*'([^']+)'/gu)) {
  databaseCoverage[match[1]] = match[2];
}
const baseExportBodyMatch = baseMigration.match(
  /create or replace function public\.build_data_export\([\s\S]*?\nend \$\$;/u,
);
const catalogExportBodyMatch = catalogMigration.match(
  /create function public\.build_data_export\([\s\S]*?\nend \$\$;/u,
);
if (!baseExportBodyMatch?.[0] || !catalogExportBodyMatch?.[0]) {
  throw new Error('Database export implementation was not found');
}
const exportBody = `${baseExportBodyMatch[0]}\n${catalogExportBodyMatch[0]}`;
const classificationRows = [
  ...catalogMigration.matchAll(
    /^\('([^']+)','(exported|exported_with_redaction|internal_security_only|operational_only|not_user_related)','([^']+)'/gmu,
  ),
].map((match) => ({ table: match[1], classification: match[2], reason: match[3] }));
const classificationTables = new Set(classificationRows.map(({ table }) => table));
const classificationKinds = new Set(classificationRows.map(({ classification }) => classification));
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
  .filter(([, anchor]) => !exportBody.includes(anchor))
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
  missingQueryAnchors.length ||
  classificationRows.length !== classificationTables.size ||
  classificationRows.some(({ reason }) => reason.trim().length < 10) ||
  classificationKinds.size !== 5 ||
  !catalogMigration.includes('create function public.assert_data_export_catalog_complete()')
) {
  throw new Error(
    JSON.stringify({
      missingFromDocs,
      missingFromDatabase,
      undocumentedCoverage,
      staleDocumentedCoverage,
      missingQueryAnchors,
      classificationRows: classificationRows.length,
      uniqueClassifiedTables: classificationTables.size,
      classificationKinds: [...classificationKinds],
    }),
  );
}
console.log(
  `Data export manifest and query coverage match documentation (${databaseManifest.length} categories); ${classificationRows.length} tables have one schema-wide classification.`,
);
