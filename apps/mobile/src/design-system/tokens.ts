import { branding } from '@sallah/config/branding';

export const customerTokens = {
  colors: {
    canvas: '#F7F8F5',
    surface: branding.colors.white,
    surfaceMuted: '#EEF4F1',
    ink: branding.colors.ink,
    textMuted: '#5D706D',
    primary: branding.colors.primary,
    primaryStrong: branding.colors.primaryStrong,
    primarySoft: '#DFF2EE',
    accent: branding.colors.saffron,
    accentSoft: '#FFF2D8',
    border: '#D9E3DF',
    borderStrong: '#B5C7C2',
    danger: branding.colors.danger,
    dangerSoft: '#FDECEA',
    success: branding.colors.success,
    successSoft: '#E4F6EF',
    warning: '#9A5B05',
    warningSoft: '#FFF4DB',
    overlay: 'rgba(16, 42, 42, 0.42)',
    white: branding.colors.white,
  },
  spacing: { xxs: 4, xs: 8, sm: 12, md: 16, lg: 20, xl: 24, xxl: 32 },
  radius: { sm: 10, md: 16, lg: 22, xl: 30, pill: 999 },
  type: {
    display: { fontSize: 30, lineHeight: 38, fontWeight: '900' as const },
    title: { fontSize: 22, lineHeight: 30, fontWeight: '900' as const },
    section: { fontSize: 18, lineHeight: 25, fontWeight: '800' as const },
    body: { fontSize: 16, lineHeight: 25, fontWeight: '500' as const },
    label: { fontSize: 14, lineHeight: 20, fontWeight: '800' as const },
    caption: { fontSize: 12, lineHeight: 18, fontWeight: '600' as const },
  },
  shadow: {
    card: {
      shadowColor: '#102A2A',
      shadowOpacity: 0.07,
      shadowRadius: 12,
      shadowOffset: { width: 0, height: 5 },
      elevation: 2,
    },
  },
  touchTarget: 48,
} as const;

export type CustomerColor = keyof typeof customerTokens.colors;
