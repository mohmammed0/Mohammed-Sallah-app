import { parseAppEnvironment } from './_shared/scanner-control.ts';

function assertContract(condition: boolean, message: string) {
  if (!condition) throw new Error(message);
}

Deno.test('shared Edge APP_ENV parser fails closed for missing and unknown values', () => {
  for (const value of [undefined, '', 'locla', 'development', 'beta']) {
    let rejected = false;
    try {
      parseAppEnvironment(value);
    } catch {
      rejected = true;
    }
    assertContract(rejected, `unexpected environment accepted: ${String(value)}`);
  }
  for (const value of ['local', 'test', 'preview', 'production'] as const) {
    assertContract(parseAppEnvironment(value) === value, `${value} changed`);
  }
});

Deno.test('media-access and translation use the strict shared APP_ENV parser without fallback', async () => {
  const [mediaAccess, translation] = await Promise.all([
    Deno.readTextFile(new URL('./media-access/index.ts', import.meta.url)),
    Deno.readTextFile(new URL('./translate-provider-brief/index.ts', import.meta.url)),
  ]);
  for (
    const [name, source] of [
      ['media-access', mediaAccess],
      ['translate-provider-brief', translation],
    ] as const
  ) {
    assertContract(source.includes('parseAppEnvironment'), `${name} strict parser missing`);
    assertContract(!source.includes("?? 'local'"), `${name} defaults missing APP_ENV to local`);
    assertContract(
      !source.includes("?? Deno.env.get('SALLAH_ENV')"),
      `${name} legacy env fallback`,
    );
  }
});

Deno.test('deterministic translation is restricted to explicit local/test environments', async () => {
  const source = await Deno.readTextFile(
    new URL('./translate-provider-brief/index.ts', import.meta.url),
  );
  assertContract(
    source.includes("['local', 'test'].includes(environment)"),
    'deterministic translation environment allowlist missing',
  );
  assertContract(
    !source.includes("environment !== 'production'"),
    'preview must not inherit deterministic translation',
  );
});
