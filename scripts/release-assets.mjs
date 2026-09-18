import { createHash } from 'node:crypto';
import { readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { releaseVersion, RELEASE_REPOSITORY } from './release-manifest.mjs';

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
    `Quire_${version}_ios-unsigned.ipa`,
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
  if (
    readFileSync(join(directory, `${installer}.sig`), 'utf8').trim() !==
    platform.signature
  )
    throw new Error(
      'Updater signature does not match the installer signature file.',
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
