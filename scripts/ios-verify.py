"""Verify a device IPA without installing certificates; clean only generated build output."""
from pathlib import Path
import plistlib
import shutil
import sys
import zipfile

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
    schemes = {scheme for entry in info.get('CFBundleURLTypes', []) for scheme in entry.get('CFBundleURLSchemes', [])}
    assert 'app.quire.reader' in schemes, 'Standalone tracking OAuth callback scheme is missing'
    assert info['CFBundleSupportedPlatforms'] == ['iPhoneOS'], 'Simulator apps cannot be installed on an iPhone'
    assert not any(n.endswith('embedded.mobileprovision') or '/_CodeSignature/' in n for n in names), 'Signing files found in unsigned build'
    executable = plists[0].removesuffix('Info.plist') + info['CFBundleExecutable']
    assert executable in names, 'Application executable missing'
    assert archive.testzip() is None, 'Invalid IPA archive'
print(f'Validated unsigned device package: {ipas[0].name}')
