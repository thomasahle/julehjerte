"""Turn a juleflet heart SVG into real cut-paper meshes: each half is its actual outline with the cuts as
narrow slits, so cuts may wander, hook or double back freely."""
import re, numpy as np, triangle
from svgelements import Path, Move
from shapely.geometry import LineString, Polygon, box
from shapely.ops import unary_union

SQ = 3.0

def load_cuts_old(svg_path, per_seg=14):
    txt = open(svg_path).read()
    out = {'A': [], 'B': []}
    for tag in re.findall(r'<path\b[^>]*>', txt):
        d = re.search(r'\bd="([^"]+)"', tag); st = re.search(r'\bstroke="([^"]+)"', tag)
        if not d or not st or st.group(1) not in ('orange', 'green'): continue
        pts = []
        for seg in Path(d.group(1)):
            if isinstance(seg, Move): continue
            for k in range(per_seg + 1):
                p = seg.point(k / per_seg)
                if not pts or abs(p.x - pts[-1][0]) + abs(p.y - pts[-1][1]) > 1e-9: pts.append((p.x, p.y))
        P = np.array(pts) / 100.0
        x, y = SQ * (1 - P[:, 1]), SQ * (1 - P[:, 0])
        pl = np.c_[x, y] if st.group(1) == 'green' else np.c_[y, x]
        if pl[0, 0] > pl[-1, 0]: pl = pl[::-1]
        out['A' if st.group(1) == 'green' else 'B'].append(pl)
    for k in out: out[k].sort(key=lambda p: p[:, 1].mean())
    return out

def load_cuts(svg_path, per_seg=14):
    """-> {'A': [polyline...], 'B': [...]} in each half's own (s,t): s runs from the fold (0) to the lobe (3).
    Reads a heart the way juleflet does: every path in the file, whatever its colour, with its own and its groups' transforms applied, in the
    0-100 square of the viewBox; a cut that runs across (left-right) belongs to one half, one that runs up-down to the other."""
    import xml.etree.ElementTree as ET
    from svgelements import Matrix
    root = ET.parse(svg_path).getroot(); tag = lambda e: e.tag.split('}')[-1]
    vb = [float(v) for v in re.split(r'[ ,]+', root.get('viewBox', '0 0 100 100').strip())]
    out = {'A': [], 'B': []}; loose = []
    tol = 1e-2 * max(vb[2:])                             # juleflet's own reader joins strokes that end within 1 of its 100
    def joined(pieces, free=lambda p: True):
        """pieces that meet end to end (at ends `free` allows) made into one line each"""
        pieces = list(pieces); again = True
        while again:
            again = False
            for i in range(len(pieces)):
                for j in range(len(pieces)):
                    if i == j: continue
                    A, B = pieces[i], pieces[j]
                    for A2, B2 in ((A, B), (A, B[::-1]), (A[::-1], B)):
                        if np.linalg.norm(A2[-1] - B2[0]) < tol and np.linalg.norm(A2[0] - B2[-1]) > tol and free(A2[-1]) and free(B2[0]):
                            pieces[i] = np.vstack([A2, B2[1:]]); del pieces[j]; again = True; break
                    if again: break
                if again: break
        return pieces
    def walk(el, M):
        if tag(el) in ('defs', 'metadata', 'clipPath', 'mask', 'pattern', 'symbol'): return
        if el.get('transform'): M = Matrix(el.get('transform')) * M
        if tag(el) == 'path' and el.get('d'):
            pts = []; own = []
            pth = Path(el.get('d')) * M; pth.reify()
            for seg in pth:
                if isinstance(seg, Move):                # a new sub-path: a separate piece of line
                    if len(pts) > 1: own.append(np.array(pts))
                    pts = []; continue
                for k in range(per_seg + 1):
                    p = seg.point(k / per_seg)
                    if not pts or abs(p.x - pts[-1][0]) + abs(p.y - pts[-1][1]) > 1e-9: pts.append((p.x, p.y))
            if len(pts) > 1: own.append(np.array(pts))
            loose.extend(joined(own))                    # one path drawn in several strokes is one cut
        for ch in el: walk(ch, M)
    walk(root, Matrix())
    # a cut is sometimes split over two paths: join those too, but only where both stop inside the square. Cuts of the two halves
    # may share an end point on the square's side or lie along each other, and they are still separate cuts in separate papers
    lo, hi = np.array(vb[:2]), np.array(vb[:2]) + np.array(vb[2:])
    loose = joined(loose, lambda p: (p - lo).min() > tol and (hi - p).min() > tol)
    for P in loose:
        P = (P - vb[:2]) / vb[2:]; d = np.abs(P[-1] - P[0])
        if np.linalg.norm(P[-1] - P[0]) < 0.5: continue              # closed or decorative: not a cut from the fold to the lobe
        x, y = SQ * (1 - P[:, 1]), SQ * (1 - P[:, 0])
        pl = np.c_[x, y] if d[1] > d[0] else np.c_[y, x]             # up-down in the file: red half (strips along x); across: white half (along y)
        if pl[0, 0] > pl[-1, 0]: pl = pl[::-1]
        # a cut drawn to within 1 of the 100 of the fold or the lobe ends on it: stopping a hair short it would leave its two strips joined
        if 0 < pl[0, 0] <= 1e-2 * SQ: pl = np.vstack([[0.0, pl[0, 1]], pl])
        if 0 < SQ - pl[-1, 0] <= 1e-2 * SQ: pl = np.vstack([pl, [SQ, pl[-1, 1]]])
        out['A' if d[1] > d[0] else 'B'].append(pl)
    # a symmetric heart is drawn with the cuts of one half only: the other half is its mirror image, which in each half's own
    # coordinates is the same set of lines
    for k, o in (('A', 'B'), ('B', 'A')):
        if not out[k] and out[o]: out[k] = [c.copy() for c in out[o]]
    for k in out: out[k].sort(key=lambda p: p[:, 1].mean())
    return out

