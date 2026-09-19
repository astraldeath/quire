import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createSource } from './sideload-source.mjs';

const release = (version, overrides = {}) => ({
  tag_name: `v${version}`,
  draft: false,
  prerelease: false,
  published_at: '2026-09-18T23:55:00Z',
  body: 'Release notes',
  assets: [
    {
      name: `Quire_${version}_ios-unsigned.ipa`,
      size: 12345,
      browser_download_url: `https://github.com/astraldeath/quire/releases/download/v${version}/Quire_${version}_ios-unsigned.ipa`,
    },
  ],
  ...overrides,
});
test('builds Feather versions and legacy fields from actual published assets', () => {
  const source = createSource([
    release('0.2.0'),
    release('0.10.0'),
    release('0.3.0'),
  ]);
  const app = source.apps[0];
  assert.equal(app.bundleIdentifier, 'app.quire.reader');
  assert.deepEqual(
    app.versions.map((v) => v.version),
    ['0.10.0', '0.3.0', '0.2.0'],
  );
  assert.equal(app.version, '0.10.0');
  assert.equal(app.downloadURL, app.versions[0].downloadURL);
  assert.equal(app.size, 12345);
  assert.equal(app.versionDate, '2026-09-18T23:55:00.000Z');
  assert.equal(source.website, 'https://github.com/astraldeath/quire');
});
test('excludes drafts, prereleases and releases without an IPA', () => {
  const source = createSource([
    release('1.0.0', { draft: true }),
    release('0.4.0', { prerelease: true }),
    release('0.3.1', { assets: [] }),
    release('0.3.0'),
  ]);
  assert.equal(source.apps[0].versions.length, 1);
  assert.throws(() => createSource([]), /No published/);
});
test('rejects malformed dates, sizes and mismatched download destinations', () => {
  for (const mutate of [
    (r) => (r.published_at = 'bad'),
    (r) => (r.assets[0].size = 0),
    (r) => (r.assets[0].browser_download_url = 'https://example.com/quire.ipa'),
  ]) {
    const r = release('0.3.0');
    mutate(r);
    assert.throws(() => createSource([r]));
  }
});
