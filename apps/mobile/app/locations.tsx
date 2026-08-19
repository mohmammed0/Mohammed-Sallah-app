import { useMemo, useRef, useState } from 'react';
import { Alert, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
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
import {
  coordinatesSchema,
  RIYADH_NAME_AR,
  sanitizeReverseGeocode,
  savedAddressInputSchema,
  type Coordinates,
} from '@/features/location/location-model';
import { archiveMyAddress, saveMyAddress } from '@/features/location/location-service';
import { useCustomerLocation } from '@/features/location/location-provider';
import { useLocale } from '@/providers/locale-provider';

const RIYADH: Coordinates = { latitude: 24.7136, longitude: 46.6753 };
const MAP_DELTA = 0.035;

function asRegion(coordinates: Coordinates): Region {
  return {
    ...coordinates,
    latitudeDelta: MAP_DELTA,
    longitudeDelta: MAP_DELTA,
  };
}

export default function CustomerLocationsScreen() {
  const { t } = useLocale();
  const {
    addresses,
    activeLocation,
    loading,
    error: savedAddressError,
    refresh,
    selectSavedAddress,
    selectTransientLocation,
  } = useCustomerLocation();
  const initialCoordinates = activeLocation?.coordinates ?? RIYADH;
  const mapRef = useRef<MapView | null>(null);
  const [coordinates, setCoordinates] = useState<Coordinates>(initialCoordinates);
  const [formattedAddress, setFormattedAddress] = useState(activeLocation?.formattedAddress ?? '');
  const [label, setLabel] = useState(activeLocation?.label ?? t('savedLabelHome'));
  const [building, setBuilding] = useState(activeLocation?.building ?? '');
  const [unit, setUnit] = useState(activeLocation?.unit ?? '');
  const [accessNotes, setAccessNotes] = useState(activeLocation?.accessNotes ?? '');
  const [makeDefault, setMakeDefault] = useState(addresses.length === 0);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const initialRegion = useMemo(() => asRegion(initialCoordinates), [initialCoordinates]);

  function showCoordinates(next: Coordinates) {
    setCoordinates(next);
    mapRef.current?.animateToRegion(asRegion(next), 260);
  }

  async function resolveAddress(next: Coordinates): Promise<string> {
    const [result] = await Location.reverseGeocodeAsync(next);
    const resolved = sanitizeReverseGeocode(result);
    if (!resolved) throw new Error('REVERSE_GEOCODE_EMPTY');
    setFormattedAddress(resolved);
    return resolved;
  }

  async function useCurrentLocation() {
    setBusy(true);
    setMessage('');
    try {
      const permission = await Location.requestForegroundPermissionsAsync();
      if (!permission.granted) {
        setMessage(t('locationPermissionDenied'));
        return;
      }
      const lastKnown = await Location.getLastKnownPositionAsync({
        maxAge: 5 * 60 * 1000,
        requiredAccuracy: 1500,
      });
      const lastCoordinates = lastKnown
        ? coordinatesSchema.safeParse({
            latitude: lastKnown.coords.latitude,
            longitude: lastKnown.coords.longitude,
          })
        : null;
      if (lastCoordinates?.success) showCoordinates(lastCoordinates.data);
      const current = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.High,
      });
      const parsed = coordinatesSchema.parse({
        latitude: current.coords.latitude,
        longitude: current.coords.longitude,
      });
      showCoordinates(parsed);
      await resolveAddress(parsed);
    } catch {
      setMessage(t('reverseGeocodeFailed'));
    } finally {
      setBusy(false);
    }
  }

  async function resolveMapAddress() {
    setBusy(true);
    setMessage('');
    try {
      await resolveAddress(coordinates);
    } catch {
      setMessage(t('reverseGeocodeFailed'));
    } finally {
      setBusy(false);
    }
  }

  function useLocation() {
    setMessage('');
    try {
      const validCoordinates = coordinatesSchema.parse(coordinates);
      const address = formattedAddress.trim();
      if (address.length < 3) {
        setMessage(t('addressRequired'));
        return;
      }
      selectTransientLocation({
        savedAddressId: null,
        label: label.trim() || t('savedLabelOther'),
        formattedAddress: address,
        building: building.trim() || null,
        unit: unit.trim() || null,
        accessNotes: accessNotes.trim() || null,
        cityCode: activeLocation?.cityCode ?? 'riyadh',
        cityNameAr: activeLocation?.cityNameAr ?? RIYADH_NAME_AR,
        cityNameEn: activeLocation?.cityNameEn ?? 'Riyadh',
        coordinates: validCoordinates,
      });
      router.back();
    } catch {
      setMessage(t('locationRequired'));
    }
  }

  async function saveLocation() {
    setBusy(true);
    setMessage('');
    try {
      const payload = savedAddressInputSchema.parse({
        id: null,
        label,
        formattedAddress,
        building,
        unit,
        accessNotes,
        cityCode: activeLocation?.cityCode ?? 'riyadh',
        isDefault: makeDefault,
        coordinates,
      });
      const id = await saveMyAddress(payload);
      await refresh();
      await selectSavedAddress(id);
      router.back();
    } catch {
      setMessage(t('saveLocationFailed'));
    } finally {
      setBusy(false);
    }
  }

  async function chooseSaved(addressId: string) {
    try {
      await selectSavedAddress(addressId);
      router.back();
    } catch {
      setMessage(t('savedAddressLoadFailed'));
    }
  }

  function confirmArchive(addressId: string) {
    Alert.alert(t('archiveAddressTitle'), t('archiveAddressBody'), [
      { text: t('cancel'), style: 'cancel' },
      {
        text: t('archiveAddress'),
        style: 'destructive',
        onPress: () => {
          void (async () => {
            try {
              await archiveMyAddress(addressId);
              await refresh();
            } catch {
              setMessage(t('archiveAddressFailed'));
            }
          })();
        },
      },
    ]);
  }

  return (
    <AppScreen testID="customer-location-picker">
      <AppHeader
        backLabel={t('back')}
        onBack={() => router.back()}
        subtitle={t('locationPickerBody')}
        title={t('locationPickerTitle')}
      />

      <LocationPermissionCard
        actionLabel={t('useCurrentLocation')}
        body={t('foregroundLocationReason')}
        onAction={() => void useCurrentLocation()}
        title={t('locationPermissionTitle')}
      />

      {savedAddressError ? <Toast message={t('savedAddressLoadFailed')} tone="warning" /> : null}
      {addresses.length ? (
        <View style={styles.section}>
          <SectionHeader title={t('savedLocations')} />
          {addresses.map((address) => (
            <View key={address.id} style={styles.savedAddress}>
              <AddressCard
                address={address.formattedAddress}
                label={address.label}
                onPress={() => void chooseSaved(address.id)}
                selected={activeLocation?.savedAddressId === address.id}
              />
              <GhostButton label={t('archiveAddress')} onPress={() => confirmArchive(address.id)} />
            </View>
          ))}
        </View>
      ) : null}

      <View style={styles.mapShell}>
        <MapView
          accessibilityLabel={t('mapAccessibility')}
          initialRegion={initialRegion}
          onRegionChangeComplete={(region) => {
            const parsed = coordinatesSchema.safeParse({
              latitude: region.latitude,
              longitude: region.longitude,
            });
            if (parsed.success) setCoordinates(parsed.data);
          }}
          ref={mapRef}
          style={StyleSheet.absoluteFill}
        />
        <View pointerEvents="none" style={styles.pinCenter}>
          <MapPin label={t('mapPinHint')} />
        </View>
      </View>
      <Text style={customerStyles.caption}>{t('mapAdjustmentHint')}</Text>
      <SecondaryButton
        disabled={busy}
        label={t('resolveMapAddress')}
        loading={busy}
        onPress={() => void resolveMapAddress()}
      />

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
        <View style={styles.fieldRow}>
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
        <View style={styles.labelChoices}>
          {[t('savedLabelHome'), t('savedLabelWork'), t('savedLabelOther')].map((item) => (
            <SecondaryButton key={item} label={item} onPress={() => setLabel(item)} />
          ))}
        </View>
        <SecondaryButton
          label={makeDefault ? t('defaultAddressSelected') : t('makeDefault')}
          onPress={() => setMakeDefault((current) => !current)}
        />
      </View>

      {message ? <Toast message={message} tone="warning" /> : null}
      <PrimaryButton
        disabled={busy || loading}
        label={t('useThisLocation')}
        onPress={() => void useLocation()}
      />
      <SecondaryButton
        disabled={busy || loading}
        label={t('saveThisLocation')}
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
  labelChoices: { flexDirection: 'row', flexWrap: 'wrap', gap: tokens.spacing.xs },
});
