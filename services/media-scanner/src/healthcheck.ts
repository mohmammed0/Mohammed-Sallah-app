import { readScannerHealth, SCANNER_HEALTH_PATH } from './operational-health.js';

// No network requests, raw errors, configuration values or state contents are printed.
process.exitCode = readScannerHealth(process.argv[2] ?? SCANNER_HEALTH_PATH) ? 0 : 1;
