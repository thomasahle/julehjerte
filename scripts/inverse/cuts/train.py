"""A small U-Net from the picture (mask + x, y) to the five maps (labels.py): visible cuts, which paper
cuts them, junctions, switches, hidden cuts with their direction. Pictures held out by their base id
(a warp's or a symmetry's base is the picture it came from).
python train.py PACK.npy... --out model.pt [--epochs 30] [--hold 0.15]   (packs from pack.py; or dirs of labels.py .npz)"""
import argparse, glob, os, random, re, time
import numpy as np
import torch, torch.nn as nn, torch.nn.functional as F

N = int(os.environ.get("LABEL_N", 128))  # as labels.py
KEYS = ['visible', 'paper', 'junction', 'switch', 'hidden', 'hdir']


def base_id(path):
    name = os.path.basename(path).replace('.npz', '')
    return re.sub(r'(-w\d+-\d+)?(-(mx|my|r180|tr|atr|r90|r270))?$', '', name)


SYM_UNION = {'on': False}
_T = {'mx': (lambda a: a[..., :, ::-1], (1, -1)), 'my': (lambda a: a[..., ::-1, :], (1, -1)), 'r180': (lambda a: a[..., ::-1, ::-1], (1, 1)),
      'tr': (lambda a: np.swapaxes(a, -1, -2), (-1, 1)), 'atr': (lambda a: np.swapaxes(a[..., ::-1, ::-1], -1, -2), (-1, 1)),
      'r90': (lambda a: np.rot90(a, 1, axes=(-2, -1)), (-1, -1)), 'r270': (lambda a: np.rot90(a, -1, axes=(-2, -1)), (-1, -1))}


def sym_union_rows(a):
    """Rows of the pack (mask, visible, paper, junction, switch, hidden, hdir x2): hidden cuts and switches as the
    union over the picture's own symmetries (pack.py sym_union): a symmetric picture's template moved by its
    symmetry is another valid template of it."""
    m = a[0] > .5
    a = a.copy()
    for f, (sc, ss) in _T.values():
        if (f(m) != m).mean() > .003: continue
        h2, s2, d2 = f(a[5]), f(a[4]), np.array(f(a[6:8]))
        d2[0] *= sc; d2[1] *= ss
        new = (h2 > 0) & (a[5] == 0)
        a[6:8][:, new] = d2[:, new]
        a[5] = np.maximum(a[5], h2); a[4] = np.maximum(a[4], s2)
    return a


SYM_MIN = {'on': False}
_SWAP = {'tr', 'atr', 'r90', 'r270'}  # the symmetries turning columns into rows: papers A and B change places
ALTS = 8


def sym_alternatives(a):
    """A row's labels and those of its picture's other valid templates (--sym-min): the template moved by each
    symmetry the picture has (as sym_union_rows), papers swapped where the symmetry turns columns into rows,
    as (ALTS, 7, N, N), the row's own first and repeated to fill. A symmetric picture's template that is not
    symmetric itself has a mirror image as valid as it, with the papers on its cuts changed: trained on both
    (the picture's copies in the pack), the paper map can only learn their mean. A moved line lands up to a
    pixel off the row's own, so the moved paper labels are spread a pixel onto the row's own visible cuts."""
    from scipy import ndimage
    m, on = a[0] > .5, a[1] > .5
    alts = [a[1:8]]
    for name, (f, (sc, ss)) in _T.items():
        if (f(m) != m).mean() > .003: continue
        b = np.array(f(a[1:8]))
        b[5] *= sc; b[6] *= ss
        p = b[1]
        if name in _SWAP: p = np.where(p > .5, 3 - p, 0)
        ga, gb = ndimage.maximum_filter((np.abs(p - 1) < .5).astype(np.float32), 3), ndimage.maximum_filter((np.abs(p - 2) < .5).astype(np.float32), 3)
        spread = np.where(p > .5, p, np.where(ga > gb, 1, np.where(gb > ga, 2, 0)))
        b[1] = np.where(on, spread, 0)
        b[0] = a[1]
        alts.append(b)
    alts += [alts[0]] * (ALTS - len(alts))
    return np.stack(alts[:ALTS]).astype(np.float32)


