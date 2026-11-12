"""Take a woven heart apart, crossing by crossing, as simulated paper. Played backwards, that is the weaving.

No hand-made animation is involved: the paper is two real cut sheets (any cut shapes), the only things moved by
"fingers" are the folded ends of strips, and everything else is thin-shell elasticity with intersection-free contact.
Only the free ends of the two strips being handled are simulated at any time; the rest of the heart is held still.

usage: unweave.py DESIGN OUT.npz [--only K] [--area A]      DESIGN = classic3 | classic4 | path/to/juleflet.svg
"""
from scipy.spatial import cKDTree
from scipy.linalg import solveh_banded
from scipy.sparse.csgraph import reverse_cuthill_mckee
import shapely
import sys, time, argparse, re, numpy as np, scipy.sparse as sp, ipctk, triangle
import scipy.sparse.linalg as spla
try: import pypardiso
except Exception: pypardiso = None        # optional: only used for the rare system that is not a narrow band
from shapely.geometry import LineString, Point, Polygon, box
from shapely.ops import unary_union
from shapely.affinity import affine_transform
from shapely import prepared
from cutmesh import load_cuts

ap = argparse.ArgumentParser()
ap.add_argument('design'); ap.add_argument('out'); ap.add_argument('--only', type=int, default=0); ap.add_argument('--iters', type=int, default=7); ap.add_argument('--resume', default=''); ap.add_argument('--pinch', type=float, default=1.0); ap.add_argument('--hand', type=int, default=1); ap.add_argument('--nocheck', action='store_true'); ap.add_argument('--stop', type=int, default=0); ap.add_argument('--dry', action='store_true'); ap.add_argument('--rbend', type=float, default=0.07); ap.add_argument('--curl', type=float, default=0.4); ap.add_argument('--curlb', type=float, default=0.0); ap.add_argument('--force', action='store_true')
ap.add_argument('--area', type=float, default=0.02); ap.add_argument('--q', type=int, default=12); ap.add_argument('--margin', type=float, default=0.0); ap.add_argument('--ks', type=float, default=1200.0); ap.add_argument('--aniso', type=float, default=2.4); ap.add_argument('--fps', type=int, default=15)
A_ = ap.parse_args()

SQ, RAD = 3.0, 1.5
WID = SQ - A_.margin      # each half is cut a little narrower than its strips are long, so a strip can bend up at its root clear of the other half
KERF, ZI, ZO, ZG = 0.02, 0.012, 0.036, -0.052      # slit width, half-gap of an inner / outer strip, table height
DHAT, KAPPA = 0.008, 3.0
KS, KB, DRAG, GRAV = A_.ks, 0.12, 40.0, 0.006      # KS: how hard the paper resists stretching; kept low on purpose, the paper may give a little like rubber   # GRAV: weight per square inch, enough to make a free strip sag a little
ZHOME = ZG + 0.008 + ZI                            # height of a strip end lying on the table
KF, D0 = 500.0, 0.05                               # a finger: a firm spring on each vertex it holds, whose pull stops growing beyond D0
TIPL, LIFT, DELTA, ALPHA, RBEND = 0.2, 0.07, 0.14, np.radians(105), A_.rbend     # ALPHA: a held strip leans back over the part already woven, so nothing drapes on it
SPEED = 1.3                                        # inches per second for a finger

# ---------------------------------------------------------------- design
def design(spec):
    if spec.startswith('classic'):
        n = int(spec[7:] or 3); cuts = [np.array([[0, WID * k / n], [SQ, WID * k / n]]) for k in range(1, n)]
        return {'A': cuts, 'B': [c.copy() for c in cuts]}, 0
    txt = open(spec).read(); mm = re.search(r'data-weave-parity="(\d+)"', txt)
    cuts = load_cuts(spec)
    for k in cuts:
        for c in cuts[k]: c[:, 1] *= WID / SQ
    return cuts, int(mm.group(1)) if mm else 0
CUTS, PAR = design(A_.design)
swap = lambda g: affine_transform(g, [0, 1, 1, 0, 0, 0])
def slits_of(cuts):
    return unary_union([LineString(np.vstack([[c[0, 0] - 0.2, c[0, 1]], c])).buffer(KERF / 2, cap_style='round', join_style='round', quad_segs=2) for c in cuts])
from shapely.affinity import scale as _scale
outline = box(0, 0, SQ, WID).union(_scale(Point(SQ, WID / 2).buffer(1.0, quad_segs=24), RAD, WID / 2)).intersection(box(0, 0, SQ + RAD, WID))
SL = {1: slits_of(CUTS['A']), 0: slits_of(CUTS['B'])}
POLY = {k: outline.difference(SL[k]).simplify(0.004) for k in (0, 1)}
def strips_of(k):
    parts = POLY[k].intersection(box(0, 0, SQ, SQ)); parts = list(parts.geoms) if hasattr(parts, 'geoms') else [parts]
    parts = [p for p in parts if p.area > 0.01]
    return sorted(parts, key=lambda g: -g.centroid.y)
STRIPS = {k: strips_of(k) for k in (0, 1)}
NA, NB = len(STRIPS[1]), len(STRIPS[0])
if not (NA == len(CUTS['A']) + 1 and NB == len(CUTS['B']) + 1): sys.exit('NOT SUPPORTED YET: %d and %d cuts give %d and %d pieces; the cuts touch, cross or do not run from the fold to the lobe' % (len(CUTS['A']), len(CUTS['B']), NA, NB))
OTH = {k: [swap(g) for g in STRIPS[1 - k]] for k in (0, 1)}            # the other half's strips, in this half's own axes
def closing(gs): return unary_union(gs).buffer(0.035, join_style='mitre').buffer(-0.035, join_style='mitre') if gs else Polygon()
ROOTM = box(WID - 0.03, -1, SQ + 0.001, 4)             # the bit of each strip between the other half's edge and its own lobe
FIX = {k: [prepared.prep((closing(OTH[k][:i] + [ROOTM]) if i else Polygon()).buffer(1e-4, join_style='mitre')) for i in range(len(OTH[k]) + 1)] for k in (0, 1)}

WELD = 0.004
def half(isA):
    poly = POLY[isA]; bands = swap(SL[1 - isA]).intersection(box(0, 0, SQ, SQ)).simplify(0.004)
    fine = [LineString([(SQ - d, -1), (SQ - d, 4)]).intersection(poly) for d in (0.03, 0.06, 0.1, 0.15)]     # close rows where a strip bends up at its root
    # everything onto a fine grid before meshing: curved cuts of the two halves cross at shallow angles, and the slivers between nearly coincident
    # points otherwise become triangles thousands of times smaller than the rest, which lock the paper up
    poly = shapely.set_precision(poly, WELD); bands = shapely.set_precision(bands, WELD)
    # the other half's cut lines are drawn into this half's mesh, except right along this half's own cuts (the two can share a curve): there they
    # would only make slivers, and no strip changes sides there anyway
    lines = bands.boundary.intersection(poly); near = lines.intersection(SL[isA].buffer(0.008))
    along = [g for g in (near.geoms if hasattr(near, 'geoms') else [near]) if g.length > 0.06]          # running along a cut, not just crossing it
    if along: lines = lines.difference(unary_union(along).buffer(1e-4))
    noded = shapely.unary_union([poly.boundary, lines] + fine, grid_size=WELD)
    idx, V, S = {}, [], []; AN = A_.aniso
    def vid(p):
        key = (round(p[0], 6), round(p[1], 6))
        if key not in idx: idx[key] = len(V); V.append(key)
        return idx[key]
    for g in (noded.geoms if hasattr(noded, 'geoms') else [noded]):
        c = [(p[0] * AN, p[1]) for p in g.coords]
        for a, b in zip(c[:-1], c[1:]):
            i, j = vid(a), vid(b)
            if i != j: S.append((i, j))
    t = triangle.triangulate(dict(vertices=np.array(V, float), segments=np.array(S)), 'pq%da%%.5f' % A_.q % A_.area)
    V2, F2 = t['vertices'].copy(), t['triangles'].astype(np.int64); V2[:, 0] /= AN
    pp = prepared.prep(poly.buffer(1e-7)); keep = np.array([pp.contains(Point(c)) for c in V2[F2].mean(1)])
    F2 = F2[keep]; used = np.unique(F2); remap = -np.ones(len(V2), int); remap[used] = np.arange(len(used))
    return V2[used], remap[F2]

