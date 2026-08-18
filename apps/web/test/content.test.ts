import { describe, expect, it } from 'vitest';
import { pages } from '../src/content';
describe('public content', () => {
  it('has Arabic and English for every page', () => {
    for (const page of Object.values(pages)) {
      expect(page.ar.every(Boolean)).toBe(true);
      expect(page.en.every(Boolean)).toBe(true);
    }
  });
});
