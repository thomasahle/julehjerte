#!/usr/bin/env python3
"""
embedded_dual.py

An embedded planar *dual* multigraph for a two-colour planar subdivision.

This is the graph object (G_0) referred to in the “reverse contractions”
approach:
  - vertices: visible faces (+ optional outside “ports” as green nodes)
  - edges: visible boundary arcs (multiedges allowed)
  - rotation system: cyclic order of incident half-edges around each face-vertex

It also implements the two refinement moves:
  - SplitArc(e): split a boundary arc into two parallel arcs
  - VertexSplit(v,i,j): split a face-vertex into two and add an internal
    same-colour edge between them
"""

from __future__ import annotations

from dataclasses import asdict, dataclass
from typing import Dict, Iterable, List, Optional, Sequence, Tuple


GridPoint = Tuple[int, int]
RasterComp = List[List[int]]  # [y][x] -> face id


@dataclass
class DualVertex:
    id: int
    kind: str  # "face" | "green"
    color: Optional[int]  # 0/1 for faces, None for green
    parent: Optional[int]  # original visible face id for refined faces
    side: Optional[str] = None  # for kind=="green": top/right/bottom/left
    centroid: Optional[Tuple[float, float]] = None


@dataclass
class HalfEdge:
    id: int
    edge: int
    origin: int


@dataclass
class DualEdge:
    id: int
    u: int
    v: int
    kind: str  # "boundary" | "internal"
    he_u: int  # half-edge whose origin is u
    he_v: int  # half-edge whose origin is v


def _cycle_slice(items: Sequence[int], i: int, j: int) -> List[int]:
    """Return items[i:j] on a cyclic sequence (i inclusive, j exclusive)."""
    if not items:
        return []
    n = len(items)
    i %= n
    j %= n
    if i < j:
        return list(items[i:j])
    return list(items[i:]) + list(items[:j])