def half_polygon(cuts, kerf, band):
    slits = []
    for c in cuts:
        c = np.vstack([[c[0, 0] - 0.2, c[0, 1]], c])                      # run the slit out through the fold
        slits.append(LineString(c).buffer(kerf / 2, cap_style='round', join_style='round', quad_segs=3))
    return box(0, 0, SQ + band, SQ).difference(unary_union(slits)).simplify(0.002)

def mesh_polygon(poly, area):
    V, S, holes = [], [], []
    def ring(r):
        c = np.array(r.coords)[:-1]; n0 = len(V)
        V.extend(c.tolist()); S.extend([(n0 + i, n0 + (i + 1) % len(c)) for i in range(len(c))])
    ring(poly.exterior)
    for h in poly.interiors:
        ring(h); holes.append(list(Polygon(h).representative_point().coords[0]))
    d = dict(vertices=np.array(V), segments=np.array(S))
    if holes: d['holes'] = np.array(holes)
    t = triangle.triangulate(d, 'pq28a%.5f' % area)
    return t['vertices'], t['triangles'].astype(np.int32)

def components(n, F, keep):
    """connected components of the mesh restricted to vertices where keep is True; -1 elsewhere"""
    par = np.arange(n)
    def find(a):
        while par[a] != a: par[a] = par[par[a]]; a = par[a]
        return a
    for f in F:
        k = [v for v in f if keep[v]]
        for a in k[1:]: par[find(a)] = find(k[0])
    roots = np.array([find(i) if keep[i] else -1 for i in range(n)])
    return roots

def fold(V2, F2, zb, zt):
    """two layers of the same cut outline joined along the fold s=0. zb, zt: per-vertex heights of the layers.
    -> V (s,t,z), F, crease vertex set, layer index arrays (bottom, top)"""
    n = len(V2); onf = V2[:, 0] < 1e-7
    V = [np.c_[V2, zb], np.c_[V2, zt]]; F = [F2, F2[:, ::-1] + n]
    cnt = {}
    for f in F2:
        for a in range(3):
            e = (int(f[a]), int(f[(a + 1) % 3])); cnt[e] = cnt.get(e, 0) + 1
    # boundary edges on the fold, in the direction the bottom layer's triangles run them (keeps the surface consistently oriented)
    fold_edges = [e for e in cnt if (e[1], e[0]) not in cnt and onf[e[0]] and onf[e[1]]]
    ids = sorted({v for e in fold_edges for v in e}); mid = {v: 2 * n + i for i, v in enumerate(ids)}
    V.append(np.array([[-min(0.04, (zt[v] - zb[v]) / 2), V2[v, 1], (zt[v] + zb[v]) / 2] for v in ids]))
    W = []
    for a, b in fold_edges:
        W += [(b, a, mid[a]), (b, mid[a], mid[b]), (mid[b], mid[a], a + n), (mid[b], a + n, b + n)]
    crease = set(ids) | {v + n for v in ids} | set(mid.values())
    return np.vstack(V), np.vstack([F[0], F[1], np.array(W, np.int32)]), crease, np.arange(n), np.arange(n) + n
