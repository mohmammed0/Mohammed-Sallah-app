import { useEffect, useState } from 'react';
import { FlatList, Image, Text, TextInput, View } from 'react-native';
import { Link, useLocalSearchParams } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import { z } from 'zod';
import { Button, Card, Screen, styles } from '@/components/ui';
import { supabase } from '@/lib/supabase';
import { useLocale } from '@/providers/locale-provider';
import { secureUpload, type CleanUpload } from '@/lib/secure-upload';
const attachmentSchema = z.object({
  id: z.uuid(),
  file_upload_id: z.uuid(),
  mime_type: z.string(),
  size_bytes: z.number(),
});
const messageSchema = z.object({
  id: z.uuid(),
  body: z.string(),
  sender_id: z.uuid(),
  created_at: z.string(),
  message_attachments: z.array(attachmentSchema).default([]),
});
type Message = z.infer<typeof messageSchema>;
const conversationSchema = z.object({
  id: z.uuid(),
  job_id: z.uuid(),
  created_at: z.string(),
});
export default function Messages() {
  const { locale, t } = useLocale();
  const { conversationId } = useLocalSearchParams<{ conversationId?: string }>();
  const [messages, setMessages] = useState<Message[]>([]);
  const [body, setBody] = useState('');
  const [error, setError] = useState('');
  const [attachment, setAttachment] = useState<CleanUpload | null>(null);
  const [mediaUrls, setMediaUrls] = useState<Record<string, string>>({});
  const [conversations, setConversations] = useState<z.infer<typeof conversationSchema>[]>([]);
  async function loadSignedUrl(uploadId: string) {
    const response = await supabase.functions.invoke('media-access', {
      body: { uploadId, expiresInSeconds: 300 },
    });
    const parsed = z.object({ signedUrl: z.string().url() }).safeParse(response.data);
    if (!response.error && parsed.success) {
      setMediaUrls((current) => ({ ...current, [uploadId]: parsed.data.signedUrl }));
    }
  }
  useEffect(() => {
    if (conversationId) return;
    void supabase
      .from('conversations')
      .select('id,job_id,created_at')
      .order('created_at', { ascending: false })
      .limit(50)
      .then(({ data, error: queryError }) => {
        const parsed = z.array(conversationSchema).safeParse(data ?? []);
        if (queryError || !parsed.success) setError(t('messagesLoadFailed'));
        else setConversations(parsed.data);
      });
  }, [conversationId, t]);
  useEffect(() => {
    if (!conversationId) return;
    void supabase
      .from('messages')
      .select(
        'id,body,sender_id,created_at,message_attachments(id,file_upload_id,mime_type,size_bytes)',
      )
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
  useEffect(() => {
    for (const message of messages) {
      for (const item of message.message_attachments) {
        if (!mediaUrls[item.file_upload_id]) void loadSignedUrl(item.file_upload_id);
      }
    }
  }, [messages, mediaUrls]);
  async function pickAttachment() {
    if (!conversationId) return;
    const selected = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      quality: 0.75,
      exif: false,
    });
    if (selected.canceled) return;
    const asset = selected.assets[0];
    if (!asset) return;
    try {
      const response = await fetch(asset.uri);
      if (!response.ok) throw new Error('LOCAL_MEDIA_READ_FAILED');
      const bytes = new Uint8Array(await response.arrayBuffer());
      const uploaded = await secureUpload({
        bytes,
        filename: asset.fileName ?? `${globalThis.crypto.randomUUID()}.jpg`,
        mimeType: asset.mimeType ?? 'image/jpeg',
        purpose: 'message_attachment',
        resourceId: conversationId,
      });
      setAttachment(uploaded);
    } catch {
      setError(t('messageAttachmentFailed'));
    }
  }
  async function send() {
    if (!conversationId || (!body.trim() && !attachment)) return;
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      setError(t('signInToMessage'));
      return;
    }
    const response = await (
      supabase.rpc as unknown as (
        name: string,
        args: Record<string, unknown>,
      ) => Promise<{ error: unknown }>
    )('send_message_with_attachments', {
      p_conversation_id: conversationId,
      p_body: body.trim(),
      p_upload_ids: attachment ? [attachment.uploadId] : [],
      p_client_message_id: globalThis.crypto.randomUUID(),
    });
    const insertError = response.error;
    if (insertError) setError(t('messageSendFailed'));
    else {
      setBody('');
      setAttachment(null);
    }
  }
  return (
    <Screen>
      <Text style={styles.title}>{t('messages')}</Text>
      {!conversationId && (
        <View style={{ gap: 10 }}>
          <Card>
            <Text style={styles.lead}>{t('messagesPrivacyNotice')}</Text>
          </Card>
          {conversations.map((conversation) => (
            <Link
              key={conversation.id}
              href={{
                pathname: '/messages',
                params: { conversationId: conversation.id },
              }}
              asChild
            >
              <Button
                kind="secondary"
                label={t('conversationWithJob', {
                  id: conversation.job_id.slice(0, 8),
                })}
              />
            </Link>
          ))}
          {!conversations.length && (
            <Text style={styles.lead}>{error || t('noConversations')}</Text>
          )}
        </View>
      )}
      {conversationId && (
        <FlatList
          data={messages}
          inverted
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => (
            <Card>
              <Text>{item.body}</Text>
              {item.message_attachments.map((file) => (
                <View key={file.id}>
                  {mediaUrls[file.file_upload_id] ? (
                    <Image
                      source={{ uri: mediaUrls[file.file_upload_id] }}
                      accessibilityLabel={t('messageAttachmentA11y')}
                      style={{ width: '100%', height: 180, borderRadius: 12 }}
                    />
                  ) : (
                    <Button
                      kind="secondary"
                      label={t('loadAttachment')}
                      onPress={() => void loadSignedUrl(file.file_upload_id)}
                    />
                  )}
                </View>
              ))}
              <Text style={styles.lead}>
                {new Date(item.created_at).toLocaleString(locale === 'ar' ? 'ar-SA' : locale)}
              </Text>
            </Card>
          )}
          ListEmptyComponent={<Text style={styles.lead}>{error || t('noMessages')}</Text>}
        />
      )}
      {conversationId && (
        <View style={{ gap: 8 }}>
          <TextInput
            style={styles.input}
            value={body}
            onChangeText={setBody}
            maxLength={4000}
            placeholder={t('messagePlaceholder')}
          />
          <Button
            disabled={!conversationId}
            kind="secondary"
            label={attachment ? t('attachmentReady') : t('addAttachment')}
            onPress={() => void pickAttachment()}
          />
          <Button disabled={!conversationId} label={t('send')} onPress={() => void send()} />
        </View>
      )}
    </Screen>
  );
}
