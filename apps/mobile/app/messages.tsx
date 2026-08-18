import { useEffect, useState } from 'react';
import { FlatList, Text, TextInput, View } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { z } from 'zod';
import { Button, Card, Screen, styles } from '@/components/ui';
import { supabase } from '@/lib/supabase';
const messageSchema = z.object({
  id: z.uuid(),
  body: z.string(),
  sender_id: z.uuid(),
  created_at: z.string(),
});
type Message = z.infer<typeof messageSchema>;
export default function Messages() {
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
          setError('تعذر تحميل الرسائل.');
          return;
        }
        const parsed = z.array(messageSchema).safeParse(data ?? []);
        if (parsed.success) setMessages(parsed.data);
        else setError('تعذر التحقق من بيانات الرسائل.');
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
  }, [conversationId]);
  async function send() {
    if (!conversationId || !body.trim()) return;
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      setError('سجّل الدخول لإرسال رسالة.');
      return;
    }
    const { error: insertError } = await supabase
      .from('messages')
      .insert({ conversation_id: conversationId, sender_id: user.id, body: body.trim() });
    if (insertError) setError('تعذر الإرسال؛ العضوية في المحادثة مطلوبة.');
    else setBody('');
  }
  return (
    <Screen>
      <Text style={styles.title}>الرسائل</Text>
      {!conversationId && (
        <Card>
          <Text style={styles.lead}>
            تظهر المحادثة بعد اختيار مقدم الخدمة. لا تُكشف أرقام الهاتف أو العنوان في الطلبات غير
            المطابقة.
          </Text>
        </Card>
      )}
      <FlatList
        data={messages}
        inverted
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => (
          <Card>
            <Text>{item.body}</Text>
            <Text style={styles.lead}>{new Date(item.created_at).toLocaleString('ar-SA')}</Text>
          </Card>
        )}
        ListEmptyComponent={<Text style={styles.lead}>{error || 'لا توجد رسائل.'}</Text>}
      />
      <View style={{ gap: 8 }}>
        <TextInput
          style={styles.input}
          value={body}
          onChangeText={setBody}
          maxLength={4000}
          placeholder="اكتب رسالة…"
        />
        <Button disabled={!conversationId} label="إرسال" onPress={() => void send()} />
      </View>
    </Screen>
  );
}
