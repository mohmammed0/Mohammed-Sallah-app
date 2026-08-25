import { useEffect, useMemo, useRef, useState } from 'react';
import { Alert, Linking, StyleSheet, Switch, Text, View } from 'react-native';
import MapView, { type Region } from 'react-native-maps';
import * as Location from 'expo-location';
import {
  AddressCard,
  AppHeader,
  AppScreen,
  FormField,
  GhostButton,
  LocationPermissionCard,
  MapPin,
  PrimaryButton,
  SecondaryButton,
  Toast,
} from '@/design-system/customer-components';
import { SectionHeader, customerStyles } from '@/design-system/primitives';
import { customerTokens as tokens } from '@/design-system/tokens';
import { useLocale } from '@/providers/locale-provider';
import {
  coordinatesSchema,
  normalizeReverseGeocode,
  savedAddressInputSchema,
  serviceLocationStatusKey,
  type Coordinates,
  type ServiceLocationResolution,
} from './location-model';
import { createDebouncedResolver, initializeLocationEditor } from './location-editor-state';
import { acquireForegroundLocation, locationRecoveryForResult } from './location-device';
import {
  isCustomerMapConfigured,
  MAP_RENDER_TIMEOUT_MS,
  REVERSE_GEOCODE_DEBOUNCE_MS,
} from './map-readiness';
import { resolveServiceLocation } from './location-service';
import { useCustomerLocation } from './location-provider';

const RIYADH: Coordinates = { latitude: 24.7136, longitude: 46.6753 };
const MAP_DELTA = 0.035;

function asRegion(coordinates: Coordinates): Region {
  return { ...coordinates, latitudeDelta: MAP_DELTA, longitudeDelta: MAP_DELTA };
}

