import { Text, View } from 'react-native';
import type { ConversationMessage } from './conversation-state';

interface ConversationTimelineProps {
  messages: readonly ConversationMessage[];
  userLabel: string;
  assistantLabel: string;
}

export function ConversationTimeline({
  messages,
  userLabel,
  assistantLabel,
}: ConversationTimelineProps) {
  return (
    <View accessibilityRole="list">
      {messages.map((message, index) => (
        <View
          accessibilityLabel={`${message.role === 'user' ? userLabel : assistantLabel}: ${message.text}`}
          accessibilityRole="text"
          key={`${message.role}-${index}`}
          style={{ backgroundColor: '#FFFFFF', borderRadius: 16, marginBottom: 10, padding: 14 }}
        >
          <Text style={{ color: '#7A3E12', fontWeight: '700' }}>
            {message.role === 'user' ? userLabel : assistantLabel}
          </Text>
          <Text style={{ color: '#1B1B1B', marginTop: 6 }}>{message.text}</Text>
        </View>
      ))}
    </View>
  );
}
