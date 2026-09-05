import type { NextConfig } from 'next';

function localSupabaseConnectSources() {
  if (process.env.NEXT_PUBLIC_APP_ENV === 'production') return [];
  const configured = process.env.NEXT_PUBLIC_SUPABASE_URL ?? 'http://127.0.0.1:54321';
  try {
    const url = new URL(configured);
    if (!['127.0.0.1', 'localhost'].includes(url.hostname)) return [];
    const websocketProtocol = url.protocol === 'https:' ? 'wss:' : 'ws:';
    return [url.origin, `${websocketProtocol}//${url.host}`];
  } catch {
    return [];
  }
}

const csp = [
  "default-src 'self'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
  "object-src 'none'",
  "img-src 'self' data: blob: https://*.supabase.co",
  "media-src 'self' blob: https://*.supabase.co",
  `connect-src 'self' https://*.supabase.co wss://*.supabase.co ${localSupabaseConnectSources().join(' ')}`,
  "font-src 'self'",
  "script-src 'self' 'unsafe-inline'",
  "style-src 'self' 'unsafe-inline'",
].join('; ');

const config: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  images: {
    unoptimized: true,
  },
  transpilePackages: ['@sallah/config', '@sallah/domain', '@sallah/i18n', '@sallah/observability'],
  async headers() {
    return [
      {
        source: '/(.*)',
        headers: [
          { key: 'Content-Security-Policy', value: csp },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=(self)' },
        ],
      },
    ];
  },
};
export default config;