# ---------------------------------------------------------------- mesh: two layers per half, joined along the fold
t_build = time.time()
P_, S_, V_, PIECE, SIGN, OWN, RANK, LEV, Fs, crease, restE, hinges = [], [], [], [], [], [], [], [], [], set(), {}, []
nv = 0; ON = []
level = lambda isA, k, j: ZI if ((((k + j + PAR) & 1) == 0) == bool(isA)) else ZO      # of strip k of a half where it lies on strip j of the other
for isA in (1, 0):
    V2, F2 = half(isA); n = len(V2); onf = V2[:, 0] < 1e-7
    own = -np.ones(n, int); lev = np.full(n, ZI); rank = np.zeros(n, int); on = [set() for _ in range(n)]
    mine = [prepared.prep(g.buffer(1.8 * WELD)) for g in STRIPS[isA]]; oth = [prepared.prep(g.buffer(WELD)) for g in OTH[isA]]
    # which strip of the other half each triangle lies on. A point on the edge of its own strip takes its height from the triangles it belongs to,
    # not from where the point itself is: where cuts of the two halves run along the same curve (a ring made of arcs from both), the point is on
    # the border between two strips of the other half, but its paper is on one side only
    exact = [prepared.prep(g) for g in OTH[isA]]; votes = [set() for _ in range(n)]
    for f in F2:
        c = Point(V2[f].mean(0))
        for j, g in enumerate(exact):
            if g.contains(c):
                for v in f: votes[v].add(j)
                break
    for i in range(n):
        p = Point(V2[i]);
        if V2[i, 0] <= SQ + 1e-9:
            for k, g in enumerate(mine):
                if g.contains(p): own[i] = k; break
        r = len(oth)
        for q in range(1, len(oth) + 1):
            if FIX[isA][q].contains(p): r = q - 1; break
        rank[i] = r
        if own[i] >= 0:
            hit = sorted(votes[i]) or [j for j, g in enumerate(oth) if g.contains(p)]
            on[i] = set(hit); lev[i] = np.mean([level(isA, own[i], j) for j in hit]) if hit else (ZI + ZO) / 2
    dirE = {}
    for f in F2:
        for a in range(3): dirE[(int(f[a]), int(f[(a + 1) % 3]))] = int(f[(a + 2) % 3])
    fe = [e for e in dirE if (e[1], e[0]) not in dirE and onf[e[0]] and onf[e[1]]]
    ids = sorted({v for e in fe for v in e}); mid = {v: 2 * n + i for i, v in enumerate(ids)}
    W = []
    for a, b in fe: W += [(b, a, mid[a]), (b, mid[a], mid[b]), (mid[b], mid[a], a + n), (mid[b], a + n, b + n)]
    Fs.append(np.vstack([F2, F2[:, ::-1] + n, np.array(W, np.int64).reshape(-1, 3)]) + nv)
    nm = len(ids)
    P_ += [isA] * (2 * n + nm); SIGN_l = [-1] * n + [1] * n + [0] * nm; SIGN += SIGN_l
    S_ += list(V2[:, 0]) * 2 + [0.0] * nm; V_ += list(V2[:, 1]) * 2 + [V2[v, 1] for v in ids]
    OWN += list(own) * 2 + [own[v] for v in ids]; RANK += list(rank) * 2 + [len(oth)] * nm; LEV += list(lev) * 2 + [lev[v] for v in ids]; ON += on * 2 + [on[v] for v in ids]
    crease |= {nv + v for v in ids} | {nv + v + n for v in ids} | {nv + m for m in mid.values()}
    cot = lambda a, b: np.dot(a, b) / (abs(a[0] * b[1] - a[1] * b[0]) + 1e-12)
    for (i, j), o in dirE.items():
        L = float(np.linalg.norm(V2[i] - V2[j])); restE[tuple(sorted((nv + i, nv + j)))] = L; restE[tuple(sorted((nv + n + i, nv + n + j)))] = L
        if i < j and (j, i) in dirE and not (onf[i] or onf[j] or onf[o] or onf[dirE[(j, i)]]):
            o2 = dirE[(j, i)]; x0, x1, x2, x3 = V2[i], V2[j], V2[o], V2[o2]
            e0, e1, e2, e3, e4 = x1 - x0, x2 - x0, x3 - x0, x2 - x1, x3 - x1
            K = np.array([cot(-e0, e3) + cot(-e0, e4), cot(e0, e1) + cot(e0, e2), -cot(e0, e1) - cot(-e0, e3), -cot(e0, e2) - cot(-e0, e4)])
            Ar = 0.5 * abs(e0[0] * e1[1] - e0[1] * e1[0]) + 0.5 * abs(e0[0] * e2[1] - e0[1] * e2[0]); Q = 3.0 / Ar * np.outer(K, K)
            for off in (0, n): hinges.append((np.array([i, j, o, o2]) + nv + off, Q))
    nv += 2 * n + nm
NP = nv                                                                 # paper vertices; the table comes after
F = np.vstack(Fs).astype(np.int32)
PIECE, SIGN, S_, V_, OWN, RANK, LEV = map(np.array, (P_, SIGN, S_, V_, OWN, RANK, LEV))
# the welding grid can put a point of each half on the same spot (the corners of slits, mostly). The two must then lie at different heights,
# the right one on top: a point whose own triangles all lie elsewhere also counts the strip it meets there among those it lies on
spot = {}
for k in np.where((PIECE == 0) & (OWN >= 0))[0]: spot.setdefault((round(V_[k] * 1e6), round(S_[k] * 1e6), SIGN[k]), []).append(k)
for i in np.where((PIECE == 1) & (OWN >= 0))[0]:
    for k in spot.get((round(S_[i] * 1e6), round(V_[i] * 1e6), SIGN[i]), []):
        if (LEV[i] - LEV[k]) * (level(1, OWN[i], OWN[k]) - level(0, OWN[k], OWN[i])) > 1e-9: continue
        for v, isA, j in ((i, 1, OWN[k]), (k, 0, OWN[i])): ON[v] = ON[v] | {j}; LEV[v] = np.mean([level(isA, OWN[v], j) for j in ON[v]])
for isA in (1, 0):
    lob = np.where((PIECE == isA) & (OWN < 0) & (S_ < SQ + 0.4))[0]; root = np.where((PIECE == isA) & (OWN >= 0) & (S_ > SQ - 0.12) & (SIGN != 0))[0]
    # a point of the lobe follows the strip root nearest to it on its own side of the cuts (their last stretch, drawn on a little into the
    # lobe): where a cut reaches the lobe at a slant, a corner of the slit's end lies nearer, across, to the strip on the other side, and
    # the lobe would twist through the other half's edge there
    ends = [LineString([*c[max(0, min(len(c) - 2, int(np.argmax(c[:, 0] > SQ - 0.2)))):], c[-1] + 0.3 * (c[-1] - c[-2]) / np.linalg.norm(c[-1] - c[-2])]) for c in CUTS['A' if isA else 'B']]
    for i in lob:
        near = root[np.argsort(np.abs(V_[root] - V_[i]) + 0.2 * np.abs(S_[root] - SQ), kind='stable')[:12]]
        j = next((j for j in near if not any(LineString([(S_[i], V_[i]), (S_[j], V_[j])]).intersects(e) for e in ends)), near[0])
        u = np.clip((S_[i] - SQ - 0.1) / 0.28, 0, 1); LEV[i] = LEV[j] + (ZI - LEV[j]) * u * u * (3 - 2 * u)