class EmbeddedDualGraph:
    def __init__(
        self,
        *,
        vertices: List[DualVertex],
        edges: List[DualEdge],
        halfedges: List[HalfEdge],
        rotation: List[List[int]],
    ):
        self.vertices = vertices
        self.edges = edges
        self.halfedges = halfedges
        self.rotation = rotation

    @property
    def vertex_count(self) -> int:
        return len(self.vertices)

    @property
    def edge_count(self) -> int:
        return len(self.edges)

    def validate(self) -> None:
        if len(self.rotation) != len(self.vertices):
            raise ValueError("rotation list length must equal vertex count")

        for v_id, rot in enumerate(self.rotation):
            for he in rot:
                if he < 0 or he >= len(self.halfedges):
                    raise ValueError(f"rotation[{v_id}] contains invalid halfedge id {he}")
                if self.halfedges[he].origin != v_id:
                    raise ValueError(f"rotation[{v_id}] contains halfedge {he} not owned by vertex")

        for e in self.edges:
            if e.id < 0 or e.id >= len(self.edges):
                raise ValueError("edge ids must be contiguous and match list index")
            if e.he_u < 0 or e.he_u >= len(self.halfedges):
                raise ValueError(f"edge {e.id} has invalid he_u")
            if e.he_v < 0 or e.he_v >= len(self.halfedges):
                raise ValueError(f"edge {e.id} has invalid he_v")
            if self.halfedges[e.he_u].edge != e.id or self.halfedges[e.he_v].edge != e.id:
                raise ValueError(f"edge {e.id} halfedges do not point back to edge")
            if self.halfedges[e.he_u].origin != e.u:
                raise ValueError(f"edge {e.id} he_u origin mismatch")
            if self.halfedges[e.he_v].origin != e.v:
                raise ValueError(f"edge {e.id} he_v origin mismatch")

            if e.he_u not in self.rotation[e.u]:
                raise ValueError(f"edge {e.id} he_u not present in rotation of vertex {e.u}")
            if e.he_v not in self.rotation[e.v]:
                raise ValueError(f"edge {e.id} he_v not present in rotation of vertex {e.v}")

    def to_json_dict(self) -> Dict[str, object]:
        return {
            "vertices": [asdict(v) for v in self.vertices],
            "edges": [asdict(e) for e in self.edges],
            "halfedges": [asdict(h) for h in self.halfedges],
            "rotation": self.rotation,
        }

    @classmethod
    def from_json_dict(cls, data: Dict[str, object]) -> "EmbeddedDualGraph":
        vertices_raw = data.get("vertices")
        edges_raw = data.get("edges")
        halfedges_raw = data.get("halfedges")
        rotation = data.get("rotation")
        if not isinstance(vertices_raw, list) or not isinstance(edges_raw, list) or not isinstance(halfedges_raw, list):
            raise ValueError("Invalid embedded dual JSON: expected vertices/edges/halfedges lists")
        if not isinstance(rotation, list):
            raise ValueError("Invalid embedded dual JSON: expected rotation list")

        vertices: List[DualVertex] = []
        for v in vertices_raw:
            if not isinstance(v, dict):
                raise ValueError("Invalid vertex entry in JSON")
            centroid = v.get("centroid")
            if isinstance(centroid, list) and len(centroid) == 2:
                v = dict(v)
                v["centroid"] = (float(centroid[0]), float(centroid[1]))
            vertices.append(DualVertex(**v))  # type: ignore[arg-type]

        edges: List[DualEdge] = []
        for e in edges_raw:
            if not isinstance(e, dict):
                raise ValueError("Invalid edge entry in JSON")
            edges.append(DualEdge(**e))  # type: ignore[arg-type]

        halfedges: List[HalfEdge] = []
        for h in halfedges_raw:
            if not isinstance(h, dict):
                raise ValueError("Invalid halfedge entry in JSON")
            halfedges.append(HalfEdge(**h))  # type: ignore[arg-type]

        rot: List[List[int]] = []
        for r in rotation:
            if not isinstance(r, list):
                raise ValueError("Invalid rotation entry in JSON")
            rot.append([int(x) for x in r])

        g = cls(vertices=vertices, edges=edges, halfedges=halfedges, rotation=rot)
        g.validate()
        return g

    def split_arc(self, edge_id: int) -> int:
        """
        SplitArc(e): replace e with two parallel edges between the same endpoints,
        inserted consecutively in both endpoint rotations.
        """
        if edge_id < 0 or edge_id >= len(self.edges):
            raise ValueError("edge_id out of range")
        e = self.edges[edge_id]
        u, v = e.u, e.v

        # Create the new parallel edge + halfedges.
        new_eid = len(self.edges)
        he_u = len(self.halfedges)
        he_v = he_u + 1
        self.halfedges.append(HalfEdge(id=he_u, edge=new_eid, origin=u))
        self.halfedges.append(HalfEdge(id=he_v, edge=new_eid, origin=v))
        self.edges.append(DualEdge(id=new_eid, u=u, v=v, kind=e.kind, he_u=he_u, he_v=he_v))

        # Insert next to the existing halfedges in the rotation system.
        try:
            iu = self.rotation[u].index(e.he_u)
        except ValueError as exc:
            raise ValueError("edge halfedge missing from rotation system") from exc
        try:
            iv = self.rotation[v].index(e.he_v)
        except ValueError as exc:
            raise ValueError("edge halfedge missing from rotation system") from exc

        self.rotation[u].insert(iu + 1, he_u)
        self.rotation[v].insert(iv + 1, he_v)

        return new_eid

    def vertex_split(self, vertex_id: int, i: int, j: int) -> Tuple[int, int]:
        """
        VertexSplit(v,i,j): split vertex v into v and v', moving the cyclic
        interval (i..j) of incident halfedges to v', and add an internal edge
        (v,v').
        """
        if vertex_id < 0 or vertex_id >= len(self.vertices):
            raise ValueError("vertex_id out of range")
        v = self.vertices[vertex_id]
        if v.kind != "face":
            raise ValueError("VertexSplit is only supported for face vertices")

        rot = self.rotation[vertex_id]
        if len(rot) < 2:
            raise ValueError("VertexSplit requires degree >= 2")
        if not (0 <= i < len(rot) and 0 <= j < len(rot)):
            raise ValueError("i/j out of range")
        if i == j:
            raise ValueError("i and j must be different")

        moved = _cycle_slice(rot, i, j)
        remaining = _cycle_slice(rot, j, i)
        if not moved or not remaining:
            raise ValueError("VertexSplit must move a non-empty proper subset of halfedges")

        new_vid = len(self.vertices)
        self.vertices.append(
            DualVertex(
                id=new_vid,
                kind="face",
                color=v.color,
                parent=v.parent if v.parent is not None else v.id,
                centroid=v.centroid,
            )
        )
        self.rotation.append([])

        # Reattach moved halfedges (and their edges) from vertex_id to new_vid.
        for he in moved:
            self.halfedges[he].origin = new_vid
            e = self.edges[self.halfedges[he].edge]
            if e.he_u == he:
                e.u = new_vid
            elif e.he_v == he:
                e.v = new_vid
            else:
                raise RuntimeError("halfedge does not match either endpoint on its edge")

        # Add the internal edge (v, v').
        new_eid = len(self.edges)
        he_v = len(self.halfedges)
        he_vp = he_v + 1
        self.halfedges.append(HalfEdge(id=he_v, edge=new_eid, origin=vertex_id))
        self.halfedges.append(HalfEdge(id=he_vp, edge=new_eid, origin=new_vid))
        self.edges.append(DualEdge(id=new_eid, u=vertex_id, v=new_vid, kind="internal", he_u=he_v, he_v=he_vp))

        self.rotation[vertex_id] = remaining + [he_v]
        self.rotation[new_vid] = moved + [he_vp]

        return new_vid, new_eid


