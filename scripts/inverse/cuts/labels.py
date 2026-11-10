"""One solved template (heartcurves-2 cut.json, mm in the 100 mm overlap square, y down) and its
picture's mask -> the network's input and label maps at N x N:
  mask      the picture (area-averaged from the mask's resolution)
  visible   the visible cuts (lines)
  paper     on visible cuts: 1 where paper A cuts, 2 where B does
  junction  where three or more visible cuts meet (Gaussian spots)
  switch    where a hidden cut leaves the visible outline (Gaussian spots)
  hidden    the hidden cuts (lines)
  hdir      on hidden cuts, their direction as the doubled angle (cos 2a, sin 2a): a line has no sign
python labels.py CUT.json MASK.json OUT.npz [PREVIEW.png]"""
import json, os, sys
import numpy as np

# The maps' size: the shipped network reads 128 x 128 (static/inverse/neural/cuts.js N); LABEL_N for another.
N = int(os.environ.get("LABEL_N", 128))
WIDTH = 100.0
HALF = 0.9      # half line width, px
SIGMA = 1.5     # spot size, px


def cubic(p, t):
    p = np.asarray(p, float)
    u = 1 - t
    pts = (u**3)[:, None] * p[0] + (3 * u * u * t)[:, None] * p[1] + (3 * u * t * t)[:, None] * p[2] + (t**3)[:, None] * p[3]
    der = (3 * u * u)[:, None] * (p[1] - p[0]) + (6 * u * t)[:, None] * (p[2] - p[1]) + (3 * t * t)[:, None] * (p[3] - p[2])
    return pts, der


def draw_line(img, pts, values=None, half=HALF):
    """Mark every pixel whose centre lies within `half` px of a sample (samples a tenth of a pixel apart)."""
    s = pts * N / WIDTH
    r = int(np.ceil(half))
    for dx in range(-r, r + 1):
        for dy in range(-r, r + 1):
            ix = np.floor(s[:, 0]).astype(int) + dx
            iy = np.floor(s[:, 1]).astype(int) + dy
            d = np.hypot(ix + .5 - s[:, 0], iy + .5 - s[:, 1])
            ok = (d <= half) & (ix >= 0) & (iy >= 0) & (ix < N) & (iy < N)
            if values is None:
                img[iy[ok], ix[ok]] = 1
            else:
                img[..., iy[ok], ix[ok]] = values[:, ok]


def spots(points):
    yy, xx = np.mgrid[0:N, 0:N] + .5
    out = np.zeros((N, N), np.float32)
    for x, y in points:
        sx, sy = x * N / WIDTH, y * N / WIDTH
        out = np.maximum(out, np.exp(-((xx - sx) ** 2 + (yy - sy) ** 2) / (2 * SIGMA**2)))
    return out


def labels(cut, mask):
    curves = cut['curves']
    fam = {k: set() for k in curves}
    for f, key in enumerate(['A_overlap_paths', 'B_overlap_paths']):
        for slit in cut[key]:
            for item in slit:
                fam[item['curve']].add(f)
    visible = np.zeros((N, N), np.float32)
    paper = np.zeros((N, N), np.float32)
    hidden = np.zeros((N, N), np.float32)
    hdir = np.zeros((2, N, N), np.float32)
    ends = {}
    # Samples of every curve, gathered by kind, drawn at once (a generator design has thousands of pieces).
    vis_pts, fam_pts, hid_pts, hid_val = [], {0: [], 1: []}, [], []
    for k, c in curves.items():
        p = c['control_points']
        length = sum(np.hypot(*np.subtract(p[i + 1], p[i])) for i in range(3))
        t = np.linspace(0, 1, max(2, int(length * N / WIDTH * 10) + 1))
        pts, der = cubic(p, t)
        vis = bool(c['visible_boundary'])
        if vis:
            vis_pts.append(pts)
            fs = fam[k]
            if len(fs) == 1:
                fam_pts[next(iter(fs))].append(pts)
        else:
            hid_pts.append(pts)
            a = np.arctan2(der[:, 1], der[:, 0])
            hid_val.append(np.stack([np.cos(2 * a), np.sin(2 * a)]).astype(np.float32))
        for q in (p[0], p[3]):
            key = (round(q[0], 2), round(q[1], 2))
            e = ends.setdefault(key, [0, 0])
            e[0 if vis else 1] += 1
    if vis_pts:
        draw_line(visible, np.concatenate(vis_pts))
    for f in (0, 1):
        if fam_pts[f]:
            tmp = np.zeros((N, N), np.float32)
            draw_line(tmp, np.concatenate(fam_pts[f]))
            paper[tmp > 0] = 1 + f
    if hid_pts:
        draw_line(hidden, np.concatenate(hid_pts))
        draw_line(hdir, np.concatenate(hid_pts), np.concatenate(hid_val, axis=1))
    inside = lambda q: min(q[0], q[1], WIDTH - q[0], WIDTH - q[1]) > .05
    junction = spots([q for q, (v, h) in ends.items() if v >= 3 and inside(q)])
    switch = spots([q for q, (v, h) in ends.items() if v >= 1 and h >= 1 and inside(q)])
    m = np.asarray(mask['data'], np.float32).reshape(mask['size'], mask['size'])
    # area average onto N x N
    size = mask['size']
    edges = np.linspace(0, size, N + 1)
    rows = np.add.reduceat(m, np.floor(edges[:-1]).astype(int), axis=0) / np.diff(np.floor(edges)).clip(1)[:, None]
    small = np.add.reduceat(rows, np.floor(edges[:-1]).astype(int), axis=1) / np.diff(np.floor(edges)).clip(1)[None, :]
    return dict(mask=small.astype(np.float32), visible=visible, paper=paper, junction=junction, switch=switch, hidden=hidden, hdir=hdir), ends


def preview(d, path):
    from PIL import Image
    img = np.ones((N, N, 3), np.float32)
    img[d['mask'] > .5] = [.96, .8, .8]
    img[d['paper'] == 1] = [.1, .33, .77]
    img[d['paper'] == 2] = [.1, .6, .23]
    img[d['hidden'] > 0] = [.6, .1, .8]
    for key, colour in (('switch', [1, .5, 0]), ('junction', [0, 0, 0])):
        a = d[key][..., None]
        img = img * (1 - a) + a * np.array(colour)
    Image.fromarray((img * 255).astype(np.uint8)).resize((2 * N, 2 * N), Image.NEAREST).save(path)


if __name__ == '__main__':
    cut = json.load(open(sys.argv[1]))
    mask = json.load(open(sys.argv[2]))
    d, ends = labels(cut, mask)
    np.savez_compressed(sys.argv[3], **d)
    if len(sys.argv) > 4:
        preview(d, sys.argv[4])
    print(sys.argv[1].split('/')[-1], 'visible px', int(d['visible'].sum()), 'hidden px', int(d['hidden'].sum()),
          'switches', int((d['switch'] > .99).sum()), 'junctions', int((d['junction'] > .99).sum()))
