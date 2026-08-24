import { runBoundedMediaCommand } from '../dist/ffmpeg-remux.js';

const markerPath = `${process.argv[2]}.grandchild.pid`;
await runBoundedMediaCommand({
  executable: process.execPath,
  args: [
    '-e',
    "require('node:fs').writeFileSync(process.argv[1], String(process.pid)); setInterval(() => undefined, 1000);",
    markerPath,
  ],
  signal: new AbortController().signal,
  shell: false,
  maxStdoutBytes: 1024,
  maxStderrBytes: 1024,
});
