import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const repository = 'astraldeath/quire';
const website = `https://github.com/${repository}`;
const iconURL = `https://raw.githubusercontent.com/${repository}/refs/heads/main/src-tauri/icons/ios/AppIcon-512%402x.png`;

function compareVersions(a, b) {
  const left = a.split('.').map(Number);
  const right = b.split('.').map(Number);
  return left[0] - right[0] || left[1] - right[1] || left[2] - right[2];
}

export function createSource(releases, { minimumVersion, requiredTag } = {}) {
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
    .sort((a, b) => compareVersions(b.version, a.version));
  if (!versions.length) throw new Error('No published iOS releases found.');
  const latest = versions[0];
  if (minimumVersion && compareVersions(latest.version, minimumVersion) < 0)
    throw new Error(
      `Refusing to downgrade sideloading source from ${minimumVersion} to ${latest.version}.`,
    );
  if (
    requiredTag &&
    !versions.some((entry) => `v${entry.version}` === requiredTag)
  )
    throw new Error(
      `Expected published IPA for ${requiredTag}; leaving source unchanged.`,
    );
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

export async function fetchReleases({
  fetchImpl = fetch,
  requiredTag,
  previousVersions = [],
} = {}) {
  const headers = {
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
    'Cache-Control': 'no-cache',
  };
  if (process.env.GITHUB_TOKEN)
    headers.Authorization = `Bearer ${process.env.GITHUB_TOKEN}`;
  const request = async (path) => {
    const response = await fetchImpl(
      `https://api.github.com/repos/${repository}${path}`,
      { headers },
    );
    if (!response.ok)
      throw new Error(
        `GitHub release request failed (${path}): ${response.status}`,
      );
    return response.json();
  };
  const releases = [];
  for (let page = 1; ; page++) {
    const batch = await request(`/releases?per_page=100&page=${page}`);
    if (!Array.isArray(batch))
      throw new Error('Invalid GitHub release response.');
    releases.push(...batch);
    if (batch.length < 100) break;
    if (page >= 20)
      throw new Error('Release history exceeds the supported limit.');
  }
  // The list endpoint can omit recently published releases. Resolve the latest
  // and triggering releases independently before replacing the public source.
  const latest = await request('/releases/latest');
  const byTag = new Map(releases.map((release) => [release.tag_name, release]));
  byTag.set(latest.tag_name, latest);
  const tags = new Set([
    ...(requiredTag ? [requiredTag] : []),
    ...previousVersions
      .filter((version) => !byTag.has(`v${version}`))
      .map((version) => `v${version}`),
  ]);
  for (const tag of tags) {
    if (!/^v\d+\.\d+\.\d+$/.test(tag))
      throw new Error(`Invalid release tag: ${tag}`);
    const release = await request(`/releases/tags/${tag}`);
    if (release.tag_name !== tag)
      throw new Error(`Unexpected release response for ${tag}`);
    byTag.set(tag, release);
  }
  return [...byTag.values()];
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href
) {
  const output = resolve(process.argv[2] ?? 'repo/source.json');
  const previous = existsSync(output)
    ? JSON.parse(readFileSync(output, 'utf8')).apps[0]
    : undefined;
  const requiredTag = process.env.EXPECTED_RELEASE_TAG || undefined;
  const source = createSource(
    await fetchReleases({
      requiredTag,
      previousVersions: previous?.versions.map((entry) => entry.version) ?? [],
    }),
    { minimumVersion: previous?.version, requiredTag },
  );
  mkdirSync(dirname(output), { recursive: true });
  writeFileSync(output, `${JSON.stringify(source, null, 2)}\n`);
  console.log(
    `Updated sideloading source: Quire ${source.apps[0].version} (${source.apps[0].versions.length} versions)`,
  );
}