X = np.zeros((NP, 3))
isA_ = PIECE == 1
X[:, 0] = np.where(isA_, S_, V_); X[:, 1] = np.where(isA_, V_, S_); X[:, 2] = SIGN * LEV
mids = SIGN == 0
X[mids & isA_, 0] = -0.6 * LEV[mids & isA_]; X[mids & ~isA_, 1] = -0.6 * LEV[mids & ~isA_]
table = np.array([[-3, -3, ZG], [7, -3, ZG], [7, 7, ZG], [-3, 7, ZG]], float)
X = np.vstack([X, table]); FT = np.array([[NP, NP + 1, NP + 2], [NP, NP + 2, NP + 3]], np.int32)
FALL = np.vstack([F, FT]); N = len(X)
E = ipctk.edges(FALL)
L0 = np.array([restE.get(tuple(sorted((int(a), int(b)))), -1.0) for a, b in E]); L0[L0 < 0] = np.linalg.norm(X[E[L0 < 0, 0]] - X[E[L0 < 0, 1]], axis=1)
HI = np.array([h[0] for h in hinges]); HQ = np.array([h[1] for h in hinges])
ar3 = 0.5 * np.linalg.norm(np.cross(X[F[:, 1]] - X[F[:, 0]], X[F[:, 2]] - X[F[:, 0]]), axis=1)
AREA = np.zeros(N); np.add.at(AREA, F.ravel(), np.repeat(ar3 / 3, 3))
print('%s: %d x %d strips, parity %d, %d vertices, %d triangles, mesh built in %.1f s' % (A_.design, NA, NB, PAR, NP, len(F), time.time() - t_build), flush=True)
_P = X[F]; _ar = 0.5 * np.linalg.norm(np.cross(_P[:, 1] - _P[:, 0], _P[:, 2] - _P[:, 0]), axis=1); print('smallest triangle %.1e, shortest edge %.4f, triangles under 1e-6: %d' % (_ar.min(), np.linalg.norm(X[E[:, 0]] - X[E[:, 1]], axis=1).min(), int((_ar < 1e-6).sum())), flush=True)
GMESH = ipctk.CollisionMesh(X, E, FALL); START_OK = not ipctk.has_intersections(GMESH, X); print('finished weave free of intersections:', START_OK, flush=True)
if not START_OK and not A_.resume and not A_.force:
    sys.exit('NOT SUPPORTED YET: the finished weave of this design could not be laid out without paper passing through paper (--force to run anyway)')
if A_.dry: sys.exit(0)        # only read the design, build the mesh and check the finished weave

# ---------------------------------------------------------------- local problem: the free ends in play plus whatever is near them

# ---------------------------------------------------------------- pinching: a strip with knobs is held narrower while it is threaded
# (as fingers curl such a strip to get it through a loop; here the paper simply gives sideways, like rubber, and springs back when let go)
L0B = L0.copy(); CF = np.ones(N); VC, CMIN, EK, SQZ, KNOB = {}, {}, {}, {}, {}
for isA in (1, 0):
    for k, g in enumerate(STRIPS[isA]):
        ids = np.where((PIECE == isA) & (OWN == k))[0]; vc = g.centroid.y; hc = g.area / SQ / 2; hmax = np.abs(V_[ids] - vc).max()
        KNOB[(isA, k)] = hmax >= hc + 0.03; VC[(isA, k)] = vc; CMIN[(isA, k)] = 1.0 if hmax < hc + 0.03 or A_.pinch <= 0 else 1 - A_.pinch * (1 - max(0.45, (hc - 0.03) / hmax))
        inb = np.zeros(N, bool); inb[ids] = True; EK[(isA, k)] = np.where(inb[E[:, 0]] & inb[E[:, 1]])[0]
print('strips are pinched to %s of their width while threaded' % sorted({round(float(c), 2) for c in CMIN.values()}), flush=True)
def squeeze(isA, k, c, La):
    """set how narrow strip (isA, k) is held: factor c over its free end (the first La from its fold), easing back to full width where it is still woven"""
    ids = np.where((PIECE == isA) & (OWN == k))[0]; vc = VC[(isA, k)]
    CF[ids] = 1 + (c - 1) * sm((La - 0.04 - S_[ids]) / 0.2); SQZ[(isA, k)] = (float(c), float(La))
    ek = EK[(isA, k)]; a, b = E[ek, 0], E[ek, 1]; dv = V_[a] - V_[b]; dn = CF[a] * (V_[a] - vc) - CF[b] * (V_[b] - vc)
    L0[ek] = np.sqrt(np.maximum(L0B[ek] ** 2 - dv ** 2 + dn ** 2, 1e-10))

def tuck(isA, k, La, lo, hi, amount, Xg):
    """the narrowing only where it cannot be seen and is needed: on the part of strip (isA, k) that is inside the loop it is being threaded through
    (between lo and hi along the strip's direction, low over the table) and a little either side; what stands free in the air keeps its full shape"""
    ids = np.where((PIECE == isA) & (OWN == k))[0]; p = Xg[ids, 0 if isA else 1]; z = Xg[ids, 2]
    w = sm((p - lo + 0.3) / 0.3) * sm((hi + 0.3 - p) / 0.3) * sm((0.4 - z) / 0.3) * sm((La - 0.04 - S_[ids]) / 0.2)
    c = 1 + (CMIN[(isA, k)] - 1) * amount * w; CF[ids] = c if amount <= 0 else CF[ids] + 0.6 * (c - CF[ids])
    vc = VC[(isA, k)]; ek = EK[(isA, k)]; a, b = E[ek, 0], E[ek, 1]; dv = V_[a] - V_[b]; dn = CF[a] * (V_[a] - vc) - CF[b] * (V_[b] - vc)
    L0[ek] = np.sqrt(np.maximum(L0B[ek] ** 2 - dv ** 2 + dn ** 2, 1e-10))

CAP = 0.2; ACCD = ipctk.AdditiveCCD()
# ---------------------------------------------------------------- magic: when a strip is caught and cannot get where it has to go, it is allowed
# to pass through paper (it stops counting as an obstacle, and nothing is an obstacle to it) until it is clear of everything again
GHOST = np.zeros(N, bool); GSTRIPS = {}
def ghost(isA, k, idx, why):
    if (isA, k) not in GSTRIPS: print('    (%s strip %d %s: passed through by magic)' % ('red' if isA else 'white', k + 1, why), flush=True); stats['magic'] = stats.get('magic', 0) + 1
    m = GSTRIPS.get((isA, k), np.zeros(N, bool)) | free_end(isA, k, idx); GSTRIPS[(isA, k)] = m; GHOST[:] |= m
def rejoin():
    for q in list(GSTRIPS):
        rest = np.zeros(N, bool)
        for r_ in GSTRIPS:
            if r_ != q: rest |= GSTRIPS[r_]
        Fs = FALL[~rest[FALL].any(1)]
        if not ipctk.has_intersections(ipctk.CollisionMesh(X, ipctk.edges(Fs), Fs), X): del GSTRIPS[q]
    GHOST[:] = False
    for q in GSTRIPS: GHOST[:] |= GSTRIPS[q]
