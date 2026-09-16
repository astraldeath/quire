"""Install the checked-in branding into the generated Xcode asset catalog."""
import json
from pathlib import Path
import shutil


def install_icons(source, catalog):
    manifest = json.loads((catalog / 'Contents.json').read_text())
    names = {image['filename'] for image in manifest['images'] if image.get('filename')}
    if not names:
        raise ValueError('Xcode app icon catalog has no image filenames')
    for name in names:
        if Path(name).name != name or not (source / name).is_file():
            raise ValueError(f'Missing or invalid app icon: {name}')
    for name in names:
        shutil.copyfile(source / name, catalog / name)
        if (source / name).read_bytes() != (catalog / name).read_bytes():
            raise ValueError(f'App icon copy failed: {name}')
    print(f'Installed {len(names)} Quire app icons')


def install_privacy_wordmark(source, catalog):
    imageset = catalog / 'QuirePrivacyWordmark.imageset'
    imageset.mkdir(parents=True, exist_ok=True)
    shutil.copyfile(source, imageset / 'wordmark.png')
    (imageset / 'Contents.json').write_text(json.dumps({
        'images': [{'filename': 'wordmark.png', 'idiom': 'universal'}],
        'info': {'author': 'xcode', 'version': 1},
    }) + '\n')


if __name__ == '__main__':
    root = Path(__file__).resolve().parents[1]
    install_icons(root / 'src-tauri/icons/ios',
                  root / 'src-tauri/gen/apple/Assets.xcassets/AppIcon.appiconset')
    install_privacy_wordmark(
        root / 'src-tauri/plugins/privacy/ios/Sources/Resources/wordmark.png',
        root / 'src-tauri/gen/apple/Assets.xcassets')
