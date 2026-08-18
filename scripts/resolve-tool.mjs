import { spawnSync } from 'node:child_process';

function windowsToWslPath(value) {
  const match = /^([A-Za-z]):\\(.*)$/.exec(value);
  if (!match) return null;
  return `/mnt/${match[1].toLowerCase()}/${match[2].replaceAll('\\', '/')}`;
}

export function resolveTool(command, args) {
  if (process.platform === 'win32' && process.env.USERPROFILE) {
    const wslHome = windowsToWslPath(process.env.USERPROFILE);
    const wslCwd = windowsToWslPath(process.cwd());
    if (wslHome && wslCwd) {
      const candidate = `${wslHome}/.local/bin/${command}`;
      const probe = spawnSync('wsl.exe', ['-e', 'test', '-x', candidate], {
        stdio: 'ignore',
        shell: false,
      });
      if (probe.status === 0) {
        return {
          command: 'wsl.exe',
          args: ['--cd', wslCwd, '-e', candidate, ...args],
          shell: false,
        };
      }
    }
  }
  return { command, args, shell: process.platform === 'win32' };
}

export function spawnTool(command, args, options = {}) {
  const resolved = resolveTool(command, args);
  return spawnSync(resolved.command, resolved.args, {
    ...options,
    shell: resolved.shell,
  });
}
