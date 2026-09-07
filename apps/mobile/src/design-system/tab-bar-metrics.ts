import { useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { customerTokens as tokens } from './tokens';

export function useTabBarMetrics() {
  const { bottom } = useSafeAreaInsets();
  const { fontScale } = useWindowDimensions();
  // Custom tab heights replace the navigator's inset-aware default height.
  // Preserve the designed content area, then reserve the system inset and larger label line.
  const labelGrowth = Math.ceil(tokens.type.caption.lineHeight * Math.max(0, fontScale - 1));
  return { height: 72 + bottom + labelGrowth, paddingBottom: bottom };
}
