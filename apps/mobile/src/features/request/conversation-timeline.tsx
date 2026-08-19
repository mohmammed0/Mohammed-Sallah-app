import { StyleSheet, Text, View } from 'react-native';
import { AppIcon } from '../../design-system/icon';
import { customerTokens as tokens } from '../../design-system/tokens';
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
    <View accessibilityRole="list" style={styles.timeline}>
      {messages.map((message, index) => {
        const assistant = message.role === 'assistant';
        return (
          <View
            accessibilityLabel={`${assistant ? assistantLabel : userLabel}: ${message.text}`}
            accessibilityRole="text"
            key={message.clientMessageId ?? `${message.role}-${index}`}
            style={[styles.row, assistant ? styles.assistantRow : styles.userRow]}
          >
            {assistant ? (
              <View style={styles.avatar}>
                <AppIcon color={tokens.colors.primaryStrong} name="sparkles" size={17} />
              </View>
            ) : null}
            <View style={[styles.bubble, assistant ? styles.assistantBubble : styles.userBubble]}>
              <Text style={[styles.label, !assistant && styles.userLabel]}>
                {assistant ? assistantLabel : userLabel}
              </Text>
              <Text style={[styles.message, !assistant && styles.userMessage]}>{message.text}</Text>
              {message.temporary ? <Text style={styles.temporary}>•••</Text> : null}
            </View>
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  timeline: { gap: tokens.spacing.sm },
  row: { flexDirection: 'row', alignItems: 'flex-end', gap: tokens.spacing.xs },
  assistantRow: { justifyContent: 'flex-start' },
  userRow: { justifyContent: 'flex-end' },
  avatar: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: tokens.colors.primarySoft,
  },
  bubble: {
    maxWidth: '82%',
    borderRadius: tokens.radius.lg,
    paddingHorizontal: tokens.spacing.md,
    paddingVertical: tokens.spacing.sm,
    gap: tokens.spacing.xxs,
  },
  assistantBubble: {
    backgroundColor: tokens.colors.surface,
    borderBottomStartRadius: tokens.radius.sm,
    borderWidth: 1,
    borderColor: tokens.colors.border,
  },
  userBubble: {
    backgroundColor: tokens.colors.primary,
    borderBottomEndRadius: tokens.radius.sm,
  },
  label: { ...tokens.type.caption, color: tokens.colors.primaryStrong, textAlign: 'left' },
  userLabel: { color: tokens.colors.primarySoft },
  message: { ...tokens.type.body, color: tokens.colors.ink, textAlign: 'left' },
  userMessage: { color: tokens.colors.white },
  temporary: { color: tokens.colors.textMuted, fontWeight: '900' },
});
