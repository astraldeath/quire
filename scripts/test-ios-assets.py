import importlib.util
import json
from pathlib import Path
import tempfile
import unittest

spec = importlib.util.spec_from_file_location('ios_icons', Path(__file__).with_name('ios-icons.py'))
branding = importlib.util.module_from_spec(spec)
spec.loader.exec_module(branding)


class PrivacyAssetTests(unittest.TestCase):
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
