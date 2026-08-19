import { View } from 'react-native';
import { ChatBubble } from '../../design-system/customer-components';
import type { ConversationMessage } from './conversation-state';

interface ConversationTimelineProps {
  messages: readonly ConversationMessage[];
  userLabel: string;
  assistantLabel: string;
  pendingLabel: string;
  retryLabel: string;
  offlineLabel: string;
  onRetry: (clientMessageId: string) => void;
}

export function ConversationTimeline({
  messages,
  userLabel,
  assistantLabel,
  pendingLabel,
  retryLabel,
  offlineLabel,
  onRetry,
}: ConversationTimelineProps) {
  return (
    <View accessibilityRole="list">
      {messages.map((message, index) => {
        const delivery = message.delivery ?? (message.authoritative ? 'sent' : undefined);
        const statusLabel =
          delivery === 'retryable'
            ? retryLabel
            : delivery === 'offline'
              ? offlineLabel
              : delivery === 'pending'
                ? pendingLabel
                : undefined;
        const clientMessageId = message.clientMessageId;
        const retry =
          message.role === 'user' && delivery === 'retryable' && clientMessageId
            ? () => onRetry(clientMessageId)
            : null;
        return (
          <ChatBubble
            key={
              clientMessageId ? `${message.role}-${clientMessageId}` : `${message.role}-${index}`
            }
            {...(delivery ? { delivery } : {})}
            label={message.role === 'assistant' ? assistantLabel : userLabel}
            message={message.text}
            {...(retry ? { onRetry: retry } : {})}
            pending={Boolean(message.temporary && message.role === 'assistant')}
            retryLabel={retryLabel}
            role={message.role === 'assistant' ? 'assistant' : 'customer'}
            {...(message.role === 'user' && statusLabel ? { statusLabel } : {})}
          />
        );
      })}
    </View>
  );
}
