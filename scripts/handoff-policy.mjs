export const REQUIRED_HANDOFF_FILES = [
  'README.md',
  'CURRENT_STATE.md',
  'REPOSITORY_MAP.md',
  'PRODUCT_SCOPE.md',
  'ARCHITECTURE_SUMMARY.md',
  'USER_ROLES.md',
  'USER_JOURNEYS.md',
  'SCREEN_INVENTORY.md',
  'ROUTE_CATALOG.md',
  'UI_STATE_MATRIX.md',
  'API_CONTRACTS.md',
  'VIEW_MODEL_CATALOG.md',
  'DOMAIN_INVARIANTS.md',
  'SECURITY_BOUNDARIES.md',
  'PRIVACY_BOUNDARIES.md',
  'ACCESSIBILITY_AND_I18N.md',
  'DESIGN_TOKEN_CONTRACT.md',
  'ASSET_AND_LICENSE_RULES.md',
  'MOCK_AND_FIXTURE_GUIDE.md',
  'TOOL_OWNERSHIP_MATRIX.md',
  'MULTI_TOOL_BACKLOG.md',
  'CLAUDE_CODE_HANDOFF.md',
  'CLAUDE_START_PROMPT.md',
  'TOOLS_MUST_START_FROM.md',
  'FIGMA_HANDOFF.md',
  'FIGMA_SCREEN_BRIEF.md',
  'CANVA_HANDOFF.md',
  'NOTION_LINEAR_HANDOFF.md',
  'UI_ALLOWLIST.md',
  'UI_DENYLIST.md',
  'UI_CONTRACT_CHANGE_PROCESS.md',
  'EXTERNAL_GATES.md',
  'HUMAN_INPUTS_REMAINING.md',
  'KNOWN_LIMITATIONS.md',
  'VALIDATION_EVIDENCE.md',
  'HANDOFF_CHECKLIST.md',
  'GIT_ANCESTRY_AND_PR_CHAIN.md',
  'handoff-manifest.json',
];

const REQUIRED_ARRAYS = [
  'apps',
  'packages',
  'routes',
  'roles',
  'ciResults',
  'validationCounts',
  'externalGates',
  'allowedUiPaths',
  'deniedPaths',
  'firstFilesByTool',
];

export function validateHandoffManifest(manifest) {
  const errors = [];
  if (manifest?.schemaVersion !== '1.1.0') errors.push('schemaVersion must be 1.1.0');
  if (manifest?.repository !== 'mohmammed0/Mohammed-Sallah-app') {
    errors.push('repository must identify the Sallah repository');
  }
  if (manifest?.canonicalBranch !== 'main') {
    errors.push('canonicalBranch must be main');
  }
  if (manifest?.exactSha !== 'git:HEAD') {
    errors.push('exactSha must use the non-stale git:HEAD resolver');
  }
  if (manifest?.exactShaCommand !== 'git rev-parse HEAD') {
    errors.push('exactShaCommand must resolve the checkout identity');
  }
  if (manifest?.sourceCommit !== 'git:HEAD') {
    errors.push('sourceCommit must use the non-stale git:HEAD resolver');
  }
  if (manifest?.finalMainSha !== 'reported-externally-after-merge') {
    errors.push('finalMainSha must be reported externally after merge');
  }
  if (manifest?.releaseTag !== 'sallah-multitool-handoff-v1') {
    errors.push('releaseTag must identify the immutable handoff tag');
  }
  if (!manifest?.generatedAt || Number.isNaN(Date.parse(manifest.generatedAt))) {
    errors.push('generatedAt must be an ISO timestamp');
  }
  if (!manifest?.versions || typeof manifest.versions !== 'object') {
    errors.push('versions must be an object');
  }
  for (const field of REQUIRED_ARRAYS) {
    if (!Array.isArray(manifest?.[field]) || manifest[field].length === 0) {
      errors.push(`${field} must be a non-empty array`);
    }
  }
  if (!manifest?.finalIntegrationPr || typeof manifest.finalIntegrationPr !== 'object') {
    errors.push('finalIntegrationPr must be an object');
  } else {
    if (manifest.finalIntegrationPr.number !== 36) {
      errors.push('finalIntegrationPr.number must be 36');
    }
    if (manifest.finalIntegrationPr.base !== 'main') {
      errors.push('finalIntegrationPr.base must be main');
    }
  }
  return errors;
}