export function LocationPicker({ onDone }: { onDone: () => void }) {
  const { dir, locale, t } = useLocale();
  const location = useCustomerLocation();
  const mapRef = useRef<MapView | null>(null);
  const [editingAddressId, setEditingAddressId] = useState<string | null>(null);
  const [editorOpen, setEditorOpen] = useState(false);
  const [editorInitialized, setEditorInitialized] = useState(false);
  const [coordinates, setCoordinates] = useState<Coordinates>(
    location.activeLocation?.coordinates ?? RIYADH,
  );
  const [label, setLabel] = useState('');
  const [formattedAddress, setFormattedAddress] = useState('');
  const [building, setBuilding] = useState('');
  const [unit, setUnit] = useState('');
  const [accessNotes, setAccessNotes] = useState('');
  const [makeDefault, setMakeDefault] = useState(false);
  const [resolution, setResolution] = useState<ServiceLocationResolution | null>(null);
  const [reverseGeocodeUnavailable, setReverseGeocodeUnavailable] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [mapReady, setMapReady] = useState(false);
  const [mapTimedOut, setMapTimedOut] = useState(false);
  const [permissionRecovery, setPermissionRecovery] = useState<'retry' | 'settings' | null>(null);
  const canRenderMap = isCustomerMapConfigured();
  const directionStyle = dir === 'rtl' ? styles.rtl : styles.ltr;

  const resolvePointRef = useRef<(value: Coordinates) => void>(() => undefined);
  const debouncedResolver = useMemo(
    () =>
      createDebouncedResolver<Coordinates>(REVERSE_GEOCODE_DEBOUNCE_MS, (value) =>
        resolvePointRef.current(value),
      ),
    [],
  );

  useEffect(() => () => debouncedResolver.cancel(), [debouncedResolver]);

  useEffect(() => {
    if (!editorOpen || !canRenderMap || mapReady) return;
    const timer = setTimeout(() => setMapTimedOut(true), MAP_RENDER_TIMEOUT_MS);
    return () => clearTimeout(timer);
  }, [canRenderMap, editorOpen, mapReady]);

  useEffect(() => {
    if (!editorOpen || editorInitialized || !location.loaded) return;
    const initialized = initializeLocationEditor({
      loaded: location.loaded,
      addresses: location.addresses,
      editingAddressId,
      activeLocation:
        location.activeLocation?.savedAddressId === null ? location.activeLocation : null,
      defaultLabel: t('savedLabelHome'),
    });
    if (!initialized) return;
    const existing = editingAddressId
      ? (location.addresses.find((address) => address.id === editingAddressId) ?? null)
      : null;
    const point = existing?.coordinates ?? location.activeLocation?.coordinates ?? RIYADH;
    setCoordinates(point);
    setLabel(initialized.label);
    setFormattedAddress(initialized.formattedAddress);
    setBuilding(initialized.building);
    setUnit(initialized.unit);
    setAccessNotes(initialized.accessNotes);
    setMakeDefault(initialized.makeDefault);
    setEditorInitialized(true);
    void resolvePoint(point, Boolean(initialized.formattedAddress));
  }, [editingAddressId, editorInitialized, editorOpen, location, t]);

  async function resolvePoint(next: Coordinates, preserveAddress = false) {
    setCoordinates(next);
    setBusy(true);
    setMessage('');
    setReverseGeocodeUnavailable(false);
    try {
      const [authoritative, geocode] = await Promise.all([
        resolveServiceLocation(next),
        Location.reverseGeocodeAsync(next).catch(() => null),
      ]);
      setResolution(authoritative);
      const normalized = normalizeReverseGeocode(geocode?.[0]);
      if (normalized && !preserveAddress) {
        setFormattedAddress(normalized.formattedAddress);
      } else if (!preserveAddress) {
        setFormattedAddress('');
        setReverseGeocodeUnavailable(true);
      }
    } catch {
      setResolution(null);
      setMessage(t('locationUnavailable'));
    } finally {
      setBusy(false);
    }
  }
  resolvePointRef.current = (value) => void resolvePoint(value);

  function startEditor(addressId: string | null) {
    setEditingAddressId(addressId);
    setEditorInitialized(false);
    setResolution(null);
    setReverseGeocodeUnavailable(false);
    setMapReady(false);
    setMapTimedOut(false);
    setPermissionRecovery(null);
    setMessage('');
    setEditorOpen(true);
  }

  function closeEditor() {
    debouncedResolver.cancel();
    setEditorOpen(false);
    setEditingAddressId(null);
    setEditorInitialized(false);
  }

  async function useCurrentLocation() {
    setBusy(true);
    setMessage('');
    setPermissionRecovery(null);
    try {
      const result = await acquireForegroundLocation(async ({ coordinates: point }) => {
        mapRef.current?.animateToRegion(asRegion(point), 260);
        await resolvePoint(point);
      });
      const recovery = locationRecoveryForResult(result);
      setPermissionRecovery(recovery.action);
      if (recovery.messageKey) setMessage(t(recovery.messageKey));
    } catch {
      setMessage(t('locationUnavailable'));
    } finally {
      setBusy(false);
    }
  }

  async function handleLocationPermissionAction() {
    if (permissionRecovery !== 'settings') {
      await useCurrentLocation();
      return;
    }
    try {
      await Linking.openSettings();
      setPermissionRecovery('retry');
    } catch {
      setMessage(t('locationUnavailable'));
    }
  }

  function moveMapInsideSaudiArabia() {
    mapRef.current?.animateToRegion(asRegion(RIYADH), 260);
    void resolvePoint(RIYADH);
  }

  function transientLocation() {
    if (!resolution || resolution.status !== 'supported') return null;
    if (formattedAddress.trim().length < 3) return null;
    return {
      savedAddressId: null,
      label: label.trim() || t('savedLabelOther'),
      formattedAddress: formattedAddress.trim(),
      building: building.trim() || null,
      unit: unit.trim() || null,
      accessNotes: accessNotes.trim() || null,
      cityCode: resolution.city.code,
      cityNameAr: resolution.city.nameAr,
      cityNameEn: resolution.city.nameEn,
      coordinates,
    };
  }

  function useTransientLocation() {
    const selected = transientLocation();
    if (!selected) {
      setMessage(t(serviceLocationStatusKey(resolution)));
      return;
    }
    location.selectTransientLocation(selected);
    onDone();
  }

  async function saveLocation() {
    const selected = transientLocation();
    if (!selected) {
      setMessage(t(serviceLocationStatusKey(resolution)));
      return;
    }
    setBusy(true);
    setMessage('');
    try {
      const payload = savedAddressInputSchema.parse({
        id: editingAddressId,
        label: selected.label,
        formattedAddress: selected.formattedAddress,
        building: building.trim(),
        unit: unit.trim(),
        accessNotes: accessNotes.trim(),
        cityCode: selected.cityCode,
        isDefault: makeDefault,
        coordinates,
      });
      await location.saveAddress(payload);
      closeEditor();
      setMessage(t('locationSaved'));
    } catch {
      setMessage(t('saveLocationFailed'));
    } finally {
      setBusy(false);
    }
  }

  async function selectSaved(addressId: string) {
    setMessage('');
    try {
      await location.selectSavedAddress(addressId);
      onDone();
    } catch {
      setMessage(t('savedAddressLoadFailed'));
    }
  }

  function archiveAddress(addressId: string) {
    Alert.alert(t('archiveAddressTitle'), t('archiveAddressBody'), [
      { text: t('cancel'), style: 'cancel' },
      {
        text: t('archiveAddress'),
        style: 'destructive',
        onPress: () => {
          void location
            .archiveAddress(addressId)
            .catch(() => setMessage(t('archiveAddressFailed')));
        },
      },
    ]);
  }

  if (!editorOpen) {
    return (
      <AppScreen testID="customer-location-picker">
        <AppHeader
          backLabel={t('back')}
          onBack={onDone}
          subtitle={t('locationPickerBody')}
          title={t('locationPickerTitle')}
        />
        {location.error ? <Toast message={t('savedAddressLoadFailed')} tone="warning" /> : null}
        <PrimaryButton icon="plus" label={t('addNewLocation')} onPress={() => startEditor(null)} />
        <View style={styles.section}>
          <SectionHeader title={t('savedLocations')} />
          {location.loading ? (
            <Text style={[customerStyles.caption, directionStyle]}>{t('loading')}</Text>
          ) : null}
          {location.addresses.map((address) => (
            <View key={address.id} style={styles.savedAddress}>
              <AddressCard
                address={address.formattedAddress}
                label={address.label}
                onPress={() => void selectSaved(address.id)}
                selected={location.activeLocation?.savedAddressId === address.id}
              />
              <View style={[styles.actionRow, dir === 'rtl' && styles.rowReverse]}>
                <GhostButton label={t('editLocation')} onPress={() => startEditor(address.id)} />
                {!address.isDefault ? (
                  <GhostButton
                    label={t('makeDefault')}
                    onPress={() =>
                      void location
                        .makeDefault(address.id)
                        .catch(() => setMessage(t('saveLocationFailed')))
                    }
                  />
                ) : null}
                <GhostButton
                  label={t('archiveAddress')}
                  onPress={() => archiveAddress(address.id)}
                />
              </View>
            </View>
          ))}
        </View>
        {message ? <Toast message={message} tone="warning" /> : null}
      </AppScreen>
    );
  }

  const locationStatus = resolution ? t(serviceLocationStatusKey(resolution)) : '';
  const resolvedCity =
    resolution?.status === 'supported'
      ? locale === 'ar' || locale === 'ur'
        ? resolution.city.nameAr
        : resolution.city.nameEn
      : '';
  const usable = Boolean(transientLocation());

  return (
    <AppScreen testID="customer-location-editor">
      <AppHeader
        backLabel={t('back')}
        onBack={closeEditor}
        subtitle={t('foregroundLocationReason')}
        title={editingAddressId ? t('editLocation') : t('addNewLocation')}
      />
      <LocationPermissionCard
        actionLabel={t(
          permissionRecovery === 'settings' ? 'openDeviceSettings' : 'useCurrentLocation',
        )}
        body={t('foregroundLocationReason')}
        onAction={() => void handleLocationPermissionAction()}
        title={t('locationPermissionTitle')}
      />

      {canRenderMap && !mapTimedOut ? (
        <View style={styles.mapShell}>
          <MapView
            accessibilityLabel={t('mapAccessibility')}
            initialRegion={asRegion(coordinates)}
            onMapReady={() => setMapReady(true)}
            onRegionChangeComplete={(region) => {
              const parsed = coordinatesSchema.safeParse({
                latitude: region.latitude,
                longitude: region.longitude,
              });
              if (parsed.success) {
                setCoordinates(parsed.data);
                debouncedResolver.schedule(parsed.data);
              }
            }}
            ref={mapRef}
            style={StyleSheet.absoluteFill}
          />
          <View pointerEvents="none" style={styles.pinCenter}>
            <MapPin label={t('mapPinHint')} />
          </View>
        </View>
      ) : (
        <Toast message={t('mapUnavailable')} tone="warning" />
      )}
      <Text style={[customerStyles.caption, directionStyle]}>{t('mapAdjustmentHint')}</Text>

      {locationStatus ? (
        <Toast
          message={resolvedCity ? `${locationStatus}: ${resolvedCity}` : locationStatus}
          tone={resolution?.status === 'supported' ? 'success' : 'warning'}
        />
      ) : null}
      {reverseGeocodeUnavailable ? (
        <Toast message={t('reverseGeocodeUnavailable')} tone="warning" />
      ) : null}
      {resolution?.status === 'outside_saudi_arabia' ? (
        <SecondaryButton label={t('chooseOnSaudiMap')} onPress={moveMapInsideSaudiArabia} />
      ) : null}

      <View style={styles.section}>
        <FormField
          label={t('addressLabel')}
          maxLength={80}
          onChangeText={setLabel}
          placeholder={t('addressLabelPlaceholder')}
          value={label}
        />
        <FormField
          label={t('formattedAddress')}
          maxLength={500}
          multiline
          onChangeText={setFormattedAddress}
          value={formattedAddress}
        />
        <View style={[styles.fieldRow, dir === 'rtl' && styles.rowReverse]}>
          <View style={styles.flex}>
            <FormField
              label={t('building')}
              maxLength={80}
              onChangeText={setBuilding}
              value={building}
            />
          </View>
          <View style={styles.flex}>
            <FormField label={t('unit')} maxLength={80} onChangeText={setUnit} value={unit} />
          </View>
        </View>
        <FormField
          label={t('accessNotes')}
          maxLength={500}
          multiline
          onChangeText={setAccessNotes}
          value={accessNotes}
        />
        {editingAddressId ? null : (
          <View style={[styles.defaultRow, dir === 'rtl' && styles.rowReverse]}>
            <Text style={[customerStyles.body, directionStyle]}>{t('makeDefault')}</Text>
            <Switch
              accessibilityLabel={t('makeDefault')}
              onValueChange={setMakeDefault}
              value={makeDefault}
            />
          </View>
        )}
      </View>

      {message ? <Toast message={message} tone="warning" /> : null}
      <PrimaryButton
        disabled={!usable || busy}
        label={t('useThisLocation')}
        onPress={useTransientLocation}
      />
      <SecondaryButton
        disabled={!usable || busy || !location.loaded}
        label={editingAddressId ? t('saveChanges') : t('saveThisLocation')}
        loading={busy}
        onPress={() => void saveLocation()}
      />
    </AppScreen>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  section: { gap: tokens.spacing.sm },
  savedAddress: { gap: tokens.spacing.xxs },
  actionRow: { flexDirection: 'row', flexWrap: 'wrap', gap: tokens.spacing.xs },
  mapShell: {
    height: 340,
    overflow: 'hidden',
    borderRadius: tokens.radius.xl,
    borderWidth: 1,
    borderColor: tokens.colors.border,
    backgroundColor: tokens.colors.surfaceMuted,
  },
  pinCenter: {
    position: 'absolute',
    top: '50%',
    left: '50%',
    marginStart: -24,
    marginTop: -48,
  },
  fieldRow: { flexDirection: 'row', gap: tokens.spacing.sm },
  defaultRow: {
    minHeight: tokens.touchTarget,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  rowReverse: { flexDirection: 'row-reverse' },
  rtl: { textAlign: 'right', writingDirection: 'rtl' },
  ltr: { textAlign: 'left', writingDirection: 'ltr' },
});
