"""Full-source identity and continuous letterbox regression checks."""
import hashlib
import importlib.util
from pathlib import Path
import tempfile
import unittest

import numpy as np
from PIL import Image, ImageOps

spec = importlib.util.spec_from_file_location('photo_probe', Path(__file__).with_name('photo-probe.py'))
probe = importlib.util.module_from_spec(spec)
spec.loader.exec_module(probe)


class PhotoProbeTests(unittest.TestCase):
    def test_exif_orientation_and_both_source_hashes(self):
        with tempfile.TemporaryDirectory() as folder:
            root = Path(folder)
            pixels = np.zeros((5, 9, 3), np.uint8)
            pixels[:2, :4] = [255, 30, 100]
            photo = Image.fromarray(pixels)
            exif = photo.getexif()
            exif[274] = 6
            path = root/'oriented.jpg'
            photo.save(path, exif=exif)
            with Image.open(path) as original:
                expected = ImageOps.exif_transpose(original).convert('RGB')
            row = {'localPath': path.name, 'sha256': probe.sha(path),
                   'width': 5, 'height': 9,
                   'decodedPixelsSha256': hashlib.sha256(expected.tobytes()).hexdigest()}
            actual = probe.source_photo(row, root)
            np.testing.assert_array_equal(actual, expected)
            with self.assertRaisesRegex(ValueError, 'Decoded source RGB'):
                probe.source_photo({**row, 'decodedPixelsSha256': 'wrong'}, root)
            path.write_bytes(path.read_bytes()+b'changed')
            with self.assertRaisesRegex(ValueError, 'Source file changed'):
                probe.source_photo(row, root)

    def test_fractional_letterbox_geometry_and_padding(self):
        photo = Image.new('RGB', (97, 311), (30, 70, 100))
        rgb, valid, transform, window = probe.letterbox(photo)
        # Independently map each output pixel centre through the stored window.
        x = window[0]+(np.arange(256)+.5)*(window[2]-window[0])/256
        y = window[1]+(np.arange(256)+.5)*(window[3]-window[1])/256
        expected = ((x >= 0) & (x < 97))[None] & ((y >= 0) & (y < 311))[:, None]
        np.testing.assert_array_equal(valid, expected)
        np.testing.assert_array_equal(rgb[valid], np.tile([30, 70, 100], (valid.sum(), 1)))
        np.testing.assert_array_equal(rgb[~valid], np.full((int((~valid).sum()), 3), 127))
        self.assertNotEqual(transform['offset'][0], round(transform['offset'][0]))


if __name__ == '__main__':
    unittest.main()
