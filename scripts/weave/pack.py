"""Pack a baked simulation for the page.  pack.py IN.npz OUT.jhb [every] [fill] [--log RUN.log] [--note "text"]
--log reads the summary line unweave.py printed, so the viewer can say how long the run took and whether anything was passed
through by magic; --note is a sentence shown under those facts.
Layout: 'JHB1', uint32 header length, header JSON, then the sections it lists (offsets relative to the end of the header).
Frames are 16-bit positions, stored as differences from the previous frame, low bytes then high bytes, zlib-compressed."""
import sys, json, zlib, numpy as np
import re
def opt(name):
    if name in sys.argv:
        i = sys.argv.index(name); v = sys.argv[i + 1]; del sys.argv[i:i + 2]; return v
logf, note = opt('--log'), opt('--note'); stats = {}
if logf:
    m = re.search(r'(\d+) crossings undone, (\d+) frames in (\d+) s .*?most stretch.*? (\d+)%; strips passed through by magic: (\d+) \((\d+) frames\); other frames intersecting: (\w+)(?:; draws done again by pulling: (\d+))?(?:; frames with only a patch of a strip in other paper: (\d+))?', open(logf).read())
    if m: stats = dict(crossings=int(m[1]), simframes=int(m[2]), seconds=int(m[3]), stretch=int(m[4]), magic=int(m[5]), magicFrames=int(m[6])); stats.update(bad=int(m[7])) if m[7].isdigit() else None; stats.update(retries=int(m[8])) if m[8] else None; stats.update(patchFrames=int(m[9])) if m[9] else None
if note: stats['note'] = note
d = np.load(sys.argv[1]); out = sys.argv[2]; every = int(sys.argv[3]) if len(sys.argv) > 3 else 1
fr = d['frames'].astype(np.float64)
if len(sys.argv) > 4:      # unfinished run: fill the part not simulated yet from another file with the same mesh
    if sys.argv[4].isdigit(): fr = np.concatenate([fr, np.repeat(fr[-1:], int(sys.argv[4]) - len(fr), axis=0)])
    else:
        gfr = np.load(sys.argv[4])['frames']; fr = np.concatenate([fr, gfr[len(fr):]])
if 'reverse' in d and bool(d['reverse']): fr = fr[::-1]
fr = fr[::every]; F = d['F']; piece = d['piece'].astype(np.uint8); sign = d['sign'].astype(np.int8)
fps = float(d['fps']) / every; nfr, nv, _ = fr.shape
Q = 0.0002
mn = fr.reshape(-1, 3).min(0) - Q
q = np.round((fr - mn) / Q).astype(np.int64)
assert q.max() < 65535, q.max()
# only move a stored coordinate when it has really changed, so paper that is lying still costs nothing
stored = q[0].copy(); deltas = np.zeros((nfr, nv, 3), np.int64); deltas[0] = stored
for k in range(1, nfr):
    ch = np.abs(q[k] - stored) >= 2
    new = np.where(ch, q[k], stored); deltas[k] = new - stored; stored = new
raw = deltas.astype('<i2').tobytes(); b = np.frombuffer(raw, np.uint8)
shuf = np.concatenate([b[0::2], b[1::2]]).tobytes()
comp = zlib.compress(shuf, 9)
faces = F.astype('<u2' if nv < 65536 else '<u4').tobytes()
# ---- what the viewer needs to draw, cut and lay out the paper before the simulated weaving starts: where each point is on its flat half,
# the cut lines, and for the points along a cut where they sit before the scissors have opened it
film, more = None, []
if 'rest' in d:
    import shapely
    from shapely.geometry import LineString
    rest = d['rest'].astype(np.float64); SQ_, RAD_, KERF_, ZI_, ZHOME_, ZG_ = [float(x) for x in d['consts']]
    nA, nB = [int(x) for x in d['ncuts']]; cc = np.split(d['cuts'].astype(np.float64), np.cumsum(d['cutlen'])[:-1]); cuts = {1: cc[:nA], 0: cc[nA:]}
    E_ = np.sort(np.vstack([F[:, [0, 1]], F[:, [1, 2]], F[:, [2, 0]]]), axis=1); ue, cnt = np.unique(E_, axis=0, return_counts=True)
    edge = np.zeros(nv, bool); edge[ue[cnt == 1].ravel()] = True                      # points on the outline of the paper
    kc = -np.ones(nv, np.int8); kd = np.zeros((nv, 2), np.float32); kf = np.zeros(nv, np.float32); best = np.full(nv, 1e9); outc = {1: [], 0: []}; straight = True
    for h in (1, 0):
        ids = np.where((piece == h) & edge)[0]; pts = shapely.points(rest[ids])
        for ci, c in enumerate(cuts[h]):
            c = np.array(LineString(c).simplify(0.002).coords); L = float(LineString(c).length); line = LineString(np.vstack([[c[0, 0] - 0.2, c[0, 1]], c]))
            dist = shapely.distance(line, pts); loc = shapely.line_locate_point(line, pts); near = shapely.get_coordinates(shapely.line_interpolate_point(line, loc))
            m = (dist < KERF_ / 2 + 0.007) & (dist < best[ids]); j = ids[m]
            kc[j] = ci; kd[j] = near[m] - rest[j]; kf[j] = np.clip((loc[m] - 0.2) / L, 0, 1); best[j] = dist[m]
            outc[h].append(np.round(c, 4).tolist()); straight &= bool(np.ptp(c[:, 1]) < 0.02)
    f0 = fr[0]; red = piece == 1; redoff = float(np.mean(f0[red, 0] - rest[red, 0]))
    flat = np.where(red[:, None], np.c_[redoff + rest[:, 0], rest[:, 1]], np.c_[rest[:, 1], rest[:, 0]])
    print('film: points on cuts %d, first frame differs from the flat halves by at most %.3f in plan, heights %.3f to %.3f (flat: %.3f and %.3f)' % ((kc >= 0).sum(), np.abs(f0[:, :2] - flat).max(), f0[:, 2].min(), f0[:, 2].max(), ZHOME_ - ZI_, ZHOME_ + ZI_))
    film = dict(SQ=SQ_, RAD=RAD_, KERF=KERF_, ZI=ZI_, ZM=ZHOME_, ZT=ZG_, cutsA=outc[1], cutsB=outc[0], straight=straight, redoff=round(redoff, 4))
    more = [('rest', rest.astype('<f4').tobytes()), ('kc', kc.tobytes()), ('kd', kd.astype('<f4').tobytes()), ('kf', kf.astype('<f4').tobytes())]