class Local:
    """the part of the paper that can move right now (the free ends in play), with just the still paper close enough to touch it this frame"""
    def __init__(self, X, active, R=0.3):
        act = active[:NP]; ai = np.where(act)[0]; si = np.where(~act)[0]
        P = X[FALL]; cen = P.mean(1); rad = np.linalg.norm(P - cen[:, None], axis=2).max(1)       # a still triangle counts as close if any point of it could be
        fk = active[FALL].any(1) | (FALL >= NP).all(1); cand = np.where(~fk)[0]
        d, _ = cKDTree(X[ai]).query(cen[cand], distance_upper_bound=R + rad[cand].max()); fk[cand[d <= R + rad[cand]]] = True
        ek = active[E].any(1); hk = active[HI].any(1)
        S = np.zeros(N, bool); S[FALL[fk].ravel()] = True; S[E[ek].ravel()] = True; S[HI[hk].ravel()] = True
        self.ids = np.where(S)[0]; g2l = -np.ones(N, int); g2l[self.ids] = np.arange(len(self.ids)); self.g2l = g2l
        self.F = g2l[FALL[fk]].astype(np.int32)
        self.e0, self.e1 = g2l[E[ek, 0]], g2l[E[ek, 1]]; self.L0 = L0[ek]
        hi_, hq = g2l[HI[hk]], HQ[hk]; n = len(self.ids); self.n = n
        I = np.repeat(hi_[:, :, None], 4, axis=2).ravel(); J = np.repeat(hi_[:, None, :], 4, axis=1).ravel()
        self.Q3 = (sp.kron(sp.coo_matrix((hq.ravel(), (I, J)), shape=(n, n)).tocsr(), sp.identity(3)) * KB).tocsr()
        self.barrier = ipctk.BarrierPotential(DHAT, KAPPA, True); gh = GHOST[self.ids]
        if gh.any():                            # paper passing through by magic takes no part in collisions
            self.cx = np.where(~gh)[0]; cm = -np.ones(n, int); cm[self.cx] = np.arange(len(self.cx)); Fc = cm[self.F[(~gh[self.F]).all(1)]].astype(np.int32)
            self.mesh = ipctk.CollisionMesh(X[self.ids][self.cx], ipctk.edges(Fc), Fc); nc = len(self.cx)
            self.Pm = sp.csr_matrix((np.ones(3 * nc), ((3 * self.cx[:, None] + np.arange(3)).ravel(), np.arange(3 * nc))), shape=(3 * n, 3 * nc))
        else: self.cx = None; self.mesh = ipctk.CollisionMesh(X[self.ids], ipctk.edges(self.F), self.F)
        self.act = active[self.ids]; self.drag = np.repeat(DRAG * AREA[self.ids] + 1e-6, 3); self.w = GRAV * AREA[self.ids] * self.act
        a3 = np.arange(3); e0, e1 = self.e0, self.e1
        r0 = np.repeat(3 * e0[:, None] + a3, 3, axis=1).ravel(); r1 = np.repeat(3 * e1[:, None] + a3, 3, axis=1).ravel()
        c0 = np.tile(3 * e0[:, None] + a3, (1, 3)).ravel(); c1 = np.tile(3 * e1[:, None] + a3, (1, 3)).ravel()
        self.rows = np.concatenate([r0, r1, r0, r1]); self.cols = np.concatenate([c0, c1, c1, c0])

    def energy(self, Xc, xp, soft, hess):
        Xm = Xc if self.cx is None else Xc[self.cx]; col = ipctk.NormalCollisions(); col.build(self.mesh, Xm, DHAT)
        d = Xc[self.e0] - Xc[self.e1]; l = np.linalg.norm(d, axis=1); nrm = d / l[:, None]
        x = Xc.ravel(); qb = self.Q3 @ x; dp = x - xp.ravel()
        Et = 0.5 * KS * np.sum((l - self.L0) ** 2) + 0.5 * x @ qb + 0.5 * np.sum(self.drag * dp * dp) + self.barrier(col, self.mesh, Xm) + np.sum(self.w * Xc[:, 2])
        ids, tg, wt = soft
        if len(ids):
            dv = Xc[ids] - tg; r = np.linalg.norm(dv, axis=1); far = r > D0
            Et += KF * np.sum(wt * np.where(far, D0 * (r - D0 / 2), 0.5 * r * r)); sc = wt * np.where(far, D0 / np.maximum(r, 1e-12), 1.0)
        if not hess: return Et, None, None
        f = KS * (l - self.L0)[:, None] * nrm
        g = np.zeros_like(Xc); np.add.at(g, self.e0, f); np.add.at(g, self.e1, -f)
        dg = self.drag.copy()
        if len(ids): g[ids] += KF * sc[:, None] * dv; np.add.at(dg, (3 * ids[:, None] + np.arange(3)).ravel(), np.repeat(KF * sc, 3))
        g[:, 2] += self.w
        gb = self.barrier.gradient(col, self.mesh, Xm); Hb = self.barrier.hessian(col, self.mesh, Xm, ipctk.PSDProjectionMethod.CLAMP)
        if self.cx is not None: gb = self.Pm @ gb; Hb = self.Pm @ Hb @ self.Pm.T
        g = g.ravel() + qb + self.drag * dp + gb
        c = np.maximum(0.0, 1 - self.L0 / l)
        b = (KS * (c[:, None, None] * (np.eye(3)[None] - nrm[:, :, None] * nrm[:, None, :]) + nrm[:, :, None] * nrm[:, None, :])).ravel()
        Hs = sp.coo_matrix((np.concatenate([b, b, -b, -b]), (self.rows, self.cols)), shape=(3 * self.n, 3 * self.n)).tocsr()
        return Et, g, (Hs + self.Q3 + sp.diags(dg) + Hb).tocsr()

    def solve(self, A, b):
        """strips are long and narrow, so numbered along their length the system is a narrow band: much quicker than a general sparse solve"""
        n = A.shape[0]
        if getattr(self, 'perm', None) is None or len(self.perm) != n: self.perm = reverse_cuthill_mckee(A, symmetric_mode=True)
        p = self.perm; B = A[p][:, p].tocoo(); bw = int(np.abs(B.row - B.col).max())
        if n * bw * bw < 2.5e9:
            ab = np.zeros((bw + 1, n)); m = B.row >= B.col; ab[B.row[m] - B.col[m], B.col[m]] = B.data[m]
            try:
                x = np.empty(n); x[p] = solveh_banded(ab, b[p], lower=True, check_finite=False, overwrite_ab=True); return x
            except np.linalg.LinAlgError: pass
        return pypardiso.spsolve(A, b) if pypardiso is not None else spla.spsolve(A.tocsc(), b)

    def step(self, Xc, soft, iters=A_.iters, cap=None):
        """let the paper follow the fingers: Newton steps that never take paper through paper"""
        fd = np.where(np.repeat(self.act, 3))[0]; xp = Xc.copy(); its = 0
        for it in range(iters):
            E0, g, Hm = self.energy(Xc, xp, soft, True)
            d = np.zeros(3 * self.n); d[fd] = self.solve(Hm[fd][:, fd], -g[fd]); D3 = d.reshape(-1, 3)
            if not np.isfinite(d).all(): sys.exit('the paper has no next step (the solve gave no numbers): a strip is not where the weaving expects it')
            Xa, Xb = (Xc, Xc + D3) if self.cx is None else (Xc[self.cx], (Xc + D3)[self.cx])
            a = ipctk.compute_collision_free_stepsize(self.mesh, Xa, Xb, narrow_phase_ccd=ACCD); a = 1.0 if a >= 1 else 0.95 * a
            for _ in range(8):                  # never further in one go than the still paper around was gathered for
                if np.linalg.norm(Xc + a * D3 - xp, axis=1).max() <= (cap or CAP): break
                a *= 0.6
            for _ in range(10):
                if self.energy(Xc + a * D3, xp, soft, False)[0] <= E0 + 1e-12: break
                a *= 0.5
            Xc = Xc + a * D3; its += 1
            if np.abs(a * D3).max() < 4e-4: break
        return Xc, its

# ---------------------------------------------------------------- fingers
sm = lambda u: (lambda t: t * t * (3 - 2 * t))(np.clip(u, 0, 1))
UP = np.array([0, 0, 1.0])
def strip_mask(isA, k): return np.r_[(PIECE == isA) & (OWN == k), np.zeros(4, bool)]
def free_end(isA, k, idx): return np.r_[(PIECE == isA) & (OWN == k) & (RANK >= idx), np.zeros(4, bool)]
def free_len(isA, k, idx):
    """how far from its fold strip (isA, k) is free all the way across, once undone back to crossing idx. Where the other half's cut is curved, the last
    woven crossing reaches further along the strip in some places than in others; the strip can only bend up along a straight line short of all of it"""
    st = (PIECE == isA) & (OWN == k) & (RANK < idx) & (SIGN != 0)
    return float(S_[st].min()) if st.any() else float(S_[(PIECE == isA) & (OWN == k)].max())
def tip_ids(isA, k): return np.where(np.r_[(PIECE == isA) & (OWN == k) & (S_ < TIPL), np.zeros(4, bool)])[0]
def axes(isA): return (np.array([1.0, 0, 0]), np.array([0, 1.0, 0])) if isA else (np.array([0, 1.0, 0]), np.array([1.0, 0, 0]))   # toward the root, across

def tip_frame(X, isA, k):
    """where the folded end of a strip is and which way it points (toward its own root)"""
    ids = tip_ids(isA, k); lay = ids[SIGN[ids] != 0]; r, a = axes(isA)
    near, far = lay[S_[lay] < TIPL / 2], lay[S_[lay] >= TIPL / 2]
    t = X[far].mean(0) - X[near].mean(0); t -= a * (t @ a); t /= np.linalg.norm(t)
    c = X[lay].mean(0); P = c - t * S_[lay].mean()
    return P, t