@dataclass(frozen=True)
class VisibleFace:
    id: int
    color: int
    centroid: Optional[Tuple[float, float]]


@dataclass(frozen=True)
class _MicroEdge:
    p0: GridPoint
    p1: GridPoint
    left_face: int
    right_face: int

    def key(self) -> Tuple[int, int, int, int, int, int]:
        return (self.p0[0], self.p0[1], self.p1[0], self.p1[1], self.left_face, self.right_face)


def _boundary_runs(seq: Sequence[int]) -> List[Tuple[int, int, int]]:
    """
    Runs on a 1D boundary: returns [(face_id, start, end_excl), ...].
    """
    if not seq:
        return []
    runs: List[Tuple[int, int, int]] = []
    cur = int(seq[0])
    start = 0
    for i in range(1, len(seq)):
        v = int(seq[i])
        if v != cur:
            runs.append((cur, start, i))
            cur = v
            start = i
    runs.append((cur, start, len(seq)))
    return runs


def build_embedded_dual_from_raster(
    *,
    faces: Sequence[VisibleFace],
    comp: RasterComp,
    image_size: Tuple[int, int],
    green_sides: bool = True,
) -> EmbeddedDualGraph:
    """
    Build the embedded dual graph (G_0) for a raster subdivision.

    - Vertices: visible faces; plus green nodes for boundary runs if green_sides.
    - Edges: connected boundary components between faces; plus boundary-run edges
      between face and green nodes.
    - Rotation: cyclic order of incident halfedges around each face-vertex, as
      induced by walking the pixel boundary with the face on the left.
    """
    w, h = image_size
    if h != len(comp) or (h > 0 and w != len(comp[0])):
        raise ValueError("comp size and image_size disagree")

    face_vertices: List[DualVertex] = []
    for f in faces:
        face_vertices.append(DualVertex(id=f.id, kind="face", color=int(f.color), parent=f.id, centroid=f.centroid))

    vertices: List[DualVertex] = list(face_vertices)
    edges: List[DualEdge] = []
    halfedges: List[HalfEdge] = []
    rotation: List[List[int]] = [[] for _ in range(len(vertices))]

    microedges: List[_MicroEdge] = []
    micro_to_dual_edge: Dict[Tuple[int, int, int, int, int, int], int] = {}

    # Internal boundaries (between two in-image faces)
    pair_to_micro: Dict[Tuple[int, int], List[int]] = {}

    def add_micro(me: _MicroEdge) -> int:
        mid = len(microedges)
        microedges.append(me)
        return mid

    for y in range(h):
        for x in range(w):
            a = int(comp[y][x])
            if x + 1 < w:
                b = int(comp[y][x + 1])
                if a != b:
                    # Vertical boundary at x+1. Canonical direction is UP so "left" is WEST.
                    me = _MicroEdge(p0=(x + 1, y + 1), p1=(x + 1, y), left_face=a, right_face=b)
                    mid = add_micro(me)
                    pair = (a, b) if a < b else (b, a)
                    pair_to_micro.setdefault(pair, []).append(mid)
            if y + 1 < h:
                b = int(comp[y + 1][x])
                if a != b:
                    me = _MicroEdge(p0=(x, y + 1), p1=(x + 1, y + 1), left_face=a, right_face=b)
                    mid = add_micro(me)
                    pair = (a, b) if a < b else (b, a)
                    pair_to_micro.setdefault(pair, []).append(mid)

    def add_dual_edge(u: int, v: int, kind: str) -> int:
        eid = len(edges)
        he_u = len(halfedges)
        he_v = he_u + 1
        halfedges.append(HalfEdge(id=he_u, edge=eid, origin=u))
        halfedges.append(HalfEdge(id=he_v, edge=eid, origin=v))
        edges.append(DualEdge(id=eid, u=u, v=v, kind=kind, he_u=he_u, he_v=he_v))
        return eid

    def endpoint_adjacency(mids: Iterable[int]) -> Dict[GridPoint, List[int]]:
        mp: Dict[GridPoint, List[int]] = {}
        for mid in mids:
            me = microedges[mid]
            mp.setdefault(me.p0, []).append(mid)
            mp.setdefault(me.p1, []).append(mid)
        return mp

    # Build one dual edge per connected component of boundary micro-edges between a face-pair.
    for (a, b), mids in sorted(pair_to_micro.items()):
        ep = endpoint_adjacency(mids)
        unvisited = set(mids)
        while unvisited:
            start = next(iter(unvisited))
            stack = [start]
            comp_mids: List[int] = []
            unvisited.remove(start)
            while stack:
                cur = stack.pop()
                comp_mids.append(cur)
                me = microedges[cur]
                for p in (me.p0, me.p1):
                    for nxt in ep.get(p, []):
                        if nxt in unvisited:
                            unvisited.remove(nxt)
                            stack.append(nxt)

            eid = add_dual_edge(a, b, kind="boundary")
            for mid in comp_mids:
                micro_to_dual_edge[microedges[mid].key()] = eid

    # Boundary runs -> green nodes + edges.
    if green_sides:
        def add_green(side: str, face_id: int, start: int, end_excl: int) -> Tuple[int, int]:
            gid = len(vertices)
            if side in ("top", "bottom"):
                cx = (start + end_excl) / 2.0
                cy = -0.5 if side == "top" else h + 0.5
            else:
                cy = (start + end_excl) / 2.0
                cx = -0.5 if side == "left" else w + 0.5
            vertices.append(DualVertex(id=gid, kind="green", color=None, parent=None, side=side, centroid=(cx, cy)))
            rotation.append([])
            eid = add_dual_edge(face_id, gid, kind="boundary")
            return gid, eid

        # Top side: y=0, segments are (x,0)->(x+1,0), left_face=-1, right_face=comp[0][x]
        if h > 0:
            for face_id, start, end_excl in _boundary_runs([int(comp[0][x]) for x in range(w)]):
                _gid, eid = add_green("top", face_id, start, end_excl)
                for x in range(start, end_excl):
                    mid = add_micro(_MicroEdge(p0=(x, 0), p1=(x + 1, 0), left_face=-1, right_face=face_id))
                    micro_to_dual_edge[microedges[mid].key()] = eid

            for face_id, start, end_excl in _boundary_runs([int(comp[h - 1][x]) for x in range(w)]):
                _gid, eid = add_green("bottom", face_id, start, end_excl)
                for x in range(start, end_excl):
                    mid = add_micro(_MicroEdge(p0=(x, h), p1=(x + 1, h), left_face=face_id, right_face=-1))
                    micro_to_dual_edge[microedges[mid].key()] = eid

            for face_id, start, end_excl in _boundary_runs([int(comp[y][0]) for y in range(h)]):
                _gid, eid = add_green("left", face_id, start, end_excl)
                for y in range(start, end_excl):
                    # Vertical boundary. Canonical direction is UP.
                    mid = add_micro(_MicroEdge(p0=(0, y + 1), p1=(0, y), left_face=-1, right_face=face_id))
                    micro_to_dual_edge[microedges[mid].key()] = eid

            for face_id, start, end_excl in _boundary_runs([int(comp[y][w - 1]) for y in range(h)]):
                _gid, eid = add_green("right", face_id, start, end_excl)
                for y in range(start, end_excl):
                    # Vertical boundary. Canonical direction is UP.
                    mid = add_micro(_MicroEdge(p0=(w, y + 1), p1=(w, y), left_face=face_id, right_face=-1))
                    micro_to_dual_edge[microedges[mid].key()] = eid

    # Build outgoing halfedges for each face to trace its boundary.
    out_map: List[Dict[GridPoint, set]] = [dict() for _ in range(len(face_vertices))]
    dir_to_micro: List[Dict[Tuple[GridPoint, GridPoint], int]] = [dict() for _ in range(len(face_vertices))]

    for mid, me in enumerate(microedges):
        lf, rf = me.left_face, me.right_face
        if 0 <= lf < len(face_vertices):
            out_map[lf].setdefault(me.p0, set()).add(me.p1)
            dir_to_micro[lf][(me.p0, me.p1)] = mid
        if 0 <= rf < len(face_vertices):
            out_map[rf].setdefault(me.p1, set()).add(me.p0)
            dir_to_micro[rf][(me.p1, me.p0)] = mid

    def turn_left(dx: int, dy: int) -> Tuple[int, int]:
        # y increases downward in raster coords.
        return (dy, -dx)

    def turn_right(dx: int, dy: int) -> Tuple[int, int]:
        return (-dy, dx)

    # Trace one boundary cycle per face (currently requires simply connected faces).
    for fid in range(len(face_vertices)):
        directed = dir_to_micro[fid]
        if not directed:
            rotation[fid] = []
            continue
        visited: set = set()
        cycles: List[List[int]] = []
        for (u, v) in directed.keys():
            if (u, v) in visited:
                continue
            start = (u, v)
            cur_u, cur_v = u, v
            seq_edges: List[int] = []
            while True:
                visited.add((cur_u, cur_v))
                mid = directed.get((cur_u, cur_v))
                if mid is None:
                    raise RuntimeError("boundary trace lost a directed edge")
                deid = micro_to_dual_edge.get(microedges[mid].key())
                if deid is None:
                    raise RuntimeError("missing micro->dual mapping for boundary edge")
                seq_edges.append(deid)

                dx = cur_v[0] - cur_u[0]
                dy = cur_v[1] - cur_u[1]
                candidates = [turn_left(dx, dy), (dx, dy), turn_right(dx, dy), (-dx, -dy)]
                nxt: Optional[GridPoint] = None
                outs = out_map[fid].get(cur_v, set())
                for ndx, ndy in candidates:
                    wpt = (cur_v[0] + ndx, cur_v[1] + ndy)
                    if wpt in outs:
                        nxt = wpt
                        break
                if nxt is None:
                    raise RuntimeError("boundary trace hit a dead end")
                cur_u, cur_v = cur_v, nxt
                if (cur_u, cur_v) == start:
                    break
            # compress consecutive duplicates (cycle-aware)
            compressed: List[int] = []
            for e_id in seq_edges:
                if not compressed or compressed[-1] != e_id:
                    compressed.append(e_id)
            if len(compressed) > 1 and compressed[0] == compressed[-1]:
                compressed.pop()
            cycles.append(compressed)

        if len(cycles) != 1:
            raise NotImplementedError(
                f"Face {fid} has {len(cycles)} boundary cycles; only simply connected faces are supported for now."
            )
        edge_order = cycles[0]

        # Convert dual-edge order to half-edge order around this face vertex.
        rot_he: List[int] = []
        for deid in edge_order:
            e = edges[deid]
            if e.u == fid:
                rot_he.append(e.he_u)
            elif e.v == fid:
                rot_he.append(e.he_v)
            else:
                raise RuntimeError("dual edge not incident to traced face")
        rotation[fid] = rot_he

    # Fill trivial rotations for non-face vertices (green nodes) by edge order.
    for vid in range(len(face_vertices), len(vertices)):
        inc: List[int] = []
        for e in edges:
            if e.u == vid:
                inc.append(e.he_u)
            elif e.v == vid:
                inc.append(e.he_v)
        rotation[vid] = inc

    g = EmbeddedDualGraph(vertices=vertices, edges=edges, halfedges=halfedges, rotation=rotation)
    g.validate()
    return g
