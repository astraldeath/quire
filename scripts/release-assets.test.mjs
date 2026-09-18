import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, rmSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { finalizeAssets } from './release-assets.mjs';

test('rejects incomplete releases and hashes complete downloads', () => {
  const dir = mkdtempSync(join(tmpdir(), 'quire-release-'));
  try {
    const files = [
      'Quire.exe',
      'Quire.exe.sig',
      'Quire_0.2.0_android.apk',
      'Quire_0.2.0_ios-unsigned.ipa',
      'latest.json',
      'release-notes.md',
    ];
    for (const file of files.slice(0, -1))
      writeFileSync(join(dir, file), 'asset');
    writeFileSync(
      join(dir, 'latest.json'),
      JSON.stringify({
        version: '0.2.0',
        platforms: {
          'windows-x86_64': {
            url: 'https://github.com/astraldeath/quire/releases/download/v0.2.0/Quire.exe',
            signature: 'asset',
          },
        },
      }),
    );
    assert.throws(() => finalizeAssets(dir), /ENOENT/);
    writeFileSync(join(dir, 'release-notes.md'), 'Notes');
    for (const asset of [
      'Quire_0.2.0_android.apk',
      'Quire_0.2.0_ios-unsigned.ipa',
    ]) {
      rmSync(join(dir, asset));
      assert.throws(() => finalizeAssets(dir), /ENOENT/);
      writeFileSync(join(dir, asset), '');
      assert.throws(() => finalizeAssets(dir), /Empty/);
      writeFileSync(join(dir, asset), 'asset');
    }
    writeFileSync(join(dir, 'Quire.exe.sig'), 'wrong');
    assert.throws(() => finalizeAssets(dir), /signature/);
    writeFileSync(join(dir, 'Quire.exe.sig'), 'asset');
    finalizeAssets(dir);
    const hashes = readFileSync(join(dir, 'SHA256SUMS.txt'), 'utf8');
    assert.equal(hashes.trim().split('\n').length, 5);
    assert.match(hashes, /^[a-f0-9]{64}  /);
    writeFileSync(join(dir, 'private.jks'), 'secret');
    assert.throws(() => finalizeAssets(dir), /Unexpected/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