class Block:
    """a stretch of a strip (by default its folded end) held as a rigid piece between two fingers"""
    def __init__(self, X, isA, k, s0=None, s1=None):
        r, self.a = axes(isA)
        self.s1 = s1
        if s0 is None: self.ids = tip_ids(isA, k); self.s0 = 0.0; P, t = tip_frame(X, isA, k)
        else:
            self.ids = np.where((PIECE == isA) & (OWN == k) & (SIGN != 0) & (S_ >= s0) & (S_ <= s1))[0]; self.s0 = s0; mid_ = (s0 + s1) / 2
            near, far = self.ids[S_[self.ids] < mid_], self.ids[S_[self.ids] >= mid_]
            t = X[far].mean(0) - X[near].mean(0); t -= self.a * (t @ self.a); t /= np.linalg.norm(t); P = X[self.ids].mean(0) - t * (S_[self.ids].mean() - s0)
        self.P, self.t = P, t; self.vc = VC[(isA, k)]; self.sgn = 1.0 if isA else -1.0
    def at(self, P, t):
        """where the held paper goes: flat between the fingers in its own (possibly pinched) shape, whatever state it was picked up in"""
        t = t / np.linalg.norm(t); n = np.cross(t, self.a); ids = self.ids; lay = SIGN[ids] != 0
        w = CF[ids] * (V_[ids] - self.vc); along = np.where(lay, S_[ids], -0.6 * ZI) - self.s0
        return P + np.outer(along, t) + np.outer(w - w[lay].mean(), self.a) + np.outer(self.sgn * SIGN[ids] * ZI, n)

def trail(X, isA, k, idx):
    """the centre line of a strip's free end, by distance from its fold"""
    m = free_end(isA, k, idx)[:NP] & (SIGN != 0); s = S_[m]; La = s.max(); nb = max(4, int(La / 0.07)); edges_ = np.linspace(0, La, nb + 1)
    ss, C = [], []
    for i in range(nb):
        q = (s >= edges_[i]) & (s <= edges_[i + 1])
        if q.sum() >= 2: ss.append(s[q].mean()); C.append(X[:NP][m][q].mean(0))
    return np.array(ss), np.array(C), La

def extract_path(X, isA, k, idx, nfr, end=None, lift=LIFT):
    """slide the end of a strip back along its own length until it is out of the loop it was in, rising over what lies behind it"""
    ss, C, La = trail(X, isA, k, idx); r, a = axes(isA); P0, t0 = tip_frame(X, isA, k); Lm = min(La, WID)
    def pt(sig):
        if sig <= ss[0]: p = P0 + t0 * sig
        elif sig <= ss[-1]: p = np.array([np.interp(sig, ss, C[:, j]) for j in range(3)])
        else: p = C[-1] + r * (sig - ss[-1])
        p = p.copy(); p[2] += 0.012 * sm(sig / 0.15) + (lift - 0.012) * sm((sig + TIPL - Lm) / 0.2)   # a hair's lift at once, so the slack rises into a loop; the real lift only as the end leaves the mouth of the loop
        return p
    out = []
    for f in range(1, nfr + 1):
        sig = sm(f / nfr) * (end if end is not None else La + DELTA); p = pt(sig); t = pt(sig + 0.12) - pt(sig - 0.02 if sig > 0.02 else sig)
        t = t / np.linalg.norm(t); t[2] += 0.12 * np.sin(np.pi * min(1.0, sig / 0.5))      # the end tips up slightly while it starts to move
        out.append((p, t))
    return out, La

CURL, CURLB = A_.curl, A_.curlb      # how much further round the end of a held strip is than its base (as a share of its angle), and how much of that is taken off the base
def shape(La, alpha):
    """the side view of a held strip, from where it leaves the weave (u = 0) to its end (u = La): it turns up in a tight bend, because the strip it
    has just come out of lies right beside it, and from there it is not a straight board but curves gently on, further back over the woven part the
    further up it goes; it leaves the bend at the angle alpha. -> u -> (distance along the table away from the root, height, angle)"""
    dl = min(CURL * alpha, max(0.0, np.radians(170) - alpha)); ab = alpha - CURLB * dl; n = 96; us = np.linspace(0, max(La, 1e-6), n + 1); u0 = RBEND * ab
    th = np.minimum(us / RBEND, ab) + dl * np.clip((us - u0) / max(La - u0, 1e-6), 0, 1)
    thm = (th[1:] + th[:-1]) / 2; du = np.diff(us); al = np.r_[0, np.cumsum(np.cos(thm) * du)]; hi = np.r_[0, np.cumsum(np.sin(thm) * du)]
    return lambda u: (np.interp(u, us, al), np.interp(u, us, hi), np.interp(u, us, th))
def leaving(isA, k, La):
    """the points of a strip where it leaves the weave, at La along it. A strip with straight sides has no points just there (the mesh is
    coarser than the first reach), so the reach grows until it holds some"""
    lay = free_end(isA, k, 0)[:NP] & (SIGN != 0) & (S_ < La + 0.15); w = 0.02
    while not (lay & (S_ > La - w)).any() and w < SQ: w *= 2
    return lay & (S_ > La - w)
def hover(isA, k, La, alpha, X, s0=0.0, slack=0.97, s1=None):
    """where a held stretch of a strip (from s0 to s1 along it; by default its folded end) is when the strip is held up at the angle alpha:
    the point at s0 and the direction toward the root"""
    r, a = axes(isA); m = leaving(isA, k, La)
    Apt = X[:NP][m].mean(0); Apt = Apt + r * (La - S_[m].mean()); Apt[2] = ZHOME * sm(1 - alpha / 0.5)
    up = np.array([0, 0, 1.0]); d = -r; sh = shape(La, alpha)
    def at(s):
        al, hi, th = sh(max(La - s, 0.0) * slack); return Apt + d * al + up * hi
    p0 = at(s0); p1 = at(s0 + TIPL if s1 is None else s1); t = p1 - p0
    return p0, t / np.linalg.norm(t)

def pose(isA, k, La, alpha, wt=0.12, yaw=0.0, roll=0.0, smin=None):
    """every point of a strip's free end where it would be if the strip were stiff paper, bent up by alpha where it leaves the weave and straight
    beyond: a light hand along the whole strip, so that it keeps the shape of paper rather than of cloth. yaw swings the end a little to the side
    (away from what is already woven), roll tilts up the edge that faces its own lobe; both come on gradually away from the weave."""
    r, a = axes(isA); ids = np.where((PIECE == isA) & (OWN == k) & (S_ < La - 0.02) & ((S_ >= smin) if smin is not None else True))[0]; lay = SIGN[ids] != 0
    m = leaving(isA, k, La)
    Apt = X[:NP][m].mean(0) + r * (La - S_[m].mean()); base = Apt - a * (Apt @ a); base[2] = ZHOME * sm(1 - alpha / 0.5)
    d = -r; u = La - np.where(lay, S_[ids], -0.6 * ZI); al_, hi_, phi = shape(La, alpha)(u * 0.97)
    vc = VC[(isA, k)]; w = CF[ids] * (V_[ids] - vc); off = SIGN[ids] * ZI; g = sm(u / 0.5); ro = roll * g
    along = al_ - off * np.sin(phi); up = hi_ + off * np.cos(phi)
    tg = base + np.outer(along, d) + np.outer(up + w * np.sin(ro), UP) + np.outer(vc + w * np.cos(ro) - along * np.sin(yaw) * g, a)
    return ids, tg, np.full(len(ids), wt)
def swing(isA, k, La, a0, a1, wt=0.12, ramp=False, yaw=(0.0, 0.0), roll=(0.0, 0.0)):
    """the same light hand, following the strip as it is swung from a0 to a1 (or coming on gradually at a1)"""
    if ramp: return lambda f, nfr: pose(isA, k, La, a1, wt * sm((f + 1) / nfr), yaw[1], roll[1])
    def at(f, nfr): u = sm((f + 1) / nfr); return pose(isA, k, La, a0 + (a1 - a0) * u, wt, yaw[0] + (yaw[1] - yaw[0]) * u, roll[0] + (roll[1] - roll[0]) * u)
    return at

def blend(P0, t0, P1, t1, nfr, bump=0.0):
    out = []
    for f in range(1, nfr + 1):
        u = sm(f / nfr); p = P0 + (P1 - P0) * u; p[2] += bump * np.sin(np.pi * u)
        t = t0 + (t1 - t0) * u
        out.append((p, t))
    return out