secs, blob = {}, b''
for name, data in [('faces', faces), ('piece', piece.tobytes()), ('sign', sign.tobytes())] + more + [('frames', comp)]:
    pad = (-len(blob)) % 4; blob += b'\0' * pad; secs[name] = [len(blob), len(data)]; blob += data
# chapters for the viewer: what is being woven when, in the order the film plays (the simulation ran backwards)
# each is [seconds, title, text, tag]; the page (src/lib/weave/words.ts) words the step itself, in Danish and English, from the tag
ORD = ['first', 'second', 'third', 'fourth', 'fifth', 'sixth', 'seventh', 'eighth', 'ninth', 'tenth']
ordinal = lambda i: ORD[i] if i < len(ORD) else '%d.' % (i + 1)        # the number itself beyond the words, as the page writes it
def chapter(tag):
    q = tag.split(',')
    if tag == 'start': return 'Bring the two halves together', 'The red strips are folded back out of the way and the red half slides in beside the white one.'
    if q[0] == 'row': return 'Bring the %s red strip over' % ordinal(int(q[1])), 'It swings down from the pile, and the white strips that will go through it are lifted to wait.'
    n, m = int(q[0]), int(q[1])
    if q[2] == 'R': return '%s red strip through the %s white' % (ordinal(n).capitalize(), ordinal(m)), 'The white strip rises a little to meet it, the red end is fed through its loop, and both settle.'
    return '%s white strip through the %s red' % (ordinal(m).capitalize(), ordinal(n)), 'The red strip comes down low over it, the white end is fed through the red loop, and the red strip stands up again.'
chapters = []
if 'labels' in d:
    lab = [str(x) for x in d['labels']]
    lab = lab + [lab[-1]] * (len(d['frames']) + (0) - len(lab)) if len(lab) < len(d['frames']) else lab
    tags = [l.split('|')[0] if '|' in l else '' for l in lab][:len(d['frames'])]
    if bool(d['reverse']) if 'reverse' in d else False: tags = tags[::-1]
    tags = tags[::every]; prev = None
    for i, t in enumerate(tags):
        if t and t != prev: chapters.append([round(i / fps, 2)] + list(chapter(t)) + [t])
        if t: prev = t
    chapters.append([round((nfr - 1) / fps, 2), 'The woven heart', 'Every strip is in place.', 'woven'])
hdr = dict(nv=nv, nf=len(F), nframes=nfr, fps=fps, span=(nfr - 1) / fps, q=Q, min=mn.tolist(), idx=2 if nv < 65536 else 4, sections=secs, chapters=chapters, stats=stats, film=film)
hj = json.dumps(hdr).encode(); hj += b' ' * ((-len(hj)) % 4)
open(out, 'wb').write(b'JHB1' + np.uint32(len(hj)).tobytes() + hj + blob)
print('frames', nfr, 'vertices', nv, 'raw %.1f MB -> packed %.2f MB' % (len(raw) / 1e6, (8 + len(hj) + len(blob)) / 1e6), 'moving coords %.1f%%' % (100 * (deltas[1:] != 0).mean()))
