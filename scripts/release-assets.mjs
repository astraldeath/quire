import { createHash } from 'node:crypto';
import { readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import {
  releaseVersion,
  RELEASE_REPOSITORY,
  signedAsset,
} from './release-manifest.mjs';

export function finalizeAssets(directory) {
  const manifest = JSON.parse(
    readFileSync(join(directory, 'latest.json'), 'utf8'),
  );
  const version = releaseVersion(manifest.version, `v${manifest.version}`);
  const platform = manifest.platforms?.['windows-x86_64'];
  const url = new URL(platform?.url);
  const installer = decodeURIComponent(url.pathname.split('/').at(-1));
  if (
    !/^[A-Za-z0-9_.-]+\.exe$/.test(installer) ||
    platform.url !==
      `https://github.com/${RELEASE_REPOSITORY}/releases/download/v${version}/${encodeURIComponent(installer)}`
  )
    throw new Error('Unexpected installer URL in update feed.');
  const expected = [
    installer,
    `${installer}.sig`,
    `Quire_${version}_android.apk`,
    `Quire_${version}_android.apk.sig`,
    `Quire_${version}_ios-unsigned.ipa`,
    `Quire_${version}_ios-unsigned.ipa.sig`,
    'latest.json',
  ];
  for (const name of readdirSync(directory)) {
    if (![...expected, 'release-notes.md', 'SHA256SUMS.txt'].includes(name))
      throw new Error(`Unexpected release file: ${name}`);
  }
  for (const name of [...expected, 'release-notes.md']) {
    const file = statSync(join(directory, name));
    if (!file.isFile() || file.size === 0)
      throw new Error(`Empty release file: ${name}`);
  }
  const assets = {
    'windows-x86_64': [installer, '.exe'],
    'android-universal': [`Quire_${version}_android.apk`, '.apk'],
    'ios-aarch64': [`Quire_${version}_ios-unsigned.ipa`, '.ipa'],
  };
  for (const key of Object.keys(manifest.platforms)) {
    if (!Object.hasOwn(assets, key))
      throw new Error(`Unexpected release platform: ${key}`);
  }
  const platforms = {};
  for (const [key, [assetName, extension]] of Object.entries(assets)) {
    const entry = signedAsset({
      tag: `v${version}`,
      assetName,
      extension,
      signature: readFileSync(join(directory, `${assetName}.sig`), 'utf8'),
    });
    const existing = manifest.platforms[key];
    if (
      existing &&
      (existing.signature !== entry.signature || existing.url !== entry.url)
    )
      throw new Error(
        `Updater URL or signature does not match the ${key} asset.`,
      );
    platforms[key] = entry;
  }
  manifest.platforms = platforms;
  writeFileSync(
    join(directory, 'latest.json'),
    `${JSON.stringify(manifest, null, 2)}\n`,
  );
  writeFileSync(
    join(directory, 'SHA256SUMS.txt'),
    expected
      .sort()
      .map(
        (name) =>
          `${createHash('sha256')
            .update(readFileSync(join(directory, name)))
            .digest('hex')}  ${name}\n`,
      )
      .join(''),
  );
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href
) {
  if (!process.argv[2])
    throw new Error('Usage: node scripts/release-assets.mjs <directory>');
  finalizeAssets(process.argv[2]);
}
