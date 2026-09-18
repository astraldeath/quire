import {
  copyFileSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { basename, join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

export const RELEASE_REPOSITORY = 'astraldeath/quire';

export function releaseVersion(version, tag) {
  if (
    typeof version !== 'string' ||
    !/^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/.test(version)
  ) {
    throw new Error('The stable update feed requires a version such as 0.2.0.');
  }
  if (tag !== `v${version}`)
    throw new Error(`Release tag must match the Tauri version: v${version}.`);
  return version;
}

export function releaseNotes(changelog, version) {
  const lines = changelog.replace(/\r\n/g, '\n').split('\n');
  const heading = new RegExp(
    `^## \\[${version.replaceAll('.', '\\.')}\\](?:\\s+-.*)?$`,
  );
  const start = lines.findIndex((line) => heading.test(line));
  if (start === -1)
    throw new Error(`CHANGELOG.md is missing a [${version}] section.`);
  const next = lines.findIndex(
    (line, index) => index > start && /^## /.test(line),
  );
  const notes = lines
    .slice(start + 1, next === -1 ? undefined : next)
    .join('\n')
    .trim();
  if (!notes) throw new Error(`CHANGELOG.md has no notes for ${version}.`);
  return notes;
}

export function signedAsset({ tag, assetName, signature, extension }) {
  if (
    !assetName ||
    basename(assetName) !== assetName ||
    /[\\/]/.test(assetName) ||
    !assetName.endsWith(extension)
  ) {
    throw new Error(
      'The release asset must be a valid filename with the expected extension.',
    );
  }
  const normalizedSignature =
    typeof signature === 'string' ? signature.trim() : '';
  if (
    !normalizedSignature ||
    !/^[A-Za-z0-9+/]+={0,2}$/.test(normalizedSignature)
  ) {
    throw new Error(
      'The asset signature must contain the base64 Tauri .sig contents.',
    );
  }
  return {
    signature: normalizedSignature,
    url: `https://github.com/${RELEASE_REPOSITORY}/releases/download/${tag}/${encodeURIComponent(assetName)}`,
  };
}

export function createManifest({
  version,
  tag,
  assetName,
  signature,
  notes,
  now = new Date(),
}) {
  releaseVersion(version, tag);
  if (!notes?.trim()) throw new Error('Release notes are required.');
  return {
    version,
    notes: notes.trim(),
    pub_date: now.toISOString(),
    platforms: {
      'windows-x86_64': signedAsset({
        tag,
        assetName,
        signature,
        extension: '.exe',
      }),
    },
  };
}

export function prepareRelease({
  root = process.cwd(),
  tag,
  bundleDirectory,
  outputDirectory,
  now,
}) {
  const config = JSON.parse(
    readFileSync(join(root, 'src-tauri/tauri.conf.json'), 'utf8'),
  );
  const version = releaseVersion(config.version, tag);
  const notes = releaseNotes(
    readFileSync(join(root, 'CHANGELOG.md'), 'utf8'),
    version,
  );
  const installers = readdirSync(bundleDirectory).filter((name) =>
    name.endsWith('.exe'),
  );
  if (installers.length !== 1)
    throw new Error(
      `Expected exactly one NSIS installer; found ${installers.length}.`,
    );
  const assetName = installers[0];
  const installer = join(bundleDirectory, assetName);
  if (!statSync(installer).isFile() || statSync(installer).size === 0)
    throw new Error('The installer is empty or not a file.');
  const signature = readFileSync(`${installer}.sig`, 'utf8');
  const manifest = createManifest({
    version,
    tag,
    assetName,
    signature,
    notes,
    now,
  });
  mkdirSync(outputDirectory, { recursive: true });
  copyFileSync(installer, join(outputDirectory, assetName));
  copyFileSync(`${installer}.sig`, join(outputDirectory, `${assetName}.sig`));
  writeFileSync(
    join(outputDirectory, 'latest.json'),
    `${JSON.stringify(manifest, null, 2)}\n`,
  );
  writeFileSync(join(outputDirectory, 'release-notes.md'), `${notes}\n`);
  return manifest;
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href
) {
  const [tag, bundleDirectory, outputDirectory] = process.argv.slice(2);
  if (!tag || !bundleDirectory || !outputDirectory) {
    throw new Error(
      'Usage: node scripts/release-manifest.mjs v0.2.0 <nsis-directory> <output-directory>',
    );
  }
  prepareRelease({ tag, bundleDirectory, outputDirectory });
}
