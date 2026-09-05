export interface ConversationMessage {
  role: 'user' | 'assistant';
  text: string;
  clientMessageId?: string | undefined;
  authoritative?: boolean | undefined;
  temporary?: boolean | undefined;
  mediaUploadIds?: string[] | undefined;
  delivery?: 'pending' | 'retryable' | 'offline' | 'sent' | undefined;
  inputKind?: 'text' | 'voice' | 'image' | undefined;
  transcriptStatus?: 'pending' | 'review' | 'retryable' | 'completed' | undefined;
}

export function upsertPendingCustomerMessage(
  history: readonly ConversationMessage[],
  input: {
    clientMessageId: string;
    text: string;
    offline: boolean;
    mediaUploadIds: string[];
    inputKind: 'text' | 'voice' | 'image';
  },
): ConversationMessage[] {
  if (history.some((message) => message.clientMessageId === input.clientMessageId)) {
    return [...history];
  }
  return [
    ...history,
    {
      role: 'user',
      text: input.text,
      clientMessageId: input.clientMessageId,
      authoritative: false,
      temporary: true,
      delivery: input.offline ? 'offline' : 'pending',
      mediaUploadIds: input.mediaUploadIds,
      inputKind: input.inputKind,
      transcriptStatus: input.inputKind === 'voice' ? 'pending' : undefined,
    },
  ];
}

export function markConversationMessageRetryable(
  history: readonly ConversationMessage[],
  clientMessageId: string,
): ConversationMessage[] {
  return history.map((message) =>
    message.role === 'user' && message.clientMessageId === clientMessageId
      ? {
          ...message,
          delivery: 'retryable' as const,
          temporary: true,
          transcriptStatus: message.inputKind === 'voice' ? ('retryable' as const) : undefined,
        }
      : message,
  );
}

export function updateConversationTranscript(
  history: readonly ConversationMessage[],
  clientMessageId: string,
  transcript: string,
  status: 'review' | 'completed',
): ConversationMessage[] {
  return history.map((message) =>
    message.role === 'user' &&
    message.clientMessageId === clientMessageId &&
    message.inputKind === 'voice'
      ? {
          ...message,
          text: transcript,
          delivery: 'pending' as const,
          temporary: true,
          transcriptStatus: status,
        }
      : message,
  );
}

export interface PublishableRequestDraft {
  title: string;
  summary: string;
  categorySlug: string;
  categoryConfirmedByUser: boolean;
  cityCode: string;
  coordinates: { latitude: number; longitude: number } | null;
  approved: boolean;
}

export function appendConversationTurn(
  history: readonly ConversationMessage[],
  userText: string,
  assistantText: string,
): ConversationMessage[] {
  return [...history, { role: 'user', text: userText }, { role: 'assistant', text: assistantText }];
}

export function conversationOriginalText(history: readonly ConversationMessage[]): string {
  return history
    .filter((message) => message.role === 'user')
    .map((message) => message.text)
    .join('\n');
}

export function canPublishRequest(draft: PublishableRequestDraft): boolean {
  return (
    draft.title.trim().length >= 3 &&
    draft.summary.trim().length >= 10 &&
    draft.coordinates !== null &&
    draft.categorySlug.length > 0 &&
    draft.categoryConfirmedByUser &&
    draft.cityCode.length > 0 &&
    draft.approved
  );
}

export function categorySelectionSource(
  selectedCategorySlug: string,
  suggestedCategorySlug: string | null,
): 'manual' | 'ai_suggestion' | 'customer_correction' {
  if (!suggestedCategorySlug) return 'manual';
  return selectedCategorySlug === suggestedCategorySlug ? 'ai_suggestion' : 'customer_correction';
}
