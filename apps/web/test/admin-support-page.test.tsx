import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({ tables: [] as string[] }));

function queryResult() {
  const builder = {
    select: () => builder,
    eq: () => builder,
    not: () => builder,
    order: () => builder,
    limit: async () => ({ data: [], error: null }),
  };
  return builder;
}

const client = {
  from: (table: string) => {
    state.tables.push(table);
    return queryResult();
  },
};

vi.mock('@/lib/auth', () => ({
  requireAnyAdmin: async () => ({ client, roles: ['operations_admin'] }),
}));

describe('linked support-case page mode', () => {
  beforeEach(() => {
    state.tables = [];
  });

  it('loads only the exact support case and omits unrelated cancellation/dispute queues', async () => {
    const caseId = '11111111-1111-4111-8111-111111111111';
    const { default: SupportPage } = await import('../app/admin/support/page');
    renderToStaticMarkup(await SupportPage({ searchParams: Promise.resolve({ caseId }) }));

    expect(state.tables).toEqual(['support_cases']);
  });
});
