import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const fixture = vi.hoisted(() => ({
  tables: {} as Record<string, unknown>,
  failedTable: null as string | null,
  reads: [] as Array<{ table: string; filters: Array<[string, unknown]> }>,
  rpc: vi.fn(),
  upload: vi.fn(),
  alert: vi.fn(),
  pick: vi.fn(),
  authUserId: '11111111-1111-4111-8111-111111111111',
}));
const owner = '11111111-1111-4111-8111-111111111111';
const category = '22222222-2222-4222-8222-222222222222';
const subcategory = '33333333-3333-4333-8333-333333333333';
const city = '44444444-4444-4444-8444-444444444444';
const secondCity = '55555555-5555-4555-8555-555555555555';
vi.mock('react-native', () => ({
  Text: 'Text',
  TextInput: 'TextInput',
  View: 'View',
  ScrollView: 'ScrollView',
  Alert: { alert: fixture.alert },
  Linking: { openSettings: vi.fn() },
}));
vi.mock('@/components/ui', () => ({
  Button: 'Button',
  Card: 'Card',
  LoadingSkeleton: 'LoadingSkeleton',
  Screen: 'Screen',
  styles: {},
}));
vi.mock('expo-image-picker', () => ({ launchImageLibraryAsync: fixture.pick }));
vi.mock('@/providers/locale-provider', () => ({
  useLocale: () => ({
    locale: 'en',
    t: (key: string, args?: Record<string, unknown>) =>
      args?.day !== undefined
        ? `${key}:${args.day}`
        : args?.count !== undefined
          ? `${key}:${args.count}`
          : key,
  }),
}));
vi.mock('@/providers/session-provider', () => ({
  useSessionContext: () => ({ session: { user: { id: '11111111-1111-4111-8111-111111111111' } } }),
}));
vi.mock('@/features/location/location-device', () => ({
  acquireForegroundLocation: async (accept: (candidate: unknown) => void) => {
    accept({ coordinates: { latitude: 24.5, longitude: 46.5 } });
    return { status: 'accurate' };
  },
  locationRecoveryForResult: () => ({ action: null }),
}));
vi.mock('@/lib/secure-upload', () => ({ secureUpload: fixture.upload }));
vi.mock(
  '@/features/provider/onboarding-draft',
  async () => import('../src/features/provider/onboarding-draft'),
);
vi.mock('@/lib/mutation-journal', () => ({
  executeJournaledMutation: (input: {
    execute: (key: string, payload: unknown) => Promise<unknown>;
    payload: unknown;
  }) => input.execute('synthetic-onboarding', input.payload),
}));
vi.mock('@/lib/supabase', () => ({
  supabase: {
    auth: {
      getUser: async () => ({ data: { user: { id: fixture.authUserId } } }),
    },
    rpc: fixture.rpc,
    from: (table: string) => {
      const read = { table, filters: [] as Array<[string, unknown]> };
      fixture.reads.push(read);
      const result = () =>
        Promise.resolve({
          data: fixture.tables[table],
          error: fixture.failedTable === table ? new Error('SYNTHETIC_READ_FAILURE') : null,
        });
      const builder = {
        select: () => builder,
        order: () => builder,
        eq: (key: string, value: unknown) => {
          read.filters.push([key, value]);
          return builder;
        },
        is: (key: string, value: unknown) => {
          read.filters.push([key, value]);
          return builder;
        },
        maybeSingle: result,
        then: (resolve: (value: unknown) => unknown, reject: (error: unknown) => unknown) =>
          result().then(resolve, reject),
      };
      return builder;
    },
  },
}));
import ProviderOnboarding from '../app/provider/onboarding';

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT =
  true;
