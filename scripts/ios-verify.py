"""Verify a device IPA without installing certificates; clean only generated build output."""
from pathlib import Path
import plistlib
import shutil
import sys
import zipfile
import json
import subprocess
import tempfile

root = Path(__file__).resolve().parents[1]
build = root / 'src-tauri' / 'gen' / 'apple' / 'build'
if '--clean' in sys.argv:
    resolved = build.resolve()
    if not resolved.is_relative_to(root) or resolved.name != 'build':
        raise SystemExit('Refusing to clean outside generated build directory')
    if resolved.exists():
        shutil.rmtree(resolved)
    raise SystemExit(0)

ipas = list(build.rglob('*.ipa'))
if len(ipas) != 1:
    raise SystemExit(f'Expected one unsigned IPA, found {len(ipas)}')
with zipfile.ZipFile(ipas[0]) as archive:
    names = archive.namelist()
    plists = [n for n in names if n.startswith('Payload/') and n.endswith('.app/Info.plist') and n.count('/') == 2]
    if len(plists) != 1:
        raise SystemExit('Expected one application inside Payload')
    info = plistlib.loads(archive.read(plists[0]))
    assert info['CFBundleIdentifier'] == 'app.quire.reader', 'Unexpected bundle identifier'
    assert info.get('NSFaceIDUsageDescription'), 'Face ID usage description missing'
    schemes = {scheme for entry in info.get('CFBundleURLTypes', []) for scheme in entry.get('CFBundleURLSchemes', [])}
    assert 'app.quire.reader' in schemes, 'Standalone tracking OAuth callback scheme is missing'
    assert info['CFBundleSupportedPlatforms'] == ['iPhoneOS'], 'Simulator apps cannot be installed on an iPhone'
    assert not any(n.endswith('embedded.mobileprovision') or '/_CodeSignature/' in n for n in names), 'Signing files found in unsigned build'
    executable = plists[0].removesuffix('Info.plist') + info['CFBundleExecutable']
    assert executable in names, 'Application executable missing'
    assets = plists[0].removesuffix('Info.plist') + 'Assets.car'
    assert assets in names, 'Application asset catalog missing'
    with tempfile.TemporaryDirectory() as directory:
        catalog = Path(directory) / 'Assets.car'
        catalog.write_bytes(archive.read(assets))
        asset_info = json.loads(subprocess.check_output(['xcrun', 'assetutil', '--info', str(catalog)]))
        assert any(item.get('Name') == 'QuirePrivacyWordmark' for item in asset_info), 'Privacy wordmark missing from IPA'
    assert archive.testzip() is None, 'Invalid IPA archive'
print(f'Validated unsigned device package: {ipas[0].name}')
