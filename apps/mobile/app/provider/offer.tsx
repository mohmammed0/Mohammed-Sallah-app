import { Controller, useForm } from 'react-hook-form';
import { useState } from 'react';
import { ScrollView, Text, TextInput, View } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { z } from 'zod';
import { Button, Card, Screen, styles } from '@/components/ui';
import { MarketplaceApi } from '@sallah/api';
import { supabase } from '@/lib/supabase';
import { useLocale } from '@/providers/locale-provider';
import { executeJournaledMutation } from '@/lib/mutation-journal';

const offerFormSchema = z.object({
  amount: z.coerce.number().positive().max(1_000_000),
  visitFee: z.coerce.number().min(0).max(100_000),
  arrivalMinutes: z.coerce.number().int().min(5).max(10_080),
  durationMinutes: z.coerce.number().int().min(15).max(43_200),
  warrantyDays: z.coerce.number().int().min(0).max(3650),
  note: z.string().trim().max(2000),
});
type OfferForm = z.input<typeof offerFormSchema>;
const offerCommandSchema = z.object({
  requestId: z.uuid(),
  totalAmountMinor: z.number().int(),
  visitFeeMinor: z.number().int(),
  laborAmountMinor: z.number().int().nullable(),
  materialsIncluded: z.boolean(),
  materialsEstimateMinor: z.number().int().nullable(),
  estimatedArrivalMinutes: z.number().int(),
  estimatedDurationMinutes: z.number().int(),
  warrantyDays: z.number().int(),
  note: z.string(),
  expiresAt: z.string(),
  expectedRequestVersion: z.number().int(),
});

export default function ProviderOffer() {
  const { t } = useLocale();
  const params = useLocalSearchParams<{ requestId?: string; requestVersion?: string }>();
  const [materialsIncluded, setMaterialsIncluded] = useState(false);
  const [done, setDone] = useState(false);
  const { control, handleSubmit, setError, formState } = useForm<OfferForm>({
    defaultValues: {
      amount: '',
      visitFee: 0,
      arrivalMinutes: 60,
      durationMinutes: 120,
      warrantyDays: 30,
      note: '',
    },
  });
  async function submit(raw: OfferForm) {
    const parsed = offerFormSchema.safeParse(raw);
    if (!parsed.success || !params.requestId || !params.requestVersion) {
      setError('root', { message: t('providerOfferInvalid') });
      return;
    }
    try {
      const value = parsed.data;
      const commandPayload = {
        requestId: params.requestId,
        totalAmountMinor: Math.round(value.amount * 100),
        visitFeeMinor: Math.round(value.visitFee * 100),
        laborAmountMinor: null,
        materialsIncluded,
        materialsEstimateMinor: null,
        estimatedArrivalMinutes: value.arrivalMinutes,
        estimatedDurationMinutes: value.durationMinutes,
        warrantyDays: value.warrantyDays,
        note: value.note,
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
        expectedRequestVersion: Number(params.requestVersion),
      };
      const { data: userData } = await supabase.auth.getUser();
      if (!userData.user) throw new Error('AUTH_REQUIRED');
      await executeJournaledMutation({
        userId: userData.user.id,
        operation: 'submit_offer',
        entityKey: `${params.requestId}:${params.requestVersion}`,
        payload: commandPayload,
        execute: async (idempotencyKey, persistedPayload) =>
          new MarketplaceApi(supabase).submitOffer({
            ...offerCommandSchema.parse(persistedPayload),
            idempotencyKey,
          }),
      });
      setDone(true);
    } catch {
      setError('root', {
        message: t('providerOfferFailed'),
      });
    }
  }
  const fields: Array<{
    name: 'amount' | 'visitFee' | 'arrivalMinutes' | 'durationMinutes' | 'warrantyDays';
    label: string;
  }> = [
    { name: 'amount', label: t('totalPriceSar') },
    { name: 'visitFee', label: t('visitFeeSar') },
    { name: 'arrivalMinutes', label: t('arrivalMinutes') },
    { name: 'durationMinutes', label: t('workDurationMinutes') },
    { name: 'warrantyDays', label: t('warrantyDays') },
  ];
  return (
    <ScrollView contentContainerStyle={{ flexGrow: 1 }}>
      <Screen>
        <Text style={styles.title}>{t('privateSealedOfferTitle')}</Text>
        <Card>
          <Text style={styles.lead}>{t('privateSealedOfferNotice')}</Text>
        </Card>
        {fields.map((item) => (
          <Controller
            key={item.name}
            control={control}
            name={item.name}
            render={({ field }) => (
              <TextInput
                style={styles.input}
                accessibilityLabel={item.label}
                placeholder={item.label}
                keyboardType="decimal-pad"
                value={String(field.value)}
                onBlur={field.onBlur}
                onChangeText={field.onChange}
              />
            )}
          />
        ))}
        <View style={styles.row}>
          <Button
            label={materialsIncluded ? t('materialsIncluded') : t('materialsNotIncluded')}
            kind={materialsIncluded ? 'primary' : 'secondary'}
            onPress={() => setMaterialsIncluded((value) => !value)}
          />
        </View>
        <Controller
          control={control}
          name="note"
          render={({ field }) => (
            <TextInput
              style={[styles.input, { minHeight: 110, textAlignVertical: 'top' }]}
              multiline
              accessibilityLabel={t('offerNoteA11y')}
              placeholder={t('offerScopePlaceholder')}
              value={field.value}
              onBlur={field.onBlur}
              onChangeText={field.onChange}
            />
          )}
        />
        {formState.errors.root?.message && (
          <Text style={styles.error}>{formState.errors.root.message}</Text>
        )}
        {done && <Text>{t('offerSubmitted')}</Text>}
        <Button label={t('submitOfferAction')} onPress={() => void handleSubmit(submit)()} />
      </Screen>
    </ScrollView>
  );
}