let renderer: ReactTestRenderer;
let client: QueryClient;
function point(longitude: number, latitude: number) {
  const bytes = new Uint8Array(25);
  const view = new DataView(bytes.buffer);
  view.setUint8(0, 1);
  view.setUint32(1, 0x20000001, true);
  view.setUint32(5, 4326, true);
  view.setFloat64(9, longitude, true);
  view.setFloat64(17, latitude, true);
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
}
async function settle() {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 10));
  });
}
async function open() {
  client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 }, mutations: { retry: false } },
  });
  await act(async () => {
    renderer = create(
      <QueryClientProvider client={client}>
        <ProviderOnboarding />
      </QueryClientProvider>,
    );
  });
  await settle();
}
function button(label: string) {
  return renderer.root.findAllByType('Button').find((node) => node.props.label === label)!;
}
function input(placeholder: string) {
  return renderer.root
    .findAllByType('TextInput')
    .find((node) => node.props.placeholder === placeholder)!;
}
async function press(label: string) {
  await act(async () => {
    button(label).props.onPress();
  });
  await settle();
}
function visibleText() {
  return renderer.root
    .findAllByType('Text')
    .map((node) => node.props.children)
    .flat();
}
beforeEach(() => {
  fixture.failedTable = null;
  fixture.reads.length = 0;
  fixture.rpc.mockReset();
  fixture.upload.mockReset();
  fixture.alert.mockReset();
  fixture.authUserId = owner;
  fixture.pick.mockReset().mockResolvedValue({
    canceled: false,
    assets: [{ uri: 'file:///synthetic-owned-document.jpg', mimeType: 'image/jpeg', fileSize: 1 }],
  });
  fixture.tables = {
    service_categories: [
      { id: category, slug: 'plumbing', service_category_translations: [{ name: 'Plumbing' }] },
    ],
    cities: [
      { id: city, code: 'RUH', name_ar: 'Synthetic city A', name_en: 'Riyadh' },
      { id: secondCity, code: 'JED', name_ar: 'Synthetic city B', name_en: 'Jeddah' },
    ],
    provider_profiles: {
      kind: 'company',
      business_name: 'Saved workshop',
      bio: 'A saved provider biography.',
      commercial_registration_reference: 'SYNTHETIC-CR',
      service_radius_km: 25,
      verification_status: 'more_information_required',
      updated_at: '2026-09-06T00:00:00Z',
    },
    provider_services: [{ category_id: category, subcategory_id: subcategory }],
    provider_service_areas: [
      { city_id: city, center: point(46.7, 24.7), radius_m: 25000 },
      { city_id: secondCity, center: point(39.2, 21.5), radius_m: 10000 },
    ],
    provider_availability: [
      { weekday: 2, start_time: '09:30:00', end_time: '17:15:00' },
      { weekday: 4, start_time: '10:00:00', end_time: '18:00:00' },
    ],
    provider_documents: [{ id: '66666666-6666-4666-8666-666666666666' }],
  };
  fixture.rpc.mockResolvedValue({ data: { providerId: owner, status: 'submitted' }, error: null });
});
afterEach(async () => {
  if (renderer) await act(async () => renderer.unmount());
  client?.clear();
  vi.unstubAllGlobals();
});

