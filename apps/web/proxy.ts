import { NextResponse, type NextRequest } from 'next/server';
import { documentLocaleHeader, documentLocaleFromPath } from './src/lib/document-language';

export function proxy(request: NextRequest) {
  const requestHeaders = new Headers(request.headers);
  // The URL owns document language; always replace an incoming client value.
  requestHeaders.set(documentLocaleHeader, documentLocaleFromPath(request.nextUrl.pathname));
  return NextResponse.next({ request: { headers: requestHeaders } });
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|robots.txt|sitemap.xml).*)'],
};
