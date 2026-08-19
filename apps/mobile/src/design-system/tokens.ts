import { branding } from '@sallah/config/branding';

const lightColors = {
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
} as const;

const darkColors = {
  canvas: '#0D1918',
  surface: '#142321',
  surfaceMuted: '#1C302D',
  ink: '#F3F8F6',
  textMuted: '#AFC1BC',
  primary: '#58B8A4',
  primaryStrong: '#82D8C7',
  primarySoft: '#183D36',
  accent: '#F0B84F',
  accentSoft: '#3A2C13',
  border: '#29423D',
  borderStrong: '#3C5A53',
  danger: '#FF8F86',
  dangerSoft: '#3D211F',
  success: '#73D5AD',
  successSoft: '#173A2E',
  warning: '#F2BF66',
  warningSoft: '#3B2D16',
  overlay: 'rgba(0, 0, 0, 0.62)',
  white: '#FFFFFF',
} as const;

export const customerColorSchemes = {
  light: lightColors,
  dark: darkColors,
} as const;

export const customerTokens = {
  colors: lightColors,
  colorSchemes: customerColorSchemes,
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
  iconSize: { sm: 16, md: 22, lg: 28, xl: 36 },
  motion: { fast: 120, standard: 200, slow: 320 },
  stateOpacity: { disabled: 0.48, pressed: 0.72, focused: 1 },
  focusRing: { width: 3, color: '#2E8C7A' },
  shadow: {
    card: {
      shadowColor: '#102A2A',
      shadowOpacity: 0.07,
      shadowRadius: 12,
      shadowOffset: { width: 0, height: 5 },
      elevation: 2,
    },
    floating: {
      shadowColor: '#102A2A',
      shadowOpacity: 0.14,
      shadowRadius: 18,
      shadowOffset: { width: 0, height: 8 },
      elevation: 5,
    },
  },
  touchTarget: 48,
} as const;

export type CustomerColor = keyof typeof customerTokens.colors;
export type CustomerColorScheme = keyof typeof customerColorSchemes;
export type CustomerMotion = keyof typeof customerTokens.motion;

export function customerMotionDuration(
  reduceMotion: boolean,
  duration: CustomerMotion,
): number {
  return reduceMotion ? 0 : customerTokens.motion[duration];
}
