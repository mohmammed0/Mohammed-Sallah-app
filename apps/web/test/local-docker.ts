import { spawnSync } from 'node:child_process';

export type DockerProbe = (command: string, args: readonly string[]) => { status: number | null };

export interface DockerCommand {
  command: string;
  args: string[];
  shell: boolean;
}

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;

export function parseCreatedReportId(stdout: string): string {
  let value: unknown;
  try {
    value = JSON.parse(stdout.trim());
  } catch {
    throw new Error('LOCAL_MODERATION_REPORT_RESULT_INVALID');
  }
  if (
    typeof value !== 'object' ||
    value === null ||
    Array.isArray(value) ||
    !Object.hasOwn(value, 'reportId') ||
    typeof (value as { reportId?: unknown }).reportId !== 'string' ||
    !uuidPattern.test((value as { reportId: string }).reportId)
  ) {
    throw new Error('LOCAL_MODERATION_REPORT_ID_MISSING');
  }
  return (value as { reportId: string }).reportId;
}

const systemProbe: DockerProbe = (command, args) =>
  spawnSync(command, [...args], { shell: process.platform === 'win32', stdio: 'ignore' });

export function resolveDockerCommand(
  args: readonly string[],
  platform: NodeJS.Platform = process.platform,
  probe: DockerProbe = systemProbe,
): DockerCommand {
  const nativeProbe = probe('docker', ['version']);
  if (nativeProbe.status === 0 || platform !== 'win32') {
    return { command: 'docker', args: [...args], shell: platform === 'win32' };
  }
  const wslProbe = probe('wsl.exe', ['--exec', 'docker', 'version']);
  if (wslProbe.status === 0) {
    return { command: 'wsl.exe', args: ['--exec', 'docker', ...args], shell: false };
  }
  return { command: 'docker', args: [...args], shell: true };
}