# ---------------------------------------------------------------- run
frames, labels = [X[:NP].astype(np.float32)], ['woven']
stats = dict(t0=time.time(), steps=0, bad=0)
CUR = ['']
def stage(name, active, moves, holds=(), nfr=None, settle=0, press=None, dyn=None, until=None, pre=None, soft=(), pace=None):
    """moves: [(Block, [(P, t) per frame])]; holds: Blocks kept where they are"""
    global X
    nfr = nfr or (len(moves[0][1]) if moves else 0); hold_t = [X[b.ids].copy() for b in holds]
    fid = np.concatenate([b.ids for b, _ in moves] + [b.ids for b in holds]) if (moves or holds) else np.zeros(0, int)
    its = 0; lag = 0.0; cur = 0.0; nf_ = len(fid); wt = np.ones(nf_); nloc = 0; far = 0.0
    if press is not None: pid, ptg = press; fid = np.concatenate([fid, pid]); wt = np.r_[wt, np.full(len(pid), 0.12)]
    f = -1; total = 0
    while True:
        f += 1; total += 1
        if f >= nfr + settle and (cur < 0.03 or f >= nfr + settle + 10): total -= 1; break
        if until is not None and f >= 4 and until(X): total -= 1; break
        ff = min(f, nfr - 1)
        if pre is not None: pre(ff, nfr)
        tg = np.vstack([b.at(*pth[min(ff, len(pth) - 1)]) for b, pth in moves] + hold_t + ([ptg] if press is not None else [])) if len(fid) else np.zeros((0, 3))
        fid_, tg_, wt_ = fid, tg.reshape(-1, 3), wt
        if dyn is not None:
            di, dt_ = dyn(X); fid_ = np.concatenate([fid, di]).astype(int); tg_ = np.vstack([tg_, dt_]); wt_ = np.r_[wt, np.full(len(di), 0.5)]
        for sf in soft:
            si, st_, sw = sf(ff, nfr); fid_ = np.concatenate([fid_, si]).astype(int); tg_ = np.vstack([tg_, st_]); wt_ = np.r_[wt_, sw]
        ok_ = active[fid_]
        left = 1.0
        for sub in range(1 if pace else 4):                    # normally one go; if the paper moved further than the still paper around it was gathered for, carry on from there
            loc = Local(X, active); Xl = X[loc.ids].copy(); nloc = max(nloc, loc.n)
            Xn, i_ = loc.step(Xl, (loc.g2l[fid_[ok_]], tg_[ok_], wt_[ok_]), cap=pace); its += i_
            mv = float(np.linalg.norm(Xn - Xl, axis=1).max()); X[loc.ids] = Xn; far = max(far, mv)
            if mv < 0.8 * CAP: break
        stats['steps'] += 1
        if nf_: cur = float(np.linalg.norm(X[fid[:nf_]] - tg[:nf_], axis=1).max()); lag = max(lag, cur)
        frames.append(X[:NP].astype(np.float32)); labels.append(CUR[0] + '|' + name)
        if GHOST.any(): stats['magicf'] = stats.get('magicf', 0) + 1
        elif not A_.nocheck and ipctk.has_intersections(GMESH, X): stats['badf'] = stats.get('badf', 0) + 1
    was = bool(GHOST.any()); rejoin(); stage.cur = cur; stage.done = bool(until is not None and f < nfr + settle)
    hit = (not GHOST.any()) and ipctk.has_intersections(GMESH, X); stats['bad'] += int(hit); stats['lag'] = max(stats.get('lag', 0), lag)
    ek = active[E].any(1); ll = np.linalg.norm(X[E[ek, 0]] - X[E[ek, 1]], axis=1); l0 = L0[ek]; big = l0 > 0.04; stn = np.abs(ll[big] - l0[big]) / l0[big]; stats['strain'] = max(stats.get('strain', 0), float(np.percentile(stn, 99)))
    print('  %-30s %3d frames, %5d local vertices (%4d free), %4.1f iterations/frame, fingers end %.3f from target, stretch %2.0f%%, %5.1f s%s' % (name, total, nloc, int(active.sum()), its / max(1, total), cur, 100 * float(np.percentile(stn, 99)), time.time() - stage.t, ('  INTERSECTING' if hit else '') + ('  (magic)' if was else '')), flush=True)
    stage.t = time.time()
stage.t = time.time()
def nframes(dist, least=10): return max(least, int(np.ceil(A_.fps * dist / SPEED)))

def flat_home(isA, k, idx):
    """a hand pressing the free end of a strip flat on the table: every point gently pulled to where it lies when flat"""
    ids = np.where(free_end(isA, k, idx)[:NP] & (OWN == k))[0]; r, a = axes(isA)
    vc = VC[(isA, k)]; tg = np.outer(np.where(SIGN[ids] == 0, -0.6 * ZI, S_[ids]), r) + np.outer(vc + CF[ids] * (V_[ids] - vc), a); tg[:, 2] = ZHOME + SIGN[ids] * ZI
    return ids, tg
def home_path(X, isA, k, nfr, bump=0.0):
    """lay the end of a strip flat on the table in its own lane"""
    b = Block(X, isA, k); P0, t0 = tip_frame(X, isA, k); r, a = axes(isA)
    home = a * np.mean(V_[b.ids[SIGN[b.ids] != 0]]); home[2] = ZHOME
    return b, blend(P0, t0, home, r, nfr or nframes(np.linalg.norm(home - P0), 12), bump=bump)

def lift_moves(X, isA, k, La, a0, a1, nfr, parts=(0, 1)):
    """a strip held by its end and pinched near where it leaves the weave, swung from angle a0 (or from where it is, if None) to a1"""
    out = []
    spans = [(None, None)] + ([base_span(La)] if La > 0.55 else [])
    for i_, (s0, s1) in enumerate(spans):
        if i_ not in parts: continue
        b = Block(X, isA, k, s0, s1); pth = []
        for f in range(1, nfr + 1):
            u = sm(f / nfr)
            if a0 is None:
                P1, t1 = hover(isA, k, La, a1, X, b.s0, 0.97 if s0 is None else 1.0, b.s1); pth.append((b.P + (P1 - b.P) * u, b.t + (t1 - b.t) * u))
            else: pth.append(hover(isA, k, La, a0 + (a1 - a0) * u, X, b.s0, 0.97 if s0 is None else 1.0, b.s1))
        out.append((b, pth))
    return out
def base_span(La): return (La - 0.36, La - 0.15) if La > 0.8 else (La - 0.3, La - 0.12)
def held(X, isA, k, La): return [Block(X, isA, k)] + ([Block(X, isA, k, *base_span(La))] if La > 0.55 else [])
def pinch(isA, k, c1, La1, act, blocks, others, press, name, alpha=None):
    """fingers ease strip (isA, k) narrower (or let it spring back): its rest shape and the fingers holding it change together over a few frames"""
    pinch_many([(isA, k, c1, La1)], act, blocks, others, press, name, alpha)
def pinch_many(which, act, blocks, others, press, name, alpha=None):
    todo = []
    for isA, k, c1, La1 in which:
        if CMIN[(isA, k)] >= 1: continue
        c0, La0 = SQZ.get((isA, k), (1.0, La1))
        if c0 >= 1: La0 = La1
        if abs(c0 - c1) > 1e-6 or abs(La0 - La1) > 1e-6: todo.append((isA, k, c0, c1, La0, La1))
    if not todo: return
    nfr = 12
    def pre(f, nfr_):
        u = sm((f + 1) / nfr_)
        for isA, k, c0, c1, La0, La1 in todo: squeeze(isA, k, c0 + (c1 - c0) * u, La0 + (La1 - La0) * u)
    stage(name, act, [(b, [(b.P, b.t)] * nfr) for b in blocks], holds=others, press=press, pre=pre, settle=2, soft=[swing(isA, k, La1, alpha, alpha) for isA, k, c0, c1, La0, La1 in todo] if alpha is not None else ())

BETA = np.radians(30)
GAMMA, ROLL, YAW = np.radians(20), np.radians(12), np.radians(5)
def rail(isA, k, Lt, beta, wt=0.3):
    """a hand keeping the part of a strip that has yet to go into a loop in its own plane (through the line Lt along the strip, tilted up by beta): it
    can slide down that plane into the loop, but cannot swing up and over it. Without this a wide end next to a short loop just flips over the loop."""
    r, a = axes(isA); d = -r; e = d * np.cos(beta) + UP * np.sin(beta); nrm = -d * np.sin(beta) + UP * np.cos(beta); base = r * Lt
    ids = np.where((PIECE == isA) & (OWN == k) & (S_ < Lt - 0.05))[0]; off = SIGN[ids] * ZI + (ZHOME if beta < 0.05 else 0.0)
    def at(f, nfr):
        p = X[ids] - base; far = (p @ e) > 0.05; q = ids[far]
        # (the target is just ahead of each point, down the plane: within one step a spring to where a point already is would act as a brake)
        return q, X[q] - np.outer((p[far] @ nrm) - off[far], nrm) - 0.03 * e, np.full(len(q), wt)
    return at

