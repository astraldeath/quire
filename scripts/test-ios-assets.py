import importlib.util
import json
import plistlib
from pathlib import Path
import tempfile
import unittest

spec = importlib.util.spec_from_file_location('ios_icons', Path(__file__).with_name('ios-icons.py'))
branding = importlib.util.module_from_spec(spec)
spec.loader.exec_module(branding)


class PrivacyAssetTests(unittest.TestCase):
    def test_oauth_schemes_are_available_without_dependency_build_scripts(self):
        root = Path(__file__).resolve().parents[1]
        config = json.loads((root / 'src-tauri/tauri.conf.json').read_text())
        info = plistlib.loads((root / 'src-tauri/Info.plist').read_bytes())
        expected = {scheme for entry in config['plugins']['deep-link']['mobile']
                    for scheme in entry.get('scheme', []) if scheme not in ('https', 'http')}
        registered = {scheme for entry in info.get('CFBundleURLTypes', [])
                      for scheme in entry.get('CFBundleURLSchemes', [])}
        self.assertTrue(expected)
        self.assertTrue(expected <= registered, 'Cached builds must retain OAuth callback schemes')
        self.assertTrue(info.get('NSFaceIDUsageDescription'))

    def test_installs_wordmark_in_application_catalog(self):
        source = Path(__file__).resolve().parents[1] / 'src-tauri/plugins/privacy/ios/Sources/Resources/wordmark.png'
        with tempfile.TemporaryDirectory() as directory:
            catalog = Path(directory) / 'Assets.xcassets'
            catalog.mkdir()
            branding.install_privacy_wordmark(source, catalog)
            imageset = catalog / 'QuirePrivacyWordmark.imageset'
            contents = json.loads((imageset / 'Contents.json').read_text())
            image = contents['images'][0]
            self.assertEqual(image['idiom'], 'universal')
            self.assertEqual((imageset / image['filename']).read_bytes(), source.read_bytes())


if __name__ == '__main__':
    unittest.main()
