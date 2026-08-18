import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
const sql = readFileSync('supabase/migrations/202608170004_security_commands.sql', 'utf8');
describe('security invariants', () => {
  it('keeps offers sealed', () => expect(sql).toContain('create policy offers_sealed'));
  it('guards exact addresses through selected jobs', () =>
    expect(sql).toContain('j.exact_address_id=addresses.id and j.provider_id=auth.uid()'));
  it('revokes matching from clients', () =>
    expect(sql).toContain('revoke all on function public.run_matching'));
  it('keeps service role out of clients', () => {
    const mobile = readFileSync('apps/mobile/src/lib/supabase.ts', 'utf8');
    expect(mobile).not.toContain('SUPABASE_SERVICE_ROLE_KEY');
  });
});
