export interface ConversationMessage {
  role: 'user' | 'assistant';
  text: string;
}

export interface PublishableRequestDraft {
  title: string;
  summary: string;
  categorySlug: string;
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
    draft.cityCode.length > 0 &&
    draft.approved
  );
}
