export const branding = {
  displayName: { ar: 'صلّح', en: 'SALLAH' },
  shortName: 'SALLAH',
  slug: 'sallah',
  legalEntityName: 'REQUIRES_LEGAL_ENTITY',
  supportEmail: 'support@example.invalid',
  supportUrl: '/support',
  privacyUrl: '/privacy',
  termsUrl: '/terms',
  scheme: 'sallah',
  iosBundleIdentifier: 'sa.example.sallah',
  androidPackage: 'sa.example.sallah',
  colors: {
    ink: '#102A2A',
    primary: '#0B7A75',
    primaryStrong: '#075E5A',
    sand: '#F6F0E7',
    saffron: '#D89A2B',
    danger: '#B42318',
    success: '#087A55',
    white: '#FFFFFF',
  },
  typography: { arabic: 'System', latin: 'System' },
} as const;

export type Branding = typeof branding;
