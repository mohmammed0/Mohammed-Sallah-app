import { branding } from '@sallah/config/branding';
export const theme = {
  colors: branding.colors,
  radius: { sm: 10, md: 16, lg: 24 },
  space: { xs: 6, sm: 10, md: 16, lg: 24, xl: 32 },
} as const;
