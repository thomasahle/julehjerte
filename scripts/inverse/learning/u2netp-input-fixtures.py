"""Generate independent skimage reference tensors; not needed for JS tests."""
import base64
import json
from pathlib import Path
import numpy as np
import scipy
import skimage
from skimage.transform import resize

assert skimage.__version__ == '0.24.0'
cases = []
for width, height, resolution, kind in [
    (1, 1, 7, 'pattern'), (2, 3, 7, 'pattern'), (3, 2, 7, 'pattern'),
    (31, 47, 13, 'pattern'), (47, 31, 13, 'pattern'), (19, 19, 19, 'pattern'),
    (113, 77, 17, 'pattern'), (401, 3, 11, 'pattern'), (3, 401, 11, 'pattern'),
    (31, 47, 13, 'positive'), (47, 31, 13, 'positive'), (1, 9, 7, 'white'),
]:
    y, x, c = np.indices((height, width, 3))
    rgb = ((x*17+y*31+c*53+(x*y)%251)%256).astype(np.uint8)
    if kind == 'positive': rgb = (20+rgb//2).astype(np.uint8)
    if kind == 'white': rgb[:] = 255
    image = resize(rgb, (resolution, resolution), mode='constant')
    image /= np.max(image)
    tensor = ((image-[.485, .456, .406])/[.229, .224, .225]).transpose(2, 0, 1).astype('<f4')
    cases.append(dict(width=width, height=height, resolution=resolution, kind=kind,
                      tensorBase64=base64.b64encode(tensor.tobytes()).decode()))
output = Path(__file__).parents[1]/'fixtures/u2netp-input-skimage.json'
output.write_text(json.dumps({'generator': str(Path(__file__)), 'skimage': skimage.__version__,
                             'scipy': scipy.__version__, 'cases': cases}, indent=2)+'\n')
