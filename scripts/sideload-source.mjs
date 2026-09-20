import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const repository = 'astraldeath/quire';
const website = `https://github.com/${repository}`;
const iconURL = `https://raw.githubusercontent.com/${repository}/refs/heads/main/src-tauri/icons/ios/AppIcon-512%402x.png`;

export function createSource(releases) {
  if (!Array.isArray(releases)) throw new Error('Expected GitHub releases.');
  const versions = releases
    .flatMap((release) => {
      if (
        release.draft ||
        release.prerelease ||
        !/^v\d+\.\d+\.\d+$/.test(release.tag_name)
      )
        return [];
      const version = release.tag_name.slice(1);
      const name = `Quire_${version}_ios-unsigned.ipa`;
      const assets =
        release.assets?.filter((asset) => asset.name === name) ?? [];
      if (!assets.length) return [];
      const asset = assets[0];
      const downloadURL = `${website}/releases/download/v${version}/${name}`;
      if (
        assets.length !== 1 ||
        asset.browser_download_url !== downloadURL ||
        !Number.isSafeInteger(asset.size) ||
        asset.size <= 0 ||
        typeof release.published_at !== 'string' ||
        !Number.isFinite(Date.parse(release.published_at))
      ) {
        throw new Error(`Invalid published IPA metadata for ${version}.`);
      }
      return [
        {
          version,
          date: new Date(release.published_at).toISOString(),
          localizedDescription: release.body || `Quire ${version}`,
          downloadURL,
          size: asset.size,
        },
      ];
    })
    .sort((a, b) => {
      const left = a.version.split('.').map(Number);
      const right = b.version.split('.').map(Number);
      return right[0] - left[0] || right[1] - left[1] || right[2] - left[2];
    });
  if (!versions.length) throw new Error('No published iOS releases found.');
  const latest = versions[0];
  return {
    name: 'Quire',
    identifier: 'app.quire.reader.source',
    website,
    iconURL,
    subtitle: 'Offline book reader',
    tintColor: '728EAE',
    apps: [
      {
        name: 'Quire',
        bundleIdentifier: 'app.quire.reader',
        developerName: 'astraldeath',
        subtitle: 'Offline book reader',
        localizedDescription:
          'Read EPUB, PDF, CBZ, CBR, CB7, FB2, and DRM-free Kindle books. Organize your library, track reading progress, and optionally sync with Quire Server.',
        iconURL,
        tintColor: '728EAE',
        category: 'books',
        version: latest.version,
        versionDate: latest.date,
        versionDescription: latest.localizedDescription,
        downloadURL: latest.downloadURL,
        size: latest.size,
        versions,
        appPermissions: {
          entitlements: [],
          privacy: [
            {
              name: 'NSFaceIDUsageDescription',
              usageDescription: 'Unlock your private books in Quire.',
            },
          ],
        },
      },
    ],
    news: [],
  };
}

async function fetchReleases() {
  const headers = {
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
  };
  if (process.env.GITHUB_TOKEN)
    headers.Authorization = `Bearer ${process.env.GITHUB_TOKEN}`;
  const releases = [];
  for (let page = 1; ; page++) {
    const response = await fetch(
      `https://api.github.com/repos/${repository}/releases?per_page=100&page=${page}`,
      { headers },
    );
    if (!response.ok)
      throw new Error(`GitHub release request failed: ${response.status}`);
    const batch = await response.json();
    if (!Array.isArray(batch))
      throw new Error('Invalid GitHub release response.');
    releases.push(...batch);
    if (batch.length < 100) return releases;
    if (page >= 20)
      throw new Error('Release history exceeds the supported limit.');
  }
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href
) {
  const source = createSource(await fetchReleases());
  const output = resolve(process.argv[2] ?? 'repo/source.json');
  mkdirSync(dirname(output), { recursive: true });
  writeFileSync(output, `${JSON.stringify(source, null, 2)}\n`);
  console.log(
    `Updated sideloading source: Quire ${source.apps[0].version} (${source.apps[0].versions.length} versions)`,
  );
}
