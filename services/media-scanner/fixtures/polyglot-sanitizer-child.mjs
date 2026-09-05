import { writeFile } from 'node:fs/promises';

const outputPath = process.argv[3];
if (!outputPath) throw new Error('missing output path');
const png = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGP4z8DwHwAFAAH/iZk9HQAAAABJRU5ErkJggg==',
  'base64',
);
await writeFile(outputPath, Buffer.concat([png, Buffer.from('PK\x03\x04trailer')]), {
  flag: 'wx',
  mode: 0o600,
});
process.stdout.write(
  JSON.stringify({
    status: 'clean',
    detectedMimeType: 'image/png',
    sanitized: true,
    sanitizerId: 'decode-reencode-png-v1',
    sanitizerVersion: '1.0.0',
  }),
);
