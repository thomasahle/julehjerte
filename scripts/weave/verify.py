"""Check frames of a run, whole mesh, for paper passing through paper.  verify.py RUN.npz [step]
(triangles far smaller than the stored precision are left out: single-precision rounding flips them)"""
import sys, numpy as np, ipctk
d = np.load(sys.argv[1]); X = d['frames']; F = d['F'].astype(np.int32); step = int(sys.argv[2]) if len(sys.argv) > 2 else 1
V0 = X[0].astype(float); P = V0[F]; ar = 0.5 * np.linalg.norm(np.cross(P[:, 1] - P[:, 0], P[:, 2] - P[:, 0]), axis=1)
lmin = np.minimum.reduce([np.linalg.norm(P[:, i] - P[:, (i + 1) % 3], axis=1) for i in range(3)])
keep = (ar > 1e-7) & (lmin > 2e-4); F = F[keep]; E = ipctk.edges(F)
m = ipctk.CollisionMesh(V0, E, F)
bad = [i for i in range(0, len(X), step) if ipctk.has_intersections(m, X[i].astype(float))]
print(sys.argv[1], 'frames checked', len(range(0, len(X), step)), '| tiny triangles left out', int((~keep).sum()), '| frames with intersections', len(bad), bad[:30])