def draw_out(isA, k, idx, La, act, hw, host, LaH, hidx, tail=None):
    """take strip (isA, k) out of the loop of strip `host` that it is threaded through. Seen forwards: the host strip rises a little, swung slightly
    aside with its near edge tilted up, to meet the strip coming in; the strip is fed into its loop; then both settle.
    Backwards, as simulated: the host rises with the strip still in it; the strip is pulled out by whatever part of it is at the mouth of the loop
    (paper can be pulled, not pushed), so its folded end follows through last; then it is held up clear while the host goes back."""
    col = 'red' if isA else 'white'; ax = 0 if isA else 1; r, a = axes(isA); isH, kH = host; colH = 'red' if isH else 'white'
    tl = free_end(isA, k, idx + 1)[:NP] & (OWN == k)
    if KNOB[(isA, k)] and not isA and tl.any() and S_[tl].max() > 0.3:
        # the part already free lies on the table, locked into its neighbours like a jigsaw: it has to come straight up before it can move along
        Lt = S_[tl].max()
        stage(col + ' end lifted off the table', act, lift_moves(X, isA, k, Lt, 1e-3, BETA, nframes(Lt * BETA, 12), parts=(0,)), press=hw, soft=[swing(isA, k, Lt, 1e-3, BETA)])
        tail = (Lt, BETA)
    elif not isA and tl.any() and S_[tl].max() > 0.3: tail = (S_[tl].max(), 0.0)
    feed = [rail(isA, k, *tail)] if tail else []
    # the host makes room. A white host lies flat and simply swings up; a red host has its free part standing from the last crossing, and is
    # brought down to the same low, tilted position
    if isH: stage(colH + ' strip held low over it', act, [], nfr=22, press=hw, soft=[swing(isH, kH, LaH, GAMMA, GAMMA, 0.25, ramp=True, yaw=(YAW, YAW), roll=(ROLL, ROLL))])
    else: stage(colH + ' strip raised to make room', act, [], nfr=14, press=hw, soft=[swing(isH, kH, LaH, 1e-3, GAMMA, 0.25, yaw=(0, YAW), roll=(0, ROLL))])
    room = swing(isH, kH, LaH, GAMMA, GAMMA, 0.25, yaw=(YAW, YAW), roll=(ROLL, ROLL))
    grip = []
    tucked = CMIN[(isA, k)] < 1; lo, hi = STRIPS[isH][kH].bounds[1], STRIPS[isH][kH].bounds[3]
    if tucked:
        b = Block(X, isA, k)
        stage(col + ' strip tucked in', act, [(b, [(b.P, b.t)] * 10)], holds=grip, press=hw, pre=lambda f, n_: tuck(isA, k, La, lo, hi, sm((f + 1) / n_), X), settle=1, soft=[room])
    Lm = min(La, WID); tipv = tip_ids(isA, k)
    hT = np.where((PIECE == isH) & (OWN == kH) & (SIGN > 0) & (S_ < LaH + 0.1))[0]; hB = np.where((PIECE == isH) & (OWN == kH) & (SIGN < 0) & (S_ < LaH + 0.1))[0]
    def inside(Xg, ids):
        """which of these points are between the two layers of the host right now"""
        p = Xg[ids]; dT, iT = cKDTree(Xg[hT, :2]).query(p[:, :2]); dB, iB = cKDTree(Xg[hB, :2]).query(p[:, :2])
        return (dT < 0.22) & (dB < 0.22) & (Xg[hT[iT], 2] > p[:, 2]) & (Xg[hB[iB], 2] < p[:, 2])
    been = np.zeros(len(tipv), bool); isout = [False]
    def out(Xg):
        # the folded end is out once most of it has been between the host's two layers and none of it is any more
        ins = inside(Xg, tipv); been[:] |= ins; isout[0] = bool(been.mean() > 0.6 and not ins.any() and (Xg[tipv, ax] > Lm - 0.3).all())
        return isout[0]
    keep = (X.copy(), L0.copy(), CF.copy(), len(frames), len(labels), GHOST.copy(), dict(GSTRIPS), dict(stats))
    if A_.hand:
        # a hand that travels: it grips the strip where it comes out of the loop and carries that point to where it will be when the strip stands
        # clear; then the next bit, and so on up the strip, while a light hand keeps what is already out straight. The rest follows through the loop.
        pulled = [0.0]; pace_ = 0.6 * SPEED / A_.fps; SPAN = 0.15
        def hand(f, nfr_):
            ids, tg, w = pose(isA, k, La, ALPHA, 0.15, smin=La - pulled[0] - SPAN); grip = np.where(SIGN[ids] != 0, S_[ids], 0.0) < La - pulled[0]
            if not grip.any() or np.linalg.norm(X[ids[grip]] - tg[grip], axis=1).mean() < 0.07: pulled[0] = min(La, pulled[0] + pace_)
            return ids, tg, np.where(grip, 1.0, 0.15)
        def done(Xg): out(Xg); return pulled[0] >= La - 1e-9
        stage(col + ' end drawn out of the loop', act, [], holds=grip, nfr=int(2.5 * La / pace_) + 30, press=hw, until=done, pace=1.5 * SPEED / A_.fps, pre=(lambda f, n_: tuck(isA, k, La, lo, hi, 1.0, X)) if tucked else None, soft=[room] + feed + [hand])
    def by_traction():
        mine = np.where((PIECE == isA) & (OWN == k) & (SIGN != 0) & (S_ < La - 0.05))[0]
        def dyn(Xg):
            p = Xg[mine]; q = (p[:, ax] > Lm - 0.3) & (p[:, ax] < Lm + 0.3) & (p[:, 2] < 0.6)
            return mine[q], p[q] + 0.2 * (0.5 * r + 0.87 * UP)
        stage(col + ' end drawn out of the loop', act, [], holds=grip, nfr=int(nframes(La) * 4) + 20, press=hw, dyn=dyn, until=out, pace=1.5 * SPEED / A_.fps, pre=(lambda f, n_: tuck(isA, k, La, lo, hi, 1.0, X)) if tucked else None, soft=[room] + feed)
    if not A_.hand: by_traction()
    elif not out(X):
        # the hand let it slip. Go back to before the draw and pull at the mouth of the loop instead, which is cruder but gets more strips through
        X[:] = keep[0]; L0[:] = keep[1]; CF[:] = keep[2]; del frames[keep[3]:]; del labels[keep[4]:]; GHOST[:] = keep[5]; GSTRIPS.clear(); GSTRIPS.update(keep[6])
        t0_ = stats['t0']; stats.clear(); stats.update(keep[7]); stats['t0'] = t0_; stats['retry'] = stats.get('retry', 0) + 1; been[:] = False; isout[0] = False
        print('    (%s strip %d slipped out of the hand: drawn again by pulling at the loop)' % (col, k + 1), flush=True)
        by_traction()
    if not out(X): ghost(isA, k, idx, 'would not come out of the loop')
    # the strip is held up clear, and at the same time the host goes back: a white one down flat, a red one up to where it waits for its next crossing
    P0, t0 = tip_frame(X, isA, k); P1, t1 = hover(isA, k, La, ALPHA, X); nfr = nframes(np.linalg.norm(P1 - P0), 16)
    moves = lift_moves(X, isA, k, La, None, ALPHA, nfr); soft = [swing(isA, k, La, ALPHA, ALPHA, ramp=True)]
    if isH: moves += lift_moves(X, isH, kH, LaH, None, ALPHA, nfr); soft.append(swing(isH, kH, LaH, GAMMA, ALPHA, 0.12, yaw=(YAW, 0), roll=(ROLL, 0)))
    else: soft.append(swing(isH, kH, LaH, GAMMA, 1e-3, 0.25, yaw=(YAW, 0), roll=(ROLL, 0)))
    stage(col + ' end lifted clear', act, moves, settle=4, press=hw, soft=soft, pre=(lambda f, n_: tuck(isA, k, La, lo, hi, 1 - sm((f + 2) / n_), X)) if tucked else None)
    force(isA, k, idx, La, ALPHA, act, col + ' end lifted clear', hw)
    if isH: force(isH, kH, hidx, LaH, ALPHA, act, colH + ' end lifted clear', hw)

