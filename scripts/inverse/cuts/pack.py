"""All pictures' maps at LABEL_N (labels.py) in one float16 array, memory-mapped by train.py:
PACK.npy of shape (count, 8, N, N): mask, visible, paper, junction, switch, hidden, hdir (2), plus
PACK.json with the names. python pack.py PACK CUT.json..."""
import json, os, sys
import numpy as np
sys.path.insert(0, os.path.dirname(__file__))
from labels import labels, N
out, *cuts = sys.argv[1:]
# @LIST: the cut files named in LIST, one per line (beyond the shell's argument limit).
cuts = [c for a in cuts for c in (open(a[1:]).read().split() if a.startswith('@') else [a])]
SYM_UNION = bool(os.environ.get('SYM_UNION'))


def sym_union(d):
    """Hidden cuts and switches as the union over the picture's own symmetries: a symmetric picture's template
    moved by its symmetry is another valid template of it (directions as doubled angles move along)."""
    m = d['mask'] > .5
    T = {  # map transform, and (cos 2a, sin 2a) -> sign changes
        'mx': (lambda a: a[..., :, ::-1], (1, -1)), 'my': (lambda a: a[..., ::-1, :], (1, -1)),
        'r180': (lambda a: a[..., ::-1, ::-1], (1, 1)),
        'tr': (lambda a: np.swapaxes(a, -1, -2), (-1, 1)), 'atr': (lambda a: np.swapaxes(a[..., ::-1, ::-1], -1, -2), (-1, 1)),
        'r90': (lambda a: np.rot90(a, 1, axes=(-2, -1)), (-1, -1)), 'r270': (lambda a: np.rot90(a, -1, axes=(-2, -1)), (-1, -1))}
    hid, sw, hdir = d['hidden'].copy(), d['switch'].copy(), d['hdir'].copy()
    for name, (f, (sc, ss)) in T.items():
        if (f(m) != m).mean() > .003: continue
        h2, s2, d2 = f(d['hidden']), f(d['switch']), f(d['hdir']).copy()
        d2[0] *= sc; d2[1] *= ss
        new = (h2 > 0) & (hid == 0)
        hdir[:, new] = d2[:, new]
        hid = np.maximum(hid, h2); sw = np.maximum(sw, s2)
    d = dict(d); d['hidden'], d['switch'], d['hdir'] = hid, sw, hdir
    return d
arr = np.lib.format.open_memmap(out + '.npy', mode='w+', dtype=np.float16, shape=(len(cuts), 8, N, N))
names = []
for i, c in enumerate(cuts):
    d, _ = labels(json.load(open(c)), json.load(open(c.replace('.cut.json', '.mask.json'))))
    if SYM_UNION: d = sym_union(d)
    arr[i] = np.concatenate([d['mask'][None], d['visible'][None], d['paper'][None], d['junction'][None], d['switch'][None], d['hidden'][None], d['hdir']]).astype(np.float16)
    names.append(os.path.basename(c).replace('.cut.json', ''))
    if i % 500 == 0: print(i, flush=True)
arr.flush()
json.dump(names, open(out + '.json', 'w'))
print('packed', len(names), arr.shape)