describe('provider saved onboarding', () => {
  it('refuses to upload an owner draft when the authenticated identity has already changed', async () => {
    await open();
    await press('attachVerificationDocument');
    fixture.authUserId = '77777777-7777-4777-8777-777777777777';
    const fetch = vi.fn();
    vi.stubGlobal('fetch', fetch);
    await press('resubmitForReview');
    expect(fetch).not.toHaveBeenCalled();
    expect(fixture.upload).not.toHaveBeenCalled();
    expect(fixture.rpc).not.toHaveBeenCalled();
  });
  it.each([
    { accountChanged: true, unmounted: false },
    { accountChanged: true, unmounted: true },
    { accountChanged: false, unmounted: true },
  ])(
    'stops a deferred upload submission when its owner screen is no longer valid: %j',
    async ({ accountChanged, unmounted }) => {
      let finish!: (value: unknown) => void;
      fixture.upload.mockReturnValue(
        new Promise((resolve) => {
          finish = resolve;
        }),
      );
      vi.stubGlobal(
        'fetch',
        vi.fn(async () => new Response(new Uint8Array([1]))),
      );
      await open();
      await press('attachVerificationDocument');
      await press('resubmitForReview');
      expect(fixture.upload).toHaveBeenCalledTimes(1);
      if (accountChanged) fixture.authUserId = '77777777-7777-4777-8777-777777777777';
      if (unmounted) await act(async () => renderer.update(<replacement-screen />));
      await act(async () => finish({ uploadId: '88888888-8888-4888-8888-888888888888' }));
      await settle();
      expect(fixture.rpc).not.toHaveBeenCalled();
      expect(fixture.alert).not.toHaveBeenCalled();
    },
  );
  it('submits a newly uploaded document while the same owner remains active', async () => {
    fixture.upload.mockResolvedValue({ uploadId: '88888888-8888-4888-8888-888888888888' });
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(new Uint8Array([1]))),
    );
    await open();
    await press('attachVerificationDocument');
    await press('resubmitForReview');
    expect(fixture.rpc).toHaveBeenCalledTimes(1);
    expect(fixture.rpc.mock.calls[0]?.[1].payload.documents).toEqual([
      { uploadId: '88888888-8888-4888-8888-888888888888', documentType: 'commercial_registration' },
    ]);
    expect(fixture.alert).toHaveBeenCalledTimes(1);
  });
  it('restores the owner profile, services, cities, weekdays and retained document count', async () => {
    await open();
    expect(input('providerNamePlaceholder').props.value).toBe('Saved workshop');
    expect(input('providerBioPlaceholder').props.value).toBe('A saved provider biography.');
    expect(input('serviceRadiusPlaceholder').props.value).toBe('25');
    for (const label of [
      'company',
      'Plumbing',
      'Riyadh',
      'Jeddah',
      'weekdayNumber:2',
      'weekdayNumber:4',
    ])
      expect(button(label).props.kind).toBe('primary');
    expect(button('weekdayNumber:0').props.kind).toBe('secondary');
    expect(visibleText()).toContain('providerDocumentsRetained:1');
    for (const table of [
      'provider_profiles',
      'provider_services',
      'provider_service_areas',
      'provider_availability',
      'provider_documents',
    ])
      expect(fixture.reads.find((read) => read.table === table)?.filters).toContainEqual([
        table === 'provider_profiles' ? 'user_id' : 'provider_id',
        owner,
      ]);
  });
  it('resubmits with retained documents and preserves distinct area centers, radii, subcategory and working hours', async () => {
    await open();
    await act(async () =>
      input('providerBioPlaceholder').props.onChangeText('An edited provider biography.'),
    );
    await press('resubmitForReview');
    expect(fixture.rpc).toHaveBeenCalledTimes(1);
    expect(fixture.rpc.mock.calls[0]?.[1].payload).toMatchObject({
      bio: 'An edited provider biography.',
      documents: [],
      services: [{ categoryId: category, subcategoryId: subcategory }],
      serviceAreas: [
        { cityId: city, location: { longitude: 46.7, latitude: 24.7 }, radiusKm: 25 },
        { cityId: secondCity, location: { longitude: 39.2, latitude: 21.5 }, radiusKm: 10 },
      ],
      availability: [
        { weekday: 2, start: '09:30:00', end: '17:15:00' },
        { weekday: 4, start: '10:00:00', end: '18:00:00' },
      ],
    });
    expect(fixture.upload).not.toHaveBeenCalled();
  });
  it('does not overwrite unsaved text or selection edits during a server refetch', async () => {
    await open();
    await act(async () => input('providerNamePlaceholder').props.onChangeText('My unsaved name'));
    await press('weekdayNumber:2');
    fixture.tables.provider_profiles = {
      ...(fixture.tables.provider_profiles as object),
      business_name: 'Different server value',
    };
    await act(async () => {
      await client.invalidateQueries();
    });
    await settle();
    expect(input('providerNamePlaceholder').props.value).toBe('My unsaved name');
    expect(button('weekdayNumber:2').props.kind).toBe('secondary');
    expect(button('weekdayNumber:4').props.kind).toBe('primary');
  });
  it('applies an explicit shared radius edit to every selected service area', async () => {
    await open();
    await act(async () => input('serviceRadiusPlaceholder').props.onChangeText('35'));
    await press('saveDraft');
    expect(fixture.rpc.mock.calls[0]?.[1].payload.serviceAreas).toEqual([
      { cityId: city, location: { longitude: 46.7, latitude: 24.7 }, radiusKm: 35 },
      { cityId: secondCity, location: { longitude: 39.2, latitude: 21.5 }, radiusKm: 35 },
    ]);
  });
  it('rejects an empty weekday selection instead of sending the RPC default for all seven days', async () => {
    await open();
    for (const weekday of [0, 1, 2, 3, 4, 5, 6])
      if (button(`weekdayNumber:${weekday}`).props.kind === 'primary')
        await press(`weekdayNumber:${weekday}`);
    await press('saveDraft');
    expect(fixture.rpc).not.toHaveBeenCalled();
    expect(visibleText()).toContain('providerAvailabilityRequired');
  });
  it('blocks editing on a failed owner read and restores the profile after retry', async () => {
    fixture.failedTable = 'provider_profiles';
    await open();
    expect(visibleText()).toContain('providerDraftLoadFailed');
    expect(renderer.root.findAllByType('TextInput')).toHaveLength(0);
    expect(button('saveDraft')).toBeUndefined();
    fixture.failedTable = null;
    await press('retry');
    expect(input('providerNamePlaceholder').props.value).toBe('Saved workshop');
  });
  it('keeps first-time onboarding editable after a confirmed missing profile', async () => {
    fixture.tables.provider_profiles = null;
    fixture.tables.provider_services = [];
    fixture.tables.provider_service_areas = [];
    fixture.tables.provider_availability = [];
    fixture.tables.provider_documents = [];
    await open();
    expect(input('providerNamePlaceholder').props.value).toBe('');
    expect(button('saveDraft').props.disabled).toBe(false);
    expect(button('weekdayNumber:0').props.kind).toBe('primary');
  });
});
