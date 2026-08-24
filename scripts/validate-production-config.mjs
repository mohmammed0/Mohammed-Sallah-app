import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { validateProductionConfiguration } from './production-config-validation.mjs';

export function runProductionConfigurationGate(environment = process.env) {
  const result = validateProductionConfiguration({ ...environment });
  if (result.ok) console.log(result.message);
  else console.error(result.message);
  return result.ok ? 0 : 1;
}

const invokedPath = process.argv[1] ? resolve(process.argv[1]) : null;
if (invokedPath === fileURLToPath(import.meta.url)) {
  process.exitCode = runProductionConfigurationGate();
}
