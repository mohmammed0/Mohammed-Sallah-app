import { describe, expect, it } from 'vitest';
import { parseCreatedReportId, resolveDockerCommand, type DockerProbe } from './local-docker';

describe('local E2E Docker command resolution', () => {
  it('prefers a working native Docker command on Windows', () => {
    const calls: string[] = [];
    const probe: DockerProbe = (command) => {
      calls.push(command);
      return { status: 0 };
    };
    expect(resolveDockerCommand(['exec', 'container'], 'win32', probe)).toEqual({
      command: 'docker',
      args: ['exec', 'container'],
      shell: true,
    });
    expect(calls).toEqual(['docker']);
  });

  it('falls back to WSL Docker only when native Docker is unavailable on Windows', () => {
    const calls: string[] = [];
    const probe: DockerProbe = (command) => {
      calls.push(command);
      return { status: command === 'wsl.exe' ? 0 : 1 };
    };
    expect(resolveDockerCommand(['exec', 'container'], 'win32', probe)).toEqual({
      command: 'wsl.exe',
      args: ['--exec', 'docker', 'exec', 'container'],
      shell: false,
    });
    expect(calls).toEqual(['docker', 'wsl.exe']);
  });

  it('never routes a non-Windows host through WSL', () => {
    const calls: string[] = [];
    const probe: DockerProbe = (command) => {
      calls.push(command);
      return { status: 1 };
    };
    expect(resolveDockerCommand(['exec', 'container'], 'linux', probe)).toEqual({
      command: 'docker',
      args: ['exec', 'container'],
      shell: false,
    });
    expect(calls).toEqual(['docker']);
  });

  it('parses only an explicit reportId field from Docker JSON output', () => {
    const reportId = '11111111-1111-4111-8111-111111111111';
    expect(
      parseCreatedReportId(JSON.stringify({ reportId, supportCaseId: crypto.randomUUID() })),
    ).toBe(reportId);
    expect(() => parseCreatedReportId(JSON.stringify({ supportCaseId: reportId }))).toThrow(
      'LOCAL_MODERATION_REPORT_ID_MISSING',
    );
    expect(() => parseCreatedReportId(JSON.stringify([reportId]))).toThrow(
      'LOCAL_MODERATION_REPORT_ID_MISSING',
    );
    expect(() => parseCreatedReportId('not-json')).toThrow(
      'LOCAL_MODERATION_REPORT_RESULT_INVALID',
    );
  });
});