def far_from(isA, k, La, alpha):
    b = Block(X, isA, k); return float(np.linalg.norm(X[b.ids] - b.at(*hover(isA, k, La, alpha, X)), axis=1).max())
def force(isA, k, idx, La, alpha, act, name, press=None, wt=0.2):
    """if a strip has not got to where it should be (it is caught on something), it is taken there by magic"""
    if far_from(isA, k, La, alpha) < 0.35: return
    ghost(isA, k, idx, 'was caught')
    stage(name, act, lift_moves(X, isA, k, La, None, alpha, 16), settle=4, press=press, soft=[swing(isA, k, La, alpha, alpha, wt)])

def both(p, q):
    if p is None: return q
    if q is None: return p
    return np.r_[p[0], q[0]], np.vstack([p[1], q[1]])

FOLD = np.radians(140)
order = [(n, m) for n in reversed(range(NA)) for m in reversed(range(NB))]
done = 0; LaR = 0.0                            # LaR: how much of the red strip being worked on is free so far
def save():
    cuts = [c for h in ('A', 'B') for c in CUTS[h]]
    np.savez(A_.out, frames=np.array(frames), F=F, piece=PIECE, sign=SIGN, nfr=int((PIECE[F[:, 0]] == 1).sum()), nr=int((PIECE == 1).sum()), fps=A_.fps, reverse=True, labels=np.array(labels),
             rest=np.c_[S_, V_][:NP].astype(np.float32), own=OWN[:NP], cuts=np.vstack(cuts).astype(np.float32), cutlen=np.array([len(c) for c in cuts]), ncuts=np.array([len(CUTS['A']), len(CUTS['B'])]),
             consts=np.array([SQ, RAD, KERF, ZI, ZHOME, ZG]), parity=PAR)
def checkpoint():
    keys = sorted(SQZ); np.savez('%s.ck%02d.npz' % (A_.out[:-4], done), X=X, L0=L0, CF=CF, sq_keys=np.array(keys, int).reshape(-1, 2), sq_vals=np.array([SQZ[q] for q in keys], float).reshape(-1, 2), done=done, LaR=LaR, nframes=len(frames), out=A_.out)
if A_.resume:
    ck = np.load(A_.resume, allow_pickle=True); assert ck['X'].shape == X.shape, 'checkpoint is for another mesh'
    X = ck['X'].copy(); L0[:] = ck['L0']; CF[:] = ck['CF']; done = int(ck['done']); LaR = float(ck['LaR'])
    for q, v in zip(ck['sq_keys'], ck['sq_vals']): SQZ[(int(q[0]), int(q[1]))] = (float(v[0]), float(v[1]))
    old = np.load(str(ck['out']), allow_pickle=True); nf = int(ck['nframes']); frames = list(old['frames'][:nf]); labels = list(old['labels'][:nf])
    print('resumed after %d crossings, %d frames; intersecting now: %s' % (done, nf, ipctk.has_intersections(GMESH, X)), flush=True)
first = done
def standing(n, m):
    """white strips that have been taken out of red strip n so far (crossings m.. of this row) and are still held up, waiting for the row to be finished"""
    return [q for q in range(m, NB) if ((n + q + PAR) & 1) != 0]
for i_, (n, m) in enumerate(order):
    if i_ < first: continue
    if m == NB - 1: LaR = 0.0
    red_in = ((n + m + PAR) & 1) == 0
    actR, actW = free_end(1, n, m), free_end(0, m, n); act = actR | actW
    flat = m + 1 < NB and (m + 1) not in standing(n, m + 1)                # the white strip next door, if it lies flat: pressed down while things move beside it
    nbr = free_end(0, m + 1, n) if flat else np.zeros(N, bool); prs = flat_home(0, m + 1, n) if flat else None
    print('crossing red %d x white %d: %s is inside' % (n + 1, m + 1, 'red' if red_in else 'white'), flush=True)
    La_new, LaW = free_len(1, n, m), free_len(0, m, n)
    CUR[0] = '%d,%d,%s' % (n, m, 'R' if red_in else 'W')
    if red_in: draw_out(1, n, m, La_new, act | nbr, prs, (0, m), LaW, n)
    else: draw_out(0, m, n, LaW, act | nbr, prs, (1, n), La_new, m)        # the white end comes out and stays held up: it cannot lie down while the red strip is still in its row
    if m == 0:
        # the row is done: the red strip is let go and folded back out of the way, then the white ends that were held up are let go and lowered
        # into place from above (like jigsaw pieces, when the cuts are curved)
        CUR[0] = 'row,%d' % n
        pinch(1, n, 1.0, La_new, act, held(X, 1, n, La_new), [], flat_home(0, m, n) if red_in else None, 'red strip let go', alpha=ALPHA)
        stage('red strip folded back', actR, lift_moves(X, 1, n, La_new, ALPHA, FOLD, 16), settle=4, soft=[swing(1, n, La_new, ALPHA, FOLD, 0.2)])
        force(1, n, 0, La_new, FOLD, actR, 'red strip folded back')
        up = standing(n, 0)
        if up:
            actU = np.zeros(N, bool); blocks = []; moves = []; soft = []; prs = None
            Lq = {q: free_len(0, q, n) for q in up}; nfr = nframes(max(Lq.values()) * ALPHA, 16)
            for q in range(NB):
                actU |= free_end(0, q, n)
                if q in up: blocks += held(X, 0, q, Lq[q])
                else: prs = both(prs, flat_home(0, q, n))
            pinch_many([(0, q, 1.0, Lq[q]) for q in up], actU, blocks, [], prs, 'white strips let go', alpha=ALPHA)
            for q in up: moves += lift_moves(X, 0, q, Lq[q], ALPHA, 1e-3, nfr); soft.append(swing(0, q, Lq[q], ALPHA, 1e-3, 0.2))
            stage('white ends laid flat', actU, moves, settle=6, press=prs, soft=soft)
            for q in up: force(0, q, n, Lq[q], 1e-3, actU, 'white ends laid flat', prs)
    LaR = La_new; done += 1; save(); checkpoint()
    if (A_.only and done - first >= A_.only) or (A_.stop and done >= A_.stop): break
if done == len(order):
    # the two halves come apart: red slides away with its strips folded back, then the strips are laid out flat
    red = np.r_[PIECE == 1, np.zeros(4, bool)]; CUR[0] = 'start'
    for f in range(1, 31):
        Xn = X.copy(); Xn[red, 0] += 3.4 * (sm(f / 30) - sm((f - 1) / 30)); X = Xn; frames.append(X[:NP].astype(np.float32)); labels.append('start|halves apart')
        if GHOST.any(): stats['magicf'] = stats.get('magicf', 0) + 1
        elif not A_.nocheck and ipctk.has_intersections(GMESH, X): stats['badf'] = stats.get('badf', 0) + 1
    act = np.zeros(N, bool); moves = []; soft = []
    for k in range(NA): act |= free_end(1, k, 0); moves += lift_moves(X, 1, k, SQ, FOLD, 1e-3, 36); soft.append(swing(1, k, SQ, FOLD, 1e-3, 0.2))
    # the white strips next to red's lobe were lying on it: they settle flat on the table at the same time
    wi, wt_ = [], []
    for k in range(NB): act |= free_end(0, k, 0); i_, t_ = flat_home(0, k, 0); wi.append(i_); wt_.append(t_)
    stage('red strips laid out flat', act, moves, settle=6, soft=soft, press=(np.concatenate(wi), np.vstack(wt_)))
    for k in range(NA): force(1, k, 0, SQ, 1e-3, act, 'red strips laid out flat')
    for k in range(NB): force(0, k, 0, free_len(0, k, 0), 1e-3, act, 'white strips laid out flat')
    if GSTRIPS: print('still passing through paper at the end:', sorted(GSTRIPS))
el = time.time() - stats['t0']
print('%d crossings undone, %d frames in %.0f s (%.2f s/frame); most stretch (99th percentile of edges) %.0f%%; strips passed through by magic: %d (%d frames); other frames intersecting: %s; draws done again by pulling: %d' % (done, len(frames) - 1, el, el / max(1, len(frames) - 1), 100 * stats.get('strain', 0), stats.get('magic', 0), stats.get('magicf', 0), 'not checked' if A_.nocheck else stats.get('badf', 0), stats.get('retry', 0)))
save()
