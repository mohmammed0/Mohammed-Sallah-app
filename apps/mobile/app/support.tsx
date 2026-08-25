import { useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { useMutation, useQuery } from '@tanstack/react-query';
import { ScrollView, Text, TextInput } from 'react-native';
import { z } from 'zod';
import { formatStatusLabel, type TranslationKey } from '@sallah/i18n';
import { Button, Card, LoadingSkeleton, Screen, styles } from '@/components/ui';
import { supabase } from '@/lib/supabase';
import { useLocale } from '@/providers/locale-provider';
import { executeJournaledMutation } from '@/lib/mutation-journal';
import {
  openSupportCaseCommand,
  supportCaseInputSchema,
  type SupportRpc,
} from '@/features/support/open-support-case';
import {
  canReplyToSupportCase,
  parseSupportMessages,
  sendSupportCaseMessageCommand,
  supportCaseStatusSchema,
  type SupportMessageRpc,
} from '@/features/support/support-conversation';

type SupportForm = z.infer<typeof supportCaseInputSchema>;
const caseSchema = z.object({
  id: z.uuid(),
  subject: z.string(),
  status: supportCaseStatusSchema,
  created_at: z.string(),
});

export default function Support() {
  const { locale, t } = useLocale();
  const [selectedCaseId, setSelectedCaseId] = useState<string | null>(null);
  const [replyBody, setReplyBody] = useState('');
  const [replyErrorKey, setReplyErrorKey] = useState<TranslationKey | null>(null);
  const { control, handleSubmit, reset, setError, formState } = useForm<SupportForm>({
    defaultValues: { subject: '', body: '' },
  });
  const cases = useQuery({
    queryKey: ['support-cases'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('support_cases')
        .select('id,subject,status,created_at')
        .order('created_at', { ascending: false })
        .limit(20);
      if (error) throw error;
      return z.array(caseSchema).parse(data ?? []);
    },
  });
  const messages = useQuery({
    queryKey: ['support-messages', selectedCaseId],
    enabled: selectedCaseId !== null,
    queryFn: async () => {
      if (!selectedCaseId) return [];
      const { data, error } = await supabase
        .from('support_case_messages')
        .select('id,case_id,body,visible_to_user,created_at')
        .eq('case_id', selectedCaseId)
        .eq('visible_to_user', true)
        .order('created_at', { ascending: false })
        .order('id', { ascending: false })
        .limit(50);
      if (error) throw new Error('SUPPORT_MESSAGES_UNAVAILABLE');
      return parseSupportMessages(data ?? [], selectedCaseId);
    },
  });
  const createCase = useMutation({
    mutationFn: async (input: SupportForm) => {
      const valid = supportCaseInputSchema.parse(input);
      const { data: userData } = await supabase.auth.getUser();
      if (!userData.user) throw new Error('AUTH_REQUIRED');
      return executeJournaledMutation({
        userId: userData.user.id,
        operation: 'support_case',
        entityKey: `general:${valid.subject}`,
        payload: valid,
        execute: (idempotencyKey, persistedPayload) =>
          openSupportCaseCommand(
            supabase as unknown as SupportRpc,
            persistedPayload,
            idempotencyKey,
          ),
      });
    },
    onSuccess: async () => {
      reset();
      await cases.refetch();
    },
    onError: () => setError('root', { message: t('supportOpenFailed') }),
  });
  const sendReply = useMutation({
    mutationFn: async (input: { caseId: string; body: string }) => {
      const { data: userData } = await supabase.auth.getUser();
      if (!userData.user) throw new Error('AUTH_REQUIRED');
      return executeJournaledMutation({
        userId: userData.user.id,
        operation: 'support_case',
        entityKey: `message:${input.caseId}`,
        payload: input,
        execute: (idempotencyKey, persistedPayload) =>
          sendSupportCaseMessageCommand(
            supabase as unknown as SupportMessageRpc,
            persistedPayload,
            idempotencyKey,
          ),
      });
    },
    onSuccess: async () => {
      setReplyBody('');
      setReplyErrorKey(null);
      await Promise.all([messages.refetch(), cases.refetch()]);
    },
    onError: (error) => {
      setReplyErrorKey(
        error instanceof Error && error.message === 'SUPPORT_MESSAGE_NETWORK_UNAVAILABLE'
          ? 'messageOffline'
          : 'supportReplyFailed',
      );
    },
  });
  const selectedCase = cases.data?.find((item) => item.id === selectedCaseId) ?? null;
  const canReply = selectedCase ? canReplyToSupportCase(selectedCase.status) : false;
  return (
    <ScrollView contentContainerStyle={{ flexGrow: 1 }}>
      <Screen>
        <Text style={styles.title}>{t('supportCenter')}</Text>
        <Controller
          control={control}
          name="subject"
          render={({ field }) => (
            <TextInput
              accessibilityLabel={t('supportSubjectA11y')}
              style={styles.input}
              placeholder={t('supportSubjectPlaceholder')}
              value={field.value}
              onBlur={field.onBlur}
              onChangeText={field.onChange}
            />
          )}
        />
        <Controller
          control={control}
          name="body"
          render={({ field }) => (
            <TextInput
              accessibilityLabel={t('supportDetailsA11y')}
              style={[styles.input, { minHeight: 110, textAlignVertical: 'top' }]}
              multiline
              placeholder={t('supportDetailsPlaceholder')}
              value={field.value}
              onBlur={field.onBlur}
              onChangeText={field.onChange}
            />
          )}
        />
        {formState.errors.root?.message && (
          <Text accessibilityRole="alert" style={styles.error}>
            {formState.errors.root.message}
          </Text>
        )}
        <Button
          disabled={createCase.isPending}
          label={t('openSupportCase')}
          onPress={() => void handleSubmit((value) => createCase.mutate(value))()}
        />
        <Text style={styles.title}>{t('previousCases')}</Text>
        {cases.isPending && <LoadingSkeleton label={t('loading')} />}
        {cases.data?.map((item) => (
          <Card key={item.id}>
            <Text style={styles.badge}>{formatStatusLabel(item.status, locale)}</Text>
            <Text>{item.subject}</Text>
            <Text style={styles.lead}>
              {new Date(item.created_at).toLocaleString(locale === 'ar' ? 'ar-SA' : locale)}
            </Text>
            <Button
              kind="secondary"
              label={t('messages')}
              onPress={() => {
                setReplyBody('');
                setReplyErrorKey(null);
                setSelectedCaseId(item.id);
              }}
            />
          </Card>
        ))}
        {cases.isError && (
          <Card>
            <Text accessibilityRole="alert" style={styles.error}>
              {t('supportCasesLoadFailed')}
            </Text>
            <Button kind="secondary" label={t('retry')} onPress={() => void cases.refetch()} />
          </Card>
        )}
        {!cases.isPending && !cases.isError && cases.data?.length === 0 && (
          <Text style={styles.lead}>{t('empty')}</Text>
        )}
        {selectedCase && (
          <Card>
            <Text style={styles.title}>{t('messages')}</Text>
            <Text style={styles.badge}>{formatStatusLabel(selectedCase.status, locale)}</Text>
            {messages.isPending && <LoadingSkeleton label={t('loading')} />}
            {messages.isError && (
              <Card>
                <Text accessibilityRole="alert" style={styles.error}>
                  {t('messagesLoadFailed')}
                </Text>
                <Button
                  kind="secondary"
                  label={t('retry')}
                  onPress={() => void messages.refetch()}
                />
              </Card>
            )}
            {!messages.isPending && !messages.isError && messages.data?.length === 0 && (
              <Text style={styles.lead}>{t('noMessages')}</Text>
            )}
            {messages.data?.map((message) => (
              <Card key={message.id}>
                <Text>{message.body}</Text>
                <Text style={styles.lead}>
                  {new Date(message.created_at).toLocaleString(locale === 'ar' ? 'ar-SA' : locale)}
                </Text>
              </Card>
            ))}
            {canReply && (
              <>
                <TextInput
                  accessibilityLabel={t('messagePlaceholder')}
                  style={[styles.input, { minHeight: 96, textAlignVertical: 'top' }]}
                  multiline
                  maxLength={4000}
                  placeholder={t('messagePlaceholder')}
                  value={replyBody}
                  onChangeText={(value) => {
                    setReplyBody(value);
                    setReplyErrorKey(null);
                  }}
                />
                {replyErrorKey && (
                  <Text accessibilityRole="alert" style={styles.error}>
                    {t(replyErrorKey)}
                  </Text>
                )}
                <Button
                  disabled={sendReply.isPending || replyBody.trim().length === 0}
                  label={sendReply.isPending ? t('messagePending') : t('send')}
                  onPress={() => {
                    if (!selectedCaseId || replyBody.trim().length === 0) return;
                    sendReply.mutate({ caseId: selectedCaseId, body: replyBody });
                  }}
                />
              </>
            )}
          </Card>
        )}
      </Screen>
    </ScrollView>
  );
}
