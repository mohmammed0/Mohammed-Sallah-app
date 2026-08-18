import { Controller, useForm } from 'react-hook-form';
import { useMutation, useQuery } from '@tanstack/react-query';
import { ScrollView, Text, TextInput } from 'react-native';
import { z } from 'zod';
import { Button, Card, Screen, styles } from '@/components/ui';
import { supabase } from '@/lib/supabase';
import { useLocale } from '@/providers/locale-provider';

const formSchema = z.object({
  subject: z.string().trim().min(5).max(200),
  body: z.string().trim().min(10).max(4000),
});
type SupportForm = z.infer<typeof formSchema>;
const caseSchema = z.object({
  id: z.uuid(),
  subject: z.string(),
  status: z.string(),
  created_at: z.string(),
});

export default function Support() {
  const { locale, t } = useLocale();
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
  const createCase = useMutation({
    mutationFn: async (input: SupportForm) => {
      const valid = formSchema.parse(input);
      const { data: userData } = await supabase.auth.getUser();
      if (!userData.user) throw new Error('AUTH_REQUIRED');
      const { data, error } = await supabase
        .from('support_cases')
        .insert({ opened_by: userData.user.id, topic: 'general', subject: valid.subject })
        .select('id')
        .single();
      if (error) throw error;
      const { error: messageError } = await supabase.from('support_case_messages').insert({
        case_id: data.id,
        sender_id: userData.user.id,
        body: valid.body,
        visible_to_user: true,
      });
      if (messageError) throw messageError;
      return data.id;
    },
    onSuccess: async () => {
      reset();
      await cases.refetch();
    },
    onError: () => setError('root', { message: t('supportOpenFailed') }),
  });
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
          <Text style={styles.error}>{formState.errors.root.message}</Text>
        )}
        <Button
          disabled={createCase.isPending}
          label={t('openSupportCase')}
          onPress={() => void handleSubmit((value) => createCase.mutate(value))()}
        />
        <Text style={styles.title}>{t('previousCases')}</Text>
        {cases.data?.map((item) => (
          <Card key={item.id}>
            <Text style={styles.badge}>{item.status}</Text>
            <Text>{item.subject}</Text>
            <Text style={styles.lead}>
              {new Date(item.created_at).toLocaleString(locale === 'ar' ? 'ar-SA' : locale)}
            </Text>
          </Card>
        ))}
        {cases.isError && <Text style={styles.error}>{t('supportCasesLoadFailed')}</Text>}
      </Screen>
    </ScrollView>
  );
}
