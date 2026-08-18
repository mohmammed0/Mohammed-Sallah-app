import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Text, View } from 'react-native';
import MapView, { Marker } from 'react-native-maps';
import { z } from 'zod';
import { Button, styles } from '@/components/ui';
import { supabase } from '@/lib/supabase';
import { useLocale } from '@/providers/locale-provider';

const locationSchema = z.object({
  destination: z.object({ latitude: z.number(), longitude: z.number() }),
  providerLocation: z
    .object({
      latitude: z.number(),
      longitude: z.number(),
      capturedAt: z.string(),
      expiresAt: z.string(),
    })
    .nullable(),
});

export function JobTrackingMap({ jobId }: { jobId: string }) {
  const { t } = useLocale();
  const [location, setLocation] = useState<z.infer<typeof locationSchema> | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const refresh = useCallback(async () => {
    setError(false);
    const response = await (
      supabase.rpc as unknown as (
        name: string,
        args: Record<string, unknown>,
      ) => Promise<{ data: unknown; error: unknown }>
    )('get_authorized_job_location', {
      p_job_id: jobId,
    });
    const parsed = locationSchema.safeParse(response.data);
    setLoading(false);
    if (response.error || !parsed.success) {
      setError(true);
      return;
    }
    setLocation(parsed.data);
  }, [jobId]);
  useEffect(() => {
    void refresh();
    const channel = supabase
      .channel(`job-location:${jobId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'job_location_updates',
          filter: `job_id=eq.${jobId}`,
        },
        () => void refresh(),
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [jobId, refresh]);
  if (loading) return <ActivityIndicator accessibilityLabel={t('loadingTrackingMap')} />;
  if (error || !location) {
    return <Button kind="secondary" label={t('retryTrackingMap')} onPress={() => void refresh()} />;
  }
  const focus = location.providerLocation ?? location.destination;
  return (
    <View style={{ gap: 8 }}>
      <MapView
        accessibilityLabel={t('jobTrackingMapA11y')}
        style={{ width: '100%', height: 240, borderRadius: 14 }}
        region={{
          latitude: focus.latitude,
          longitude: focus.longitude,
          latitudeDelta: 0.02,
          longitudeDelta: 0.02,
        }}
      >
        <Marker coordinate={location.destination} title={t('jobDestination')} />
        {location.providerLocation && (
          <Marker
            coordinate={location.providerLocation}
            title={t('providerCurrentLocation')}
            pinColor="#0B7A75"
          />
        )}
      </MapView>
      <Text accessibilityLiveRegion="polite" style={styles.lead}>
        {location.providerLocation
          ? t('trackingLocationUpdated', {
              time: new Date(location.providerLocation.capturedAt).toLocaleTimeString(),
            })
          : t('noProviderLocationUpdate')}
      </Text>
    </View>
  );
}
