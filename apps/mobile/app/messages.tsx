import { useEffect, useState } from 'react';
import { FlatList, Text, TextInput, View } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { z } from 'zod';
import { Button, Card, Screen, styles } from '@/components/ui';
import { supabase } from '@/lib/supabase';
import { useLocale } from '@/providers/locale-provider';
const messageSchema = z.object({
  id: z.uuid(),
  body: z.string(),
  sender_id: z.uuid(),
  created_at: z.string(),
});
type Message = z.infer<typeof messageSchema>;
export default function Messages() {
  const { locale, t } = useLocale();
  const { conversationId } = useLocalSearchParams<{ conversationId?: string }>();
  const [messages, setMessages] = useState<Message[]>([]);
  const [body, setBody] = useState('');
  const [error, setError] = useState('');
  useEffect(() => {
    if (!conversationId) return;
    void supabase
      .from('messages')
      .select('id,body,sender_id,created_at')
      .eq('conversation_id', conversationId)
      .order('created_at', { ascending: false })
      .limit(50)
      .then(({ data, error: queryError }) => {
        if (queryError) {
          setError(t('messagesLoadFailed'));
          return;
        }
        const parsed = z.array(messageSchema).safeParse(data ?? []);
        if (parsed.success) setMessages(parsed.data);
        else setError(t('messagesInvalid'));
      });
    const channel = supabase
      .channel(`conversation:${conversationId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'messages',
          filter: `conversation_id=eq.${conversationId}`,
        },
        ({ new: row }) => {
          const parsed = messageSchema.safeParse(row);
          if (parsed.success) setMessages((current) => [parsed.data, ...current]);
        },
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [conversationId, t]);
  async function send() {
    if (!conversationId || !body.trim()) return;
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      setError(t('signInToMessage'));
      return;
    }
    const { error: insertError } = await supabase
      .from('messages')
      .insert({ conversation_id: conversationId, sender_id: user.id, body: body.trim() });
    if (insertError) setError(t('messageSendFailed'));
    else setBody('');
  }
  return (
    <Screen>
      <Text style={styles.title}>{t('messages')}</Text>
      {!conversationId && (
        <Card>
          <Text style={styles.lead}>{t('messagesPrivacyNotice')}</Text>
        </Card>
      )}
      <FlatList
        data={messages}
        inverted
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => (
          <Card>
            <Text>{item.body}</Text>
            <Text style={styles.lead}>
              {new Date(item.created_at).toLocaleString(locale === 'ar' ? 'ar-SA' : locale)}
            </Text>
          </Card>
        )}
        ListEmptyComponent={<Text style={styles.lead}>{error || t('noMessages')}</Text>}
      />
      <View style={{ gap: 8 }}>
        <TextInput
          style={styles.input}
          value={body}
          onChangeText={setBody}
          maxLength={4000}
          placeholder={t('messagePlaceholder')}
        />
        <Button disabled={!conversationId} label={t('send')} onPress={() => void send()} />
      </View>
    </Screen>
  );
}