CORRUPT = {'p': 0.0}
CLEAN = {'on': False, 'only': False}


def corrupt(m, rng):
    """The input mask (soft, N x N) roughened as a photograph or a hand painting is, its labels kept: edges
    moved by a blur and a threshold off the middle (near-touchings joined or opened, necks thinned), jagged by
    smooth noise, pixelated, or speckled near the edges; one to three of them."""
    from scipy import ndimage
    x = m.astype(np.float32)
    for kind in rng.choice(4, size=rng.integers(1, 4), replace=False):
        if kind == 0:
            x = (ndimage.gaussian_filter(x, rng.uniform(.5, 1.5)) > rng.uniform(.35, .65)).astype(np.float32)
        elif kind == 1:
            noise = ndimage.gaussian_filter(rng.standard_normal(x.shape).astype(np.float32), rng.uniform(1, 3))
            x = ((x + rng.uniform(.2, .5) * noise / (noise.std() + 1e-6)) > .5).astype(np.float32)
        elif kind == 2:
            f = int(rng.integers(2, 4)); h = x.shape[0] // f * f
            small = x[:h, :h].reshape(h // f, f, h // f, f).mean((1, 3))
            x[:h, :h] = np.repeat(np.repeat((small > .5).astype(np.float32), f, 0), f, 1)
        else:
            edge = np.abs(ndimage.gaussian_filter(x, 1) - x) > .05
            flip = edge & (rng.random(x.shape) < rng.uniform(.02, .08))
            x = np.where(flip, 1 - np.round(x), x).astype(np.float32)
    return ndimage.gaussian_filter(x, .5).clip(0, 1) if rng.random() < .5 else x


class Pack(torch.utils.data.Dataset):
    """Rows of pack.py's array (memory-mapped): x = mask, x, y; y = the nine label channels."""
    def __init__(self, arrs, rows):
        self.arrs, self.rows = arrs, rows
        yy, xx = np.mgrid[0:N, 0:N].astype(np.float32) / (N - 1)
        self.coords = np.stack([xx, yy])

    def __len__(self):
        return len(self.rows)

    def __getitem__(self, i):
        k, r = self.rows[i]
        a = np.asarray(self.arrs[k][r], np.float32)
        if SYM_UNION['on']:
            a = sym_union_rows(a)
        x0 = a[:1]
        if CORRUPT['p'] > 0 and np.random.random() < CORRUPT['p']:
            x0 = corrupt(a[0], np.random.default_rng())[None]
        y = np.concatenate([a[1:], a[:1]]) if CLEAN['on'] else a[1:]
        if SYM_MIN['on']: y = sym_alternatives(a)
        return torch.from_numpy(np.concatenate([x0, self.coords])), torch.from_numpy(y)


class Data(torch.utils.data.Dataset):
    def __init__(self, files):
        self.files = files
        yy, xx = np.mgrid[0:N, 0:N].astype(np.float32) / (N - 1)
        self.coords = np.stack([xx, yy])

    def __len__(self):
        return len(self.files)

    def __getitem__(self, i):
        d = np.load(self.files[i])
        x = np.concatenate([d['mask'][None], self.coords]).astype(np.float32)
        y = np.concatenate([d['visible'][None], d['paper'][None], d['junction'][None], d['switch'][None], d['hidden'][None], d['hdir']]).astype(np.float32)
        return torch.from_numpy(x), torch.from_numpy(y)


def block(a, b):
    return nn.Sequential(nn.Conv2d(a, b, 3, padding=1), nn.GroupNorm(8, b), nn.SiLU(), nn.Conv2d(b, b, 3, padding=1), nn.GroupNorm(8, b), nn.SiLU())


class UNet(nn.Module):
    """Four halvings (256 -> 16), attention over the 16 x 16 cells so the whole square sees itself."""
    def __init__(self, w=32):
        super().__init__()
        ch = [w, 2 * w, 4 * w, 8 * w, 8 * w]
        self.down = nn.ModuleList([block(3, ch[0])] + [block(ch[i], ch[i + 1]) for i in range(4)])
        self.attn = nn.MultiheadAttention(ch[4], 4, batch_first=True)
        self.norm = nn.LayerNorm(ch[4])
        self.pos = nn.Parameter(torch.zeros(1, (N // 16) ** 2, ch[4]))
        self.up = nn.ModuleList([block(ch[i + 1] + ch[i], ch[i]) for i in reversed(range(4))])
        # visible 1, paper 3 (none/A/B), junction 1, switch 1, hidden 1, direction 2
        self.head = nn.Conv2d(ch[0], 9, 1)

    def forward(self, x):
        skips = []
        for i, b in enumerate(self.down):
            x = b(x if i == 0 else F.max_pool2d(x, 2))
            skips.append(x)
        B, C, H, W = x.shape
        t = x.flatten(2).transpose(1, 2) + self.pos
        t = t + self.attn(self.norm(t), self.norm(t), self.norm(t))[0]
        x = t.transpose(1, 2).reshape(B, C, H, W)
        for b, s in zip(self.up, reversed(skips[:-1])):
            x = b(torch.cat([F.interpolate(x, scale_factor=2), s], 1))
        return self.head(x)


class TimmUNet(nn.Module):
    """A pretrained timm encoder (ImageNet) for the picture, our own decoder; the x, y channels join at full size.
    Attention over the coarsest cells (8 x 8 at 256) as in UNet."""
    def __init__(self, name='efficientnet_b0.ra_in1k', w=32, pretrained=True, out=9):
        super().__init__()
        import timm
        self.enc = timm.create_model(name, pretrained=pretrained, features_only=True)
        ch = [f['num_chs'] for f in self.enc.feature_info]
        top = ch[-1]
        self.attn = nn.MultiheadAttention(top, 4 if top % 4 == 0 else 1, batch_first=True)
        self.norm = nn.LayerNorm(top)
        self.pos = nn.Parameter(torch.zeros(1, (N // 32) ** 2, top))
        self.up = nn.ModuleList()
        prev = top
        for c in reversed(ch[:-1]):
            self.up.append(block(prev + c, max(w, c)))
            prev = max(w, c)
        self.full = block(prev + 3, w)
        self.head = nn.Conv2d(w, out, 1)
        self.register_buffer('mean', torch.tensor([.485, .456, .406]).view(1, 3, 1, 1))
        self.register_buffer('std', torch.tensor([.229, .224, .225]).view(1, 3, 1, 1))

    def forward(self, x):
        img = (x[:, :1].repeat(1, 3, 1, 1) - self.mean) / self.std
        feats = self.enc(img)
        h = feats[-1]
        B, C, H, W = h.shape
        t = h.flatten(2).transpose(1, 2) + self.pos[:, :H * W]
        t = t + self.attn(self.norm(t), self.norm(t), self.norm(t))[0]
        h = t.transpose(1, 2).reshape(B, C, H, W)
        for b, s in zip(self.up, reversed(feats[:-1])):
            h = b(torch.cat([F.interpolate(h, size=s.shape[-2:]), s], 1))
        h = self.full(torch.cat([F.interpolate(h, size=x.shape[-2:]), x], 1))
        return self.head(h)


SOFT = {'on': False, 'sigma': 1.0, 'pos': 5.0}


def blur(t, sigma):
    """Gaussian blur of (B, H, W) maps, peak kept at 1 where a line was."""
    r = int(3 * sigma + .5)
    k = torch.exp(-torch.arange(-r, r + 1, device=t.device, dtype=t.dtype) ** 2 / (2 * sigma * sigma))
    k = k / k.max()
    x = t[:, None]
    x = F.conv2d(x, k.view(1, 1, 1, -1), padding=(0, r))
    x = F.conv2d(x, k.view(1, 1, -1, 1), padding=(r, 0))
    return x[:, 0].clamp(0, 1)


def losses(out, y):
    vis, paper, junc, sw, hid, hdir = y[:, 0], y[:, 1].long(), y[:, 2], y[:, 3], y[:, 4], y[:, 5:7]
    l_vis = F.binary_cross_entropy_with_logits(out[:, 0], vis, pos_weight=torch.tensor(4., device=y.device))
    on = vis > .5
    l_paper = F.cross_entropy(out[:, 1:4].permute(0, 2, 3, 1)[on], paper[on]) if on.any() else out.sum() * 0
    spot = lambda o, t: ((torch.sigmoid(o) - t) ** 2 * (1 + 30 * t)).mean()
    l_junc, l_sw = spot(out[:, 4], junc), spot(out[:, 5], sw)
    # Soft targets (--soft): a hidden cut a pixel off is nearly as good; many templates are valid for one picture.
    hid_t = blur(hid, SOFT['sigma']) if SOFT['on'] else hid
    l_hid = F.binary_cross_entropy_with_logits(out[:, 6], hid_t, pos_weight=torch.tensor(SOFT['pos'] if SOFT['on'] else 20., device=y.device))
    hon = hid > .5
    l_dir = (torch.tanh(out[:, 7:9]) - hdir).abs().sum(1)[hon].mean() if hon.any() else out.sum() * 0
    out_l = {'visible': l_vis, 'paper': l_paper, 'junction': l_junc, 'switch': l_sw, 'hidden': l_hid, 'direction': l_dir}
    # The clean picture (--clean-head): what the template weaves, from a roughened input.
    if out.shape[1] > 9 and y.shape[1] > 7:
        out_l['clean'] = F.binary_cross_entropy_with_logits(out[:, 9], y[:, 7])
        # A model of the clean picture alone (--clean-only): the cut maps' losses dropped.
        if CLEAN['only']: return {'clean': out_l['clean']}
    return out_l


def sample_losses(out, y):
    """losses() per picture, (B,) each; the paper's on the visible cuts that have a paper."""
    vis, paper, junc, sw, hid, hdir = y[:, 0], y[:, 1].long(), y[:, 2], y[:, 3], y[:, 4], y[:, 5:7]
    per = lambda t: t.flatten(1).mean(1)
    masked = lambda t, m: (t * m).flatten(1).sum(1) / m.flatten(1).sum(1).clamp(min=1)
    l_vis = per(F.binary_cross_entropy_with_logits(out[:, 0], vis, pos_weight=torch.tensor(4., device=y.device), reduction='none'))
    on = ((vis > .5) & (paper > 0)).float()
    l_paper = masked(F.cross_entropy(out[:, 1:4], paper, reduction='none'), on)
    spot = lambda o, t: per((torch.sigmoid(o) - t) ** 2 * (1 + 30 * t))
    hid_t = blur(hid, SOFT['sigma']) if SOFT['on'] else hid
    l_hid = per(F.binary_cross_entropy_with_logits(out[:, 6], hid_t, pos_weight=torch.tensor(SOFT['pos'] if SOFT['on'] else 20., device=y.device), reduction='none'))
    l_dir = masked((torch.tanh(out[:, 7:9]) - hdir).abs().sum(1), (hid > .5).float())
    return {'visible': l_vis, 'paper': l_paper, 'junction': spot(out[:, 4], junc), 'switch': spot(out[:, 5], sw), 'hidden': l_hid, 'direction': l_dir}


def min_losses(out, ys):
    """--sym-min: each picture's losses against the one of its valid templates (sym_alternatives, ys of shape
    (B, ALTS, 7, N, N)) whose labels the maps are nearest, so a symmetric picture is taught one consistent
    template, not the mean of a template and its mirror image."""
    each = [sample_losses(out, ys[:, g]) for g in range(ys.shape[1])]
    total = torch.stack([sum(e.values()) for e in each], 1)
    pick = total.detach().argmin(1)
    return {k: torch.stack([e[k] for e in each], 1).gather(1, pick[:, None]).mean() for k in each[0]}


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('dirs', nargs='+')
    ap.add_argument('--out', required=True)
    ap.add_argument('--epochs', type=int, default=30)
    ap.add_argument('--hold', type=float, default=.15)
    ap.add_argument('--batch', type=int, default=8)
    ap.add_argument('--seed', type=int, default=1)
    ap.add_argument('--hold-ids', default='', help='comma-separated base ids to hold out (else a random share)')
    ap.add_argument('--encoder', default='', help='a timm encoder name (pretrained), else our own U-Net')
    ap.add_argument('--init', default='', help='start from this checkpoint (fine-tuning)')
    ap.add_argument('--lr', type=float, default=2e-3)
    ap.add_argument('--freeze-encoder', action='store_true', help='train the decoder only (as the site photo model)')
    ap.add_argument('--wd', type=float, default=1e-4)
    ap.add_argument('--sym-min', action='store_true', help='each picture taught the nearest of its symmetric templates (min_losses)')
    ap.add_argument('--sym-union', action='store_true', help='hidden cuts and switches as the union over each picture\'s symmetries')
    ap.add_argument('--soft', type=float, default=0, help='blur the hidden-cut targets by this sigma (px) and use pos_weight 5')
    ap.add_argument('--pack-weights', default='', help='comma-separated share of each pack in an epoch (packs in the order given)')
    ap.add_argument('--scratch', action='store_true', help='the timm encoder without its pretrained weights')
    ap.add_argument('--corrupt', type=float, default=0, help='roughen the input mask with this probability (labels kept)')
    ap.add_argument('--clean-head', action='store_true', help='a tenth output: the clean picture the template weaves')
    ap.add_argument('--clean-only', action='store_true', help='train the clean picture alone (a separate model)')
    ap.add_argument('--keep', default='', help='only the pictures whose names match this regex (e.g. the synthetic ones)')
    ap.add_argument('--drop', default='', help='a file of base ids (one a line) whose pictures, warped and turned too, are left out')
    ap.add_argument('--save-last', action='store_true', help='save after every epoch (--out holds the last), not only the best held out: fitting the training designs themselves')
    a = ap.parse_args()
    if a.soft > 0: SOFT.update(on=True, sigma=a.soft)
    CORRUPT['p'] = a.corrupt; CLEAN['on'] = a.clean_head or a.clean_only; CLEAN['only'] = a.clean_only
    if a.sym_union: SYM_UNION['on'] = True
    if a.sym_min:
        assert not (a.sym_union or CLEAN['on']) and a.dirs[0].endswith('.npy'), '--sym-min: pack rows, without --sym-union or a clean head'
        SYM_MIN['on'] = True
    loss_of = min_losses if SYM_MIN['on'] else losses
    if a.dirs[0].endswith('.npy'):
        import json as _json
        arr, files, where = [], [], []
        for k, d in enumerate(a.dirs):
            arr.append(np.load(d, mmap_mode='r'))
            names = _json.load(open(d[:-4] + '.json'))
            assert arr[-1].shape[-1] == N, f'set LABEL_N={arr[-1].shape[-1]}'
            files += names; where += [(k, r) for r in range(len(names))]
        if a.keep:
            import re as _re
            rx = _re.compile(a.keep); sel = [i for i, f in enumerate(files) if rx.match(f)]
            print(f'--keep {a.keep}: {len(sel)} of {len(files)} pictures', flush=True)
            files = [files[i] for i in sel]; where = [where[i] for i in sel]
        if a.drop:
            gone = set(open(a.drop).read().split()); sel = [i for i, f in enumerate(files) if base_id(f) not in gone]
            print(f'--drop {a.drop}: {len(files) - len(sel)} of {len(files)} pictures left out ({len(gone)} bases)', flush=True)
            files = [files[i] for i in sel]; where = [where[i] for i in sel]
    else:
        arr = None
        files = sorted(f for d in a.dirs for f in glob.glob(os.path.join(d, '*.npz')))
    ids = sorted({base_id(f) for f in files})
    random.Random(a.seed).shuffle(ids)
    held = set(a.hold_ids.split(',')) & set(ids) if a.hold_ids else set(ids[:max(1, int(len(ids) * a.hold))])
    train = [where[i] if arr is not None else f for i, f in enumerate(files) if base_id(f) not in held]
    test = [where[i] if arr is not None else f for i, f in enumerate(files) if base_id(f) in held]
    print(f'{len(files)} pictures from {len(ids)} bases; held out {len(held)} bases ({len(test)} pictures): {sorted(held)}', flush=True)
    dev = 'mps' if torch.backends.mps.is_available() else 'cpu'
    net = (TimmUNet(a.encoder, pretrained=not a.scratch, out=10 if CLEAN['on'] else 9) if a.encoder else UNet()).to(dev)
    if a.init:
        sd = torch.load(a.init, map_location='cpu')['model']
        own = net.state_dict()
        for key in ('head.weight', 'head.bias'):
            if key in sd and sd[key].shape != own[key].shape:
                grown = own[key].clone(); grown[:sd[key].shape[0]] = sd[key]; sd[key] = grown
        net.load_state_dict(sd)
    print('weights', sum(p.numel() for p in net.parameters()), 'device', dev, flush=True)
    if a.freeze_encoder and a.encoder:
        for p in net.enc.parameters(): p.requires_grad = False
    opt = torch.optim.AdamW([p for p in net.parameters() if p.requires_grad], 1e-3, weight_decay=a.wd)
    best = float('inf')
    sched = torch.optim.lr_scheduler.OneCycleLR(opt, a.lr, total_steps=a.epochs * ((len(train) + a.batch - 1) // a.batch))
    make = (lambda rows: Pack(arr, rows)) if arr is not None else Data
    sampler = None
    if a.pack_weights and arr is not None:
        # Each pack its share of an epoch, its pictures alike within it (drawn with replacement).
        shares = [float(w) for w in a.pack_weights.split(',')]
        counts = {}
        for k, _ in train: counts[k] = counts.get(k, 0) + 1
        w = torch.tensor([shares[k] / counts[k] for k, _ in train], dtype=torch.double)
        sampler = torch.utils.data.WeightedRandomSampler(w, len(train), replacement=True)
    tl = torch.utils.data.DataLoader(make(train), a.batch, shuffle=sampler is None, sampler=sampler, num_workers=0)
    vl = torch.utils.data.DataLoader(make(test), a.batch, num_workers=0)
    for epoch in range(a.epochs):
        net.train(); t = time.time(); tot = {}
        for x, y in tl:
            x, y = x.to(dev), y.to(dev)
            L = loss_of(net(x), y)
            loss = sum(L.values())
            opt.zero_grad(); loss.backward(); opt.step(); sched.step()
            for k, v in L.items(): tot[k] = tot.get(k, 0) + v.item() * len(x)
        net.eval(); vt = {}
        with torch.no_grad():
            for x, y in vl:
                x, y = x.to(dev), y.to(dev)
                for k, v in loss_of(net(x), y).items(): vt[k] = vt.get(k, 0) + v.item() * len(x)
        fmt = lambda d, n: ' '.join(f'{k[:4]} {v / n:.3f}' for k, v in d.items())
        print(f'epoch {epoch + 1} {time.time() - t:.0f}s train {fmt(tot, len(train))} | held {fmt(vt, max(1, len(test)))}', flush=True)
        # the checkpoint kept: the best on held-out pictures by what the ladder uses (hidden cuts, switches, paper)
        score = sum(vt.get(k, 0) for k in (('clean',) if CLEAN['only'] else ('hidden', 'switch', 'paper', 'direction'))) / max(1, len(test))
        if score < best or a.save_last:
            best = score
            torch.save({'model': net.state_dict(), 'held': sorted(held), 'encoder': a.encoder, 'epoch': epoch + 1, 'score': score}, a.out)
            print(f'  kept epoch {epoch + 1} (held score {score:.3f})', flush=True)


if __name__ == '__main__':
    main()
