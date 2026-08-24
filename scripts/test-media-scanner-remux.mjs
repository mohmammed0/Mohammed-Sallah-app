import { spawn } from 'node:child_process';

const image = 'sallah-media-scanner-worker:m2v-node24.19.0-image1.13.0';
const required = [
  'real-m4a-remux',
  'real-mp4-audio-remux',
  'real-mp4-video-remux',
  'remux-metadata-stripped',
  'remux-trailing-payload-rejected',
  'remux-timeout-child-killed',
];

const dockerInvocation =
  process.platform === 'win32'
    ? { command: 'wsl.exe', prefix: ['-e', 'docker'] }
    : { command: 'docker', prefix: [] };

const output = await new Promise((resolve, reject) => {
  const child = spawn(
    dockerInvocation.command,
    [
      ...dockerInvocation.prefix,
      'run',
      '--rm',
      '--read-only',
      '--cap-drop',
      'ALL',
      '--security-opt',
      'no-new-privileges:true',
      '--pids-limit',
      '32',
      '--memory',
      '512m',
      '--memory-swap',
      '512m',
      '--cpus',
      '1',
      '--tmpfs',
      '/tmp/scanner:rw,noexec,nosuid,nodev,size=128m,uid=65532,gid=65532,mode=0700',
      '--entrypoint',
      'node',
      image,
      'remux-probe.mjs',
    ],
    { shell: false, stdio: ['ignore', 'pipe', 'pipe'] },
  );
  let stdout = '';
  let stderr = '';
  child.stdout.on('data', (chunk) => {
    stdout = `${stdout}${String(chunk)}`.slice(-64 * 1024);
  });
  child.stderr.on('data', (chunk) => {
    stderr = `${stderr}${String(chunk)}`.slice(-64 * 1024);
  });
  child.once('error', () => reject(new Error('REMUX_CONTAINER_START_FAILED')));
  child.once('close', (code, signal) => {
    if (code !== 0 || signal !== null) {
      reject(new Error(`REMUX_CONTAINER_FAILED:${code}:${signal}:${stderr.slice(-1000)}`));
      return;
    }
    resolve(stdout);
  });
});

let result;
try {
  result = JSON.parse(output.trim().split(/\r?\n/u).at(-1));
} catch {
  throw new Error('REMUX_EVIDENCE_INVALID');
}
if (
  result.status !== 'pass' ||
  result.license !== 'GPL' ||
  !/ffmpeg version 5\.1\.9/u.test(result.version)
) {
  throw new Error('REMUX_RUNTIME_EVIDENCE_INVALID');
}
for (const label of required) {
  if (!result.evidence.includes(label)) throw new Error(`REMUX_EVIDENCE_MISSING:${label}`);
}
console.log(JSON.stringify(result));
