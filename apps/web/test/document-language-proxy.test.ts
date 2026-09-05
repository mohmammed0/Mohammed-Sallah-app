import { NextRequest } from 'next/server';
import { describe, expect, it } from 'vitest';
import { proxy } from '../proxy';

describe('document language request boundary', () => {
  it.each([
    ['/ar/privacy', 'ar'],
    ['/en/privacy', 'en'],
    ['/%65n/privacy', 'en'],
    ['/%75r/privacy', 'ur'],
    ['/%E0%A4/privacy', 'ar'],
    ['/ur', 'ur'],
    ['/hi/contact', 'hi'],
    ['/login', 'ar'],
    ['/admin', 'ar'],
    ['/unsupported/privacy', 'ar'],
  ])('derives the language from %s and replaces an incoming value', (path, expected) => {
    const request = new NextRequest(`https://example.test${path}`, {
      headers: { 'x-sallah-document-locale': expected === 'ar' ? 'en' : 'ar' },
    });
    const response = proxy(request);
    expect(response.headers.get('x-middleware-request-x-sallah-document-locale')).toBe(expected);
    expect(response.headers.get('location')).toBeNull();
    expect(response.headers.get('x-sallah-document-locale')).toBeNull();
  });

  it('preserves authentication headers for the downstream request', () => {
    const request = new NextRequest('https://example.test/admin', {
      headers: {
        cookie: 'session=synthetic-test-value',
        authorization: 'Bearer synthetic-test-value',
      },
    });
    const response = proxy(request);
    expect(response.headers.get('x-middleware-request-cookie')).toBe(
      'session=synthetic-test-value',
    );
    expect(response.headers.get('x-middleware-request-authorization')).toBe(
      'Bearer synthetic-test-value',
    );
    expect(response.headers.get('set-cookie')).toBeNull();
  });
});
