import assert from 'node:assert/strict';
import {
  mkdtempSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import {
  createManifest,
  prepareRelease,
  releaseNotes,
  releaseVersion,
} from './release-manifest.mjs';

const changelog =
  '# Changelog\r\n\r\n## [0.2.0]\r\n\r\n- Reader updates.\r\n- Chapter navigation.\r\n\r\n## [0.1.0]\r\n\r\n- Initial release.\r\n';
const input = {
  version: '0.2.0',
  tag: 'v0.2.0',
  assetName: 'Quire_0.2.0_x64-setup.exe',
  signature: 'c2lnbmF0dXJl\n',
  notes: '- Reader updates.',
  now: new Date('2026-09-17T12:00:00Z'),
};

test('stable version and tag must match exactly', () => {
  assert.equal(releaseVersion('0.2.0', 'v0.2.0'), '0.2.0');
  for (const version of ['0.2.0-beta.1', 'v0.2.0', '01.2.0', '', undefined])
    assert.throws(() => releaseVersion(version, `v${version}`));
  assert.throws(() => releaseVersion('0.2.0', 'v0.1.0'), /match/);
});

test('notes include only the exact version section and normalize CRLF', () => {
  assert.equal(
    releaseNotes(changelog, '0.2.0'),
    '- Reader updates.\n- Chapter navigation.',
  );
  assert.equal(
    releaseNotes('## [0.2.0] - 2026-09-17\n\n### Changed\n- Updates.', '0.2.0'),
    '### Changed\n- Updates.',
  );
  assert.throws(() => releaseNotes(changelog, '0.3.0'), /missing/);
  assert.throws(
    () => releaseNotes('## [0.2.0]\n\n## [0.1.0]\n- Initial', '0.2.0'),
    /no notes/,
  );
});

test('manifest has Tauri schema, a fixed tag download URL, signature contents, and UTC publication date', () => {
  assert.deepEqual(createManifest(input), {
    version: '0.2.0',
    notes: '- Reader updates.',
    pub_date: '2026-09-17T12:00:00.000Z',
    platforms: {
      'windows-x86_64': {
        signature: 'c2lnbmF0dXJl',
        url: 'https://github.com/astraldeath/quire/releases/download/v0.2.0/Quire_0.2.0_x64-setup.exe',
      },
    },
  });
  assert.match(
    createManifest({ ...input, assetName: 'Quire setup.exe' }).platforms[
      'windows-x86_64'
    ].url,
    /Quire%20setup.exe$/,
  );
});

test('manifest rejects missing signatures, signature URLs, paths, non-installers and empty notes', () => {
  for (const signature of ['', '  ', 'https://example.org/app.exe.sig'])
    assert.throws(() => createManifest({ ...input, signature }), /signature/);
  for (const assetName of ['../app.exe', '..\\app.exe', 'app.zip'])
    assert.throws(() => createManifest({ ...input, assetName }), /filename/);
  assert.throws(() => createManifest({ ...input, notes: '' }), /notes/);
});

function fixture(t) {
  const root = mkdtempSync(join(tmpdir(), 'quire-release-test-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  mkdirSync(join(root, 'src-tauri'));
  const bundleDirectory = join(root, 'nsis');
  mkdirSync(bundleDirectory);
  writeFileSync(
    join(root, 'src-tauri/tauri.conf.json'),
    JSON.stringify({ version: '0.2.0' }),
  );
  writeFileSync(join(root, 'CHANGELOG.md'), changelog);
  return {
    root,
    tag: 'v0.2.0',
    bundleDirectory,
    outputDirectory: join(root, 'release'),
    now: input.now,
  };
}

test('prepares release files from the actual installer and adjacent signature', (t) => {
  const options = fixture(t);
  writeFileSync(
    join(options.bundleDirectory, input.assetName),
    'actual installer bytes',
  );
  writeFileSync(
    join(options.bundleDirectory, `${input.assetName}.sig`),
    input.signature,
  );
  const manifest = prepareRelease(options);
  assert.deepEqual(
    JSON.parse(
      readFileSync(join(options.outputDirectory, 'latest.json'), 'utf8'),
    ),
    manifest,
  );
  assert.equal(
    readFileSync(join(options.outputDirectory, input.assetName), 'utf8'),
    'actual installer bytes',
  );
  assert.equal(
    readFileSync(
      join(options.outputDirectory, `${input.assetName}.sig`),
      'utf8',
    ),
    input.signature,
  );
  assert.equal(
    readFileSync(join(options.outputDirectory, 'release-notes.md'), 'utf8'),
    '- Reader updates.\n- Chapter navigation.\n',
  );
});

test('preparation fails closed for absent, empty, unsigned or ambiguous installers', (t) => {
  const options = fixture(t);
  assert.throws(() => prepareRelease(options), /exactly one/);
  writeFileSync(join(options.bundleDirectory, input.assetName), '');
  assert.throws(() => prepareRelease(options), /empty/);
  writeFileSync(join(options.bundleDirectory, input.assetName), 'installer');
  assert.throws(() => prepareRelease(options), /ENOENT/);
  writeFileSync(join(options.bundleDirectory, 'another.exe'), 'installer');
  assert.throws(() => prepareRelease(options), /exactly one/);
});
