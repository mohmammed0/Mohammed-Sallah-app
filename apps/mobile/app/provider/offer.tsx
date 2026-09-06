import { Controller, useForm } from 'react-hook-form';
import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { z } from 'zod';
import {
  ActionButton,
  CustomerScreen,
  Field,
  InteractivePressable,
  Notice,
  Surface,
  customerStyles,
} from '@/design-system/primitives';
import { AppIcon } from '@/design-system/icon';
import { customerTokens as tokens } from '@/design-system/tokens';
import {
  logicalFlexDirection,
  logicalTextAlignment,
  logicalWritingDirection,
} from '@/design-system/rtl';
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
  const { locale, t } = useLocale();
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
        expectedRequestVersion: Number(params.requestVersion),
      };
      const { data: userData } = await supabase.auth.getUser();
      if (!userData.user) throw new Error('AUTH_REQUIRED');
      await executeJournaledMutation({
        userId: userData.user.id,
        operation: 'submit_offer',
        entityKey: `${params.requestId}:${params.requestVersion}`,
        payload: commandPayload,
        expiresInMs: 24 * 60 * 60 * 1000,
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
    <CustomerScreen>
      <Text accessibilityRole="header" style={customerStyles.title}>
        {t('privateSealedOfferTitle')}
      </Text>
      <Notice>{t('privateSealedOfferNotice')}</Notice>
      <Surface>
        {fields.map((item) => (
          <Controller
            key={item.name}
            control={control}
            name={item.name}
            render={({ field }) => (
              <Field
                label={item.label}
                placeholder={item.label}
                keyboardType={
                  item.name === 'amount' || item.name === 'visitFee' ? 'decimal-pad' : 'number-pad'
                }
                value={String(field.value)}
                onBlur={field.onBlur}
                onChangeText={field.onChange}
              />
            )}
          />
        ))}
      </Surface>
      <Surface>
        <InteractivePressable
          accessibilityLabel={t('materialsIncluded')}
          accessibilityRole="checkbox"
          accessibilityState={{ checked: materialsIncluded }}
          onPress={() => setMaterialsIncluded((value) => !value)}
          style={[styles.materialsChoice, { flexDirection: logicalFlexDirection(locale) }]}
        >
          <View style={[styles.checkbox, materialsIncluded && styles.checkboxSelected]}>
            {materialsIncluded ? (
              <AppIcon color={tokens.colors.white} name="check" size={18} />
            ) : null}
          </View>
          <Text
            style={[
              styles.materialsLabel,
              {
                textAlign: logicalTextAlignment(locale),
                writingDirection: logicalWritingDirection(locale),
              },
            ]}
          >
            {t('materialsIncluded')}
          </Text>
        </InteractivePressable>
        <Controller
          control={control}
          name="note"
          render={({ field }) => (
            <Field
              label={t('offerScopePlaceholder')}
              style={{ minHeight: 110, textAlignVertical: 'top' }}
              multiline
              maxLength={2000}
              accessibilityLabel={t('offerNoteA11y')}
              placeholder={t('offerScopePlaceholder')}
              value={field.value}
              onBlur={field.onBlur}
              onChangeText={field.onChange}
            />
          )}
        />
      </Surface>
      {formState.errors.root?.message && (
        <Notice tone="danger" live>
          {formState.errors.root.message}
        </Notice>
      )}
      {done && (
        <Notice tone="success" live>
          {t('offerSubmitted')}
        </Notice>
      )}
      <ActionButton
        disabled={formState.isSubmitting || done}
        label={formState.isSubmitting ? t('loading') : t('submitOfferAction')}
        loading={formState.isSubmitting}
        onPress={() => void handleSubmit(submit)()}
      />
      {done ? (
        <ActionButton
          label={t('eligibleRequests')}
          onPress={() => router.replace('/provider-feed')}
          variant="secondary"
        />
      ) : null}
    </CustomerScreen>
  );
}

const styles = StyleSheet.create({
  materialsChoice: { minHeight: tokens.touchTarget, alignItems: 'center', gap: tokens.spacing.sm },
  materialsLabel: { ...tokens.type.label, color: tokens.colors.ink, flexGrow: 1, flexShrink: 1 },
  checkbox: {
    width: 24,
    height: 24,
    borderRadius: 6,
    borderWidth: 2,
    borderColor: tokens.colors.textMuted,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkboxSelected: { backgroundColor: tokens.colors.primary, borderColor: tokens.colors.primary },
});
