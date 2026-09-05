import type { ActiveServiceLocation } from './location-state';
import type { SavedAddress } from './location-model';

export interface LocationEditorState {
  id: string | null;
  label: string;
  formattedAddress: string;
  building: string;
  unit: string;
  accessNotes: string;
  makeDefault: boolean;
}

export function initializeLocationEditor(input: {
  loaded: boolean;
  addresses: readonly SavedAddress[];
  editingAddressId: string | null;
  activeLocation: ActiveServiceLocation | null;
  defaultLabel: string;
}): LocationEditorState | null {
  if (!input.loaded) return null;
  const existing = input.editingAddressId
    ? (input.addresses.find((address) => address.id === input.editingAddressId) ?? null)
    : null;
  const source = existing ?? input.activeLocation;
  return {
    id: existing?.id ?? null,
    label: source?.label ?? input.defaultLabel,
    formattedAddress: source?.formattedAddress ?? '',
    building: source?.building ?? '',
    unit: source?.unit ?? '',
    accessNotes: source?.accessNotes ?? '',
    makeDefault: existing?.isDefault ?? input.addresses.length === 0,
  };
}

export function shouldOfferTransientSave(location: ActiveServiceLocation | null): boolean {
  return Boolean(location && location.savedAddressId === null);
}

export function selectedAddressAfterArchive(
  selectedAddressId: string | null,
  archivedAddressId: string,
): string | null {
  return selectedAddressId === archivedAddressId ? null : selectedAddressId;
}

export function createDebouncedResolver<T>(
  delayMs: number,
  run: (value: T) => void,
  schedule: (callback: () => void, delay: number) => ReturnType<typeof setTimeout> = setTimeout,
  cancel: (timer: ReturnType<typeof setTimeout>) => void = clearTimeout,
): { schedule: (value: T) => void; cancel: () => void } {
  let timer: ReturnType<typeof setTimeout> | null = null;
  return {
    schedule(value) {
      if (timer) cancel(timer);
      timer = schedule(() => {
        timer = null;
        run(value);
      }, delayMs);
    },
    cancel() {
      if (!timer) return;
      cancel(timer);
      timer = null;
    },
  };
}
