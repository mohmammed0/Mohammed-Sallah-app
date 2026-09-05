/// <reference types="node" />

import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { describe, expect, it } from 'vitest';

const mobileRequire = createRequire(new URL('../package.json', import.meta.url));
const routerRequire = createRequire(mobileRequire.resolve('expo-router/package.json'));
const queryPath = routerRequire.resolve('query-string');
const query = routerRequire('query-string') as {
  parse: (value: string) => Record<string, string | string[] | null>;
  stringify: (value: Record<string, string | string[] | null>) => string;
};
const expoRequire = createRequire(mobileRequire.resolve('expo/package.json'));
const configRequire = createRequire(expoRequire.resolve('@expo/config-plugins/package.json'));
const expoPlistRequire = createRequire(configRequire.resolve('@expo/plist/package.json'));
const xcodeRequire = createRequire(configRequire.resolve('xcode/package.json'));
const simplePlistRequire = createRequire(xcodeRequire.resolve('simple-plist/package.json'));
const plistRequire = createRequire(simplePlistRequire.resolve('plist/package.json'));

type EntityReference = { nodeName: string };
type XmlDom = {
  DOMImplementation: new () => {
    createDocument: (
      namespace: null,
      name: string,
      doctype: null,
    ) => { createEntityReference: (name: string) => EntityReference };
  };
  XMLSerializer: new () => {
    serializeToString: (
      node: EntityReference,
      optionsOrHtml: { requireWellFormed: boolean } | false,
      filter?: null,
      options?: { requireWellFormed: boolean },
    ) => string;
  };
};

describe('Expo transitive dependency security', () => {
  it('preserves Router query parsing for Arabic, emoji, plus signs, repeated and empty values', () => {
    const input =
      'name=%D8%B5%D9%84%D8%AD&message=%F0%9F%94%A7+ready&literal=%2B&tag=a&tag=b&flag&empty=';
    const expected = {
      name: '\u0635\u0644\u062d',
      message: '🔧 ready',
      literal: '+',
      tag: ['a', 'b'],
      flag: null,
      empty: '',
    };
    expect(query.parse(input)).toEqual(expected);
    expect(query.parse(query.stringify(expected))).toEqual(expected);
  });

  it('bounds malformed percent decoding through the actual Router query parser', () => {
    const result = spawnSync(
      process.execPath,
      [
        '-e',
        `const assert = require('node:assert/strict');
const query = require(process.argv[1]);
for (const input of ['%E0%A4'.repeat(1024) + '%41', '%ED%A0%80'.repeat(1024), '%'.repeat(8192)]) {
  const parsed = query.parse('value=' + input);
  assert.equal(typeof parsed.value, 'string');
  assert.ok(parsed.value.length > 0);
}
process.stdout.write('bounded');`,
        queryPath,
      ],
      { encoding: 'utf8', timeout: 3000, maxBuffer: 16 * 1024 },
    );
    expect(result.error).toBeUndefined();
    expect(result.status, result.stderr).toBe(0);
    expect(result.stdout).toBe('bounded');
  });

  for (const [name, dependencyRequire, legacySerializer] of [
    ['Expo plist', expoPlistRequire, true],
    ['Xcode plist', plistRequire, false],
  ] as const) {
    it(`${name} rejects invalid entity names at creation and after mutation`, () => {
      const { DOMImplementation, XMLSerializer } = dependencyRequire('@xmldom/xmldom') as XmlDom;
      const document = new DOMImplementation().createDocument(null, 'root', null);
      const serializer = new XMLSerializer();
      const serialize = (reference: EntityReference) =>
        legacySerializer
          ? serializer.serializeToString(reference, false, null, { requireWellFormed: true })
          : serializer.serializeToString(reference, { requireWellFormed: true });
      for (const name of ['safe; <injected/> &x', 'x y', 'x<injected']) {
        expect(() => document.createEntityReference(name)).toThrow();
        const reference = document.createEntityReference('safe');
        reference.nodeName = name;
        expect(() => serialize(reference)).toThrow();
      }
      expect(serialize(document.createEntityReference('safe'))).toBe('&safe;');
    });
  }

  it('preserves both plist callers for ordinary native configuration values', () => {
    const value = {
      CFBundleDisplayName: '\u0635\u0644\u062d',
      enabled: true,
      categories: ['a', 'b'],
      count: 2,
    };
    for (const entry of [
      configRequire.resolve('@expo/plist'),
      simplePlistRequire.resolve('plist'),
    ]) {
      type PlistValue = typeof value;
      type PlistCodec = {
        build: (input: PlistValue) => string;
        parse: (source: string) => PlistValue;
      };
      const loaded = mobileRequire(entry) as PlistCodec & { default?: PlistCodec };
      const plist = loaded.default ?? loaded;
      expect(plist.parse(plist.build(value))).toEqual(value);
    }
  });
});
