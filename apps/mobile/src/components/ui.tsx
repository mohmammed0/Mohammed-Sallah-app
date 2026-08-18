import { Pressable, StyleSheet, Text, View, type PressableProps } from 'react-native';
import { theme } from '@/theme';
export function Screen({ children }: { children: React.ReactNode }) {
  return <View style={styles.screen}>{children}</View>;
}
export function Card({ children }: { children: React.ReactNode }) {
  return <View style={styles.card}>{children}</View>;
}
export function Button({
  label,
  kind = 'primary',
  ...props
}: PressableProps & { label: string; kind?: 'primary' | 'secondary' | 'danger' }) {
  return (
    <Pressable
      accessibilityRole="button"
      style={({ pressed }) => [
        styles.button,
        kind === 'secondary' && styles.secondary,
        kind === 'danger' && styles.danger,
        pressed && styles.pressed,
      ]}
      {...props}
    >
      <Text style={[styles.buttonText, kind === 'secondary' && styles.secondaryText]}>{label}</Text>
    </Pressable>
  );
}
export const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: theme.colors.sand, padding: 20, gap: 16 },
  card: {
    backgroundColor: theme.colors.white,
    borderRadius: theme.radius.lg,
    padding: 18,
    gap: 12,
    borderWidth: 1,
    borderColor: '#DCE6E2',
  },
  button: {
    minHeight: 50,
    borderRadius: 14,
    paddingHorizontal: 18,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: theme.colors.primary,
  },
  secondary: {
    backgroundColor: theme.colors.white,
    borderWidth: 1,
    borderColor: theme.colors.primary,
  },
  danger: { backgroundColor: theme.colors.danger },
  pressed: { opacity: 0.78 },
  buttonText: { color: 'white', fontWeight: '800', fontSize: 16 },
  secondaryText: { color: theme.colors.primaryStrong },
  title: { fontSize: 28, fontWeight: '900', color: theme.colors.ink, textAlign: 'left' },
  lead: { fontSize: 16, color: '#526765', lineHeight: 25, textAlign: 'left' },
  input: {
    minHeight: 52,
    borderWidth: 1,
    borderColor: '#B7C8C4',
    backgroundColor: 'white',
    borderRadius: 12,
    padding: 13,
    textAlign: 'left',
  },
  row: { flexDirection: 'row', gap: 10, flexWrap: 'wrap' },
  badge: {
    alignSelf: 'flex-start',
    paddingVertical: 5,
    paddingHorizontal: 10,
    borderRadius: 99,
    backgroundColor: '#E7F5F2',
    color: theme.colors.primaryStrong,
    fontWeight: '800',
  },
  error: { color: theme.colors.danger, textAlign: 'left' },
});
