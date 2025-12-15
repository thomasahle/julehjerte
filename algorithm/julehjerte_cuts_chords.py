#!/usr/bin/env python3
"""
julehjerte_cuts_chords.py

Compute yellow / purple cut lines for a 2-colour Danish "julehjerte" SVG,
using only face boundaries plus straight chords inside faces, rather than
full triangulation.

Usage:
    python julehjerte_cuts_chords.py input.svg output.svg

Dependencies:
    pip install shapely svgpathtools ortools
"""

import argparse
import math
import re
from dataclasses import dataclass
from typing import List, Tuple, Dict, Set, Optional
from collections import defaultdict

from shapely.geometry import Polygon, MultiPolygon, LineString, LinearRing, Point
from shapely.ops import polygonize, unary_union

from svgpathtools import parse_path

from ortools.sat.python import cp_model

import xml.etree.ElementTree as ET


# ---------------------------------------------------------------------------
# Geometry helpers
# ---------------------------------------------------------------------------

def _iter_polygons(geom):
    if isinstance(geom, Polygon):
        if not geom.is_empty:
            yield geom
    elif isinstance(geom, MultiPolygon):
        for p in geom.geoms:
            if not p.is_empty:
                yield p
    else:
        raise TypeError(f"Expected Polygon or MultiPolygon, got {type(geom)}")


def _path_to_polygon(path, samples_per_segment: int = 16) -> Polygon:
    """Approximate an SVG path by sampling."""
    pts: List[Tuple[float, float]] = []
    for seg in path:
        for i in range(samples_per_segment):
            t = i / float(samples_per_segment)
            z = seg.point(t)
            pts.append((z.real, z.imag))
    if len(path) > 0:
        z = path[-1].point(1.0)
        pts.append((z.real, z.imag))
    if len(pts) < 3:
        raise ValueError("Path has too few points to form a polygon")
    poly = Polygon(pts).buffer(0)
    if isinstance(poly, MultiPolygon):
        poly = max(_iter_polygons(poly), key=lambda p: p.area)
    return poly


def _extract_fill_attr(attr: Dict[str, str]) -> Optional[str]:
    """Get fill color from SVG attributes, falling back to style strings."""
    return _extract_fill(attr.get("style", ""), attr.get("fill"))


def _extract_fill(style: str, fill_attr: Optional[str]) -> Optional[str]:
    if style:
        m = re.search(r"fill:\s*([^;]+)", style)
        if m:
            val = m.group(1).strip()
            if val.lower() != "none":
                return val
    if fill_attr and fill_attr.lower() != "none":
        return fill_attr
    return None


def _parse_transform(transform_str: str) -> Tuple[float, float, float, float, float, float]:
    a, b, c, d, e, f = 1, 0, 0, 1, 0, 0
    if not transform_str:
        return (a, b, c, d, e, f)

    rotate_match = re.search(r"rotate\(([^)]+)\)", transform_str)
    if rotate_match:
        parts = re.split(r"[\s,]+", rotate_match.group(1).strip())
        angle = float(parts[0]) * math.pi / 180
        cos_a, sin_a = math.cos(angle), math.sin(angle)
        a, b, c, d = cos_a, sin_a, -sin_a, cos_a

    matrix_match = re.search(r"matrix\(([^)]+)\)", transform_str)
    if matrix_match:
        parts = [float(x) for x in re.split(r"[\s,]+", matrix_match.group(1).strip())]
        if len(parts) >= 6:
            a, b, c, d, e, f = parts[:6]

    translate_match = re.search(r"translate\(([^)]+)\)", transform_str)
    if translate_match:
        parts = [float(x) for x in re.split(r"[\s,]+", translate_match.group(1).strip())]
        e = parts[0] if len(parts) > 0 else 0
        f = parts[1] if len(parts) > 1 else 0

    return (a, b, c, d, e, f)


def _apply_transform(x: float, y: float, t: Tuple[float, float, float, float, float, float]) -> Tuple[float, float]:
    a, b, c, d, e, f = t
    return (a * x + c * y + e, b * x + d * y + f)


def _multiply_transforms(t1: Tuple[float, float, float, float, float, float],
                         t2: Tuple[float, float, float, float, float, float]) -> Tuple[float, float, float, float, float, float]:
    a1, b1, c1, d1, e1, f1 = t1
    a2, b2, c2, d2, e2, f2 = t2
    return (
        a1 * a2 + c1 * b2,
        b1 * a2 + d1 * b2,
        a1 * c2 + c1 * d2,
        b1 * c2 + d1 * d2,
        a1 * e2 + c1 * f2 + e1,
        b1 * e2 + d1 * f2 + f1,
    )


def _rect_to_polygon(x: float, y: float, w: float, h: float,
                     t: Tuple[float, float, float, float, float, float]) -> Polygon:
    corners = [(x, y), (x + w, y), (x + w, y + h), (x, y + h)]
    return Polygon([_apply_transform(px, py, t) for px, py in corners])


# ---------------------------------------------------------------------------
# Mesh data structures
# ---------------------------------------------------------------------------

@dataclass
class Face:
    polygon: Polygon
    color: int  # 0 or 1


@dataclass
class Edge:
    v1: int
    v2: int
    delta: int  # 1 if crossing a colour boundary; 0 if inside a single-colour region


@dataclass
class Mesh:
    faces: List[Face]
    vertices: List[Tuple[float, float]]
    edges: List[Edge]
    vertex_edges: List[List[int]]  # for each vertex, list of incident edge indices
    boundary_vertices: Set[int]
    bbox: Tuple[float, float, float, float]  # (minx, miny, maxx, maxy)
    crossing_pairs: List[Tuple[int, int]]  # candidate chord pairs that cross


# ---------------------------------------------------------------------------
# SVG -> Mesh (boundaries + chords only)
# ---------------------------------------------------------------------------

def parse_svg_polygons(svg_path: str) -> Dict[str, List[Polygon]]:
    """Parse the SVG tree and extract polygons grouped by fill color."""
    tree = ET.parse(svg_path)
    root = tree.getroot()
    polys_by_color: Dict[str, List[Polygon]] = defaultdict(list)

    def process(elem, parent_t):
        t_str = elem.get("transform", "")
        local_t = _parse_transform(t_str)
        combined_t = _multiply_transforms(parent_t, local_t)
        tag = elem.tag.split("}")[-1]

        if tag == "rect":
            fill = _extract_fill(elem.get("style", ""), elem.get("fill"))
            if fill:
                x = float(elem.get("x", 0))
                y = float(elem.get("y", 0))
                w = float(elem.get("width", 0))
                h = float(elem.get("height", 0))
                if w > 0 and h > 0:
                    poly = _rect_to_polygon(x, y, w, h, combined_t)
                    if poly.area > 0:
                        polys_by_color[fill].append(poly)

        elif tag == "path":
            fill = _extract_fill(elem.get("style", ""), elem.get("fill"))
            d = elem.get("d")
            if fill and d:
                try:
                    path = parse_path(d)
                    poly = _path_to_polygon(path)
                    coords = list(poly.exterior.coords)
                    t_coords = [_apply_transform(x, y, combined_t) for x, y in coords]
                    t_poly = Polygon(t_coords).buffer(0)
                    for p in _iter_polygons(t_poly):
                        if p.area > 0:
                            polys_by_color[fill].append(p)
                except Exception:
                    pass

        for child in elem:
            process(child, combined_t)

    process(root, (1, 0, 0, 1, 0, 0))
    return polys_by_color


def build_mesh_from_svg(svg_path: str,
                        vertex_snap_tol: float = 1e-6) -> Mesh:
    """
    Parse the SVG, construct a coloured planar subdivision, and build a graph:

      * vertices: all boundary vertices of faces
      * edges:
          - boundary between faces of different colours (delta=1)
          - boundary between faces of same colour (delta=0)
          - straight chords inside each face between suitable boundary vertices (delta=0)

    Also pre-computes which chords geometrically cross.
    """

    # --- Parse SVG and collect polygons per fill colour ---
    polys_by_colour: Dict[str, List[Polygon]] = parse_svg_polygons(svg_path)

    if len(polys_by_colour) != 2:
        raise ValueError(
            f"Expected exactly 2 fill colours in SVG, found {len(polys_by_colour)}"
        )

    colours = list(polys_by_colour.keys())
    unions: Dict[str, Polygon] = {}
    for col in colours:
        unions[col] = unary_union(polys_by_colour[col]).buffer(0)

    bg_colour = max(colours, key=lambda c: unions[c].area)
    fg_colour = [c for c in colours if c != bg_colour][0]

    bg_geom = unions[bg_colour]
    fg_geom = unions[fg_colour]

    all_union = unary_union([bg_geom, fg_geom]).buffer(0)
    heart_outline = max(_iter_polygons(all_union), key=lambda p: p.area)
    heart_outline = Polygon(heart_outline.exterior)

    # --- Planar subdivision from all boundaries ---
    lines = []
    for geom in [bg_geom, fg_geom]:
        for poly in _iter_polygons(geom):
            lines.append(LinearRing(poly.exterior.coords))
            for ring in poly.interiors:
                lines.append(LinearRing(ring.coords))

    merged_lines = unary_union(lines)
    raw_faces = list(polygonize(merged_lines))

    faces: List[Face] = []
    for poly in raw_faces:
        rep = poly.representative_point()
        if not heart_outline.contains(rep):
            continue
        if fg_geom.contains(rep):
            colour = 1
        elif bg_geom.contains(rep):
            colour = 0
        else:
            # Treat uncovered regions inside the outline as background.
            colour = 0
        faces.append(Face(polygon=poly, color=colour))

    if not faces:
        raise RuntimeError("No faces found inside heart region.")

    # --- Global vertex map (quantised) ---
    def q(pt):
        x, y = pt
        return (round(x / vertex_snap_tol) * vertex_snap_tol,
                round(y / vertex_snap_tol) * vertex_snap_tol)

    vertex_index: Dict[Tuple[float, float], int] = {}
    vertices: List[Tuple[float, float]] = []

    def get_vid(pt) -> int:
        key = q(pt)
        if key not in vertex_index:
            vertex_index[key] = len(vertices)
            vertices.append(key)
        return vertex_index[key]

    # Per-face boundary vertex sequences
    face_boundary_verts: List[List[int]] = []

    # Map undirected boundary edges to incident faces
    edge_faces: Dict[Tuple[int, int], List[int]] = defaultdict(list)

    for fi, f in enumerate(faces):
        ring_coords = list(f.polygon.exterior.coords)[:-1]  # drop closing point
        vids = [get_vid(pt) for pt in ring_coords]
        face_boundary_verts.append(vids)
        n = len(vids)
        for i in range(n):
            v1 = vids[i]
            v2 = vids[(i + 1) % n]
            if v1 == v2:
                continue
            key = (v1, v2) if v1 < v2 else (v2, v1)
            edge_faces[key].append(fi)

    # --- Boundary edges between faces (delta = 0 or 1) ---
    edges: List[Edge] = []
    vertex_edges: List[List[int]] = [[] for _ in range(len(vertices))]
    existing_edge_keys: Set[Tuple[int, int]] = set()

    for (v1, v2), flist in edge_faces.items():
        if len(flist) != 2:
            # boundary of heart; no interior edge
            continue
        f1, f2 = flist
        delta = 1 if faces[f1].color != faces[f2].color else 0
        eid = len(edges)
        edges.append(Edge(v1=v1, v2=v2, delta=delta))
        vertex_edges[v1].append(eid)
        vertex_edges[v2].append(eid)
        existing_edge_keys.add((v1, v2) if v1 < v2 else (v2, v1))

    # --- Add straight chords inside each face (delta = 0) ---
    # We also record per-face chord edges for later crossing checks.
    face_chord_edges: List[List[int]] = [[] for _ in range(len(faces))]

    for fi, f in enumerate(faces):
        vids = face_boundary_verts[fi]
        n = len(vids)
        poly = f.polygon
        # A slightly eroded polygon to ensure chord interior is strictly inside
        inner_poly = poly.buffer(-1e-6)
        if inner_poly.is_empty:
            inner_poly = poly

        for i in range(n):
            for j in range(i + 2, n):  # skip adjacent vertices; also avoids wrap
                # Also skip edge that closes the ring
                if i == 0 and j == n - 1:
                    continue
                v1 = vids[i]
                v2 = vids[j]
                key = (v1, v2) if v1 < v2 else (v2, v1)
                if key in existing_edge_keys:
                    continue  # already a boundary edge

                p1 = vertices[v1]
                p2 = vertices[v2]
                seg = LineString([p1, p2])

                # Check interior lies strictly within the face
                mid = Point((p1[0] + p2[0]) * 0.5, (p1[1] + p2[1]) * 0.5)
                if not inner_poly.contains(mid):
                    continue

                # Okay, this is a valid chord inside face fi
                eid = len(edges)
                edges.append(Edge(v1=v1, v2=v2, delta=0))
                vertex_edges[v1].append(eid)
                vertex_edges[v2].append(eid)
                existing_edge_keys.add(key)
                face_chord_edges[fi].append(eid)

    if not edges:
        raise RuntimeError("No edges constructed in mesh.")

    # --- Boundary vertices: vertices lying on outer heart boundary ---
    boundary_vertices: Set[int] = set()
    heart_boundary = LineString(heart_outline.exterior.coords)
    for vid, (x, y) in enumerate(vertices):
        pt = Point(x, y)
        if heart_boundary.distance(pt) < 1e-5:
            boundary_vertices.add(vid)

    if len(boundary_vertices) < 4:
        raise RuntimeError(
            "Too few boundary vertices detected; check SVG or snap tolerance."
        )

    # --- Pair up any interior vertices with odd colour-boundary degree ---
    odd_interior = [
        v for v in range(len(vertices))
        if v not in boundary_vertices
        and sum(1 for e in vertex_edges[v] if edges[e].delta == 1) % 2 == 1
    ]

    edge_lookup: Dict[Tuple[int, int], List[int]] = defaultdict(list)
    for idx, e in enumerate(edges):
        key = (e.v1, e.v2) if e.v1 < e.v2 else (e.v2, e.v1)
        edge_lookup[key].append(idx)

    def _dist2(a: int, b: int) -> float:
        ax, ay = vertices[a]
        bx, by = vertices[b]
        dx = ax - bx
        dy = ay - by
        return dx * dx + dy * dy

    while len(odd_interior) >= 2:
        v = odd_interior.pop()
        nearest = min(odd_interior, key=lambda u: _dist2(v, u))
        odd_interior.remove(nearest)
        key = (v, nearest) if v < nearest else (nearest, v)
        eid = len(edges)
        edges.append(Edge(v1=v, v2=nearest, delta=1))
        vertex_edges[v].append(eid)
        vertex_edges[nearest].append(eid)
        existing_edge_keys.add(key)
        edge_lookup[key].append(eid)

    # Pair boundary odd-degree vertices down to four remaining
    odd_boundary = {
        v for v in boundary_vertices
        if sum(1 for e in vertex_edges[v] if edges[e].delta == 1) % 2 == 1
    }

    # Target odd vertices on the geometric extremes (left/right/top/bottom)
    pinned = set()
    pinned.add(min(boundary_vertices, key=lambda v: vertices[v][0]))
    pinned.add(max(boundary_vertices, key=lambda v: vertices[v][0]))
    pinned.add(min(boundary_vertices, key=lambda v: vertices[v][1]))
    pinned.add(max(boundary_vertices, key=lambda v: vertices[v][1]))

    needs_flip = list((odd_boundary - pinned) | (pinned - odd_boundary))
    while len(needs_flip) >= 2:
        v = needs_flip.pop()
        nearest = min(needs_flip, key=lambda u: _dist2(v, u))
        needs_flip.remove(nearest)
        key = (v, nearest) if v < nearest else (nearest, v)
        eid = len(edges)
        edges.append(Edge(v1=v, v2=nearest, delta=1))
        vertex_edges[v].append(eid)
        vertex_edges[nearest].append(eid)
        existing_edge_keys.add(key)
        edge_lookup[key].append(eid)

    xs = [x for (x, y) in vertices]
    ys = [y for (x, y) in vertices]
    minx, maxx = min(xs), max(xs)
    miny, maxy = min(ys), max(ys)

    # --- Precompute crossing chord pairs (same face only) ---
    crossing_pairs: List[Tuple[int, int]] = []

    # Quick helper to build LineString per edge when needed
    def edge_segment(eid: int) -> LineString:
        e = edges[eid]
        return LineString([vertices[e.v1], vertices[e.v2]])

    for fi, chord_eids in enumerate(face_chord_edges):
        m = len(chord_eids)
        for a in range(m):
            e1 = chord_eids[a]
            seg1 = edge_segment(e1)
            for b in range(a + 1, m):
                e2 = chord_eids[b]
                seg2 = edge_segment(e2)
                # chords share no vertex if all endpoints distinct
                e1v = {edges[e1].v1, edges[e1].v2}
                e2v = {edges[e2].v1, edges[e2].v2}
                if e1v & e2v:
                    continue
                # Check if they cross in the interior
                if seg1.crosses(seg2):
                    crossing_pairs.append((e1, e2))

    mesh = Mesh(
        faces=faces,
        vertices=vertices,
        edges=edges,
        vertex_edges=vertex_edges,
        boundary_vertices=boundary_vertices,
        bbox=(minx, miny, maxx, maxy),
        crossing_pairs=crossing_pairs,
    )
    return mesh


# ---------------------------------------------------------------------------
# Cut solver (CP-SAT)
# ---------------------------------------------------------------------------

@dataclass
class CutSolution:
    yellow_edges: List[int]
    purple_edges: List[int]


def solve_cuts(mesh: Mesh) -> CutSolution:
    model = cp_model.CpModel()

    num_edges = len(mesh.edges)
    num_vertices = len(mesh.vertices)

    # y_e, p_e ∈ {0,1}
    y = [model.NewBoolVar(f"y_{e}") for e in range(num_edges)]
    p = [model.NewBoolVar(f"p_{e}") for e in range(num_edges)]

    double = [None] * num_edges
    base_cost_terms = []

    for e_idx, edge in enumerate(mesh.edges):
        if edge.delta == 1:
            # colour boundary: exactly one colour crosses
            model.Add(y[e_idx] + p[e_idx] == 1)
        else:
            # inside same-colour region: either none or both colours
            model.Add(y[e_idx] == p[e_idx])
            d = model.NewBoolVar(f"dbl_{e_idx}")
            model.Add(d <= y[e_idx])
            model.Add(d <= p[e_idx])
            model.Add(d >= y[e_idx] + p[e_idx] - 1)
            double[e_idx] = d

        base_cost_terms.append(y[e_idx])
        base_cost_terms.append(p[e_idx])

    # Degrees and endpoints
    degY = []
    degP = []
    is_epY = []
    is_epP = []

    boundary_vertices = mesh.boundary_vertices
    boundary_list = sorted(boundary_vertices)

    for v in range(num_vertices):
        inc = mesh.vertex_edges[v]
        max_deg = len(inc)
        dY = model.NewIntVar(0, max_deg, f"degY_{v}")
        dP = model.NewIntVar(0, max_deg, f"degP_{v}")
        model.Add(dY == sum(y[e] for e in inc))
        model.Add(dP == sum(p[e] for e in inc))
        degY.append(dY)
        degP.append(dP)

        epY = model.NewBoolVar(f"epY_{v}")
        epP = model.NewBoolVar(f"epP_{v}")
        is_epY.append(epY)
        is_epP.append(epP)

        if v in boundary_vertices:
            even_vals = [d for d in range(0, max_deg + 1) if d % 2 == 0]
            allowed_y = [(1, 1)] + [(d, 0) for d in even_vals if d != 1]
            allowed_p = [(1, 1)] + [(d, 0) for d in even_vals if d != 1]
            model.AddAllowedAssignments([dY, epY], allowed_y)
            model.AddAllowedAssignments([dP, epP], allowed_p)
        else:
            model.Add(epY == 0)
            model.Add(epP == 0)
            model.AddModuloEquality(0, dY, 2)
            model.AddModuloEquality(0, dP, 2)

    odd_boundary = [
        v for v in boundary_list
        if sum(1 for e in mesh.vertex_edges[v] if mesh.edges[e].delta == 1) % 2 == 1
    ]
    num_endpoints = max(2, len(odd_boundary) // 2)
    # Exactly num_endpoints endpoints per colour
    model.Add(sum(is_epY[v] for v in boundary_list) == num_endpoints)
    model.Add(sum(is_epP[v] for v in boundary_list) == num_endpoints)

    # Geometric sides: left/right/top/bottom classification
    minx, miny, maxx, maxy = mesh.bbox
    dx = maxx - minx
    dy = maxy - miny
    epsx = dx * 0.05
    epsy = dy * 0.05

    left = [v for v in boundary_list
            if mesh.vertices[v][0] <= minx + epsx]
    right = [v for v in boundary_list
             if mesh.vertices[v][0] >= maxx - epsx]
    top = [v for v in boundary_list
           if mesh.vertices[v][1] <= miny + epsy]
    bottom = [v for v in boundary_list
              if mesh.vertices[v][1] >= maxy - epsy]

    if not left or not right or not top or not bottom:
        raise RuntimeError("Failed to classify boundary sides.")

    # Yellow: left -> right, purple: top -> bottom
    model.Add(sum(is_epY[v] for v in left) >= 1)
    model.Add(sum(is_epY[v] for v in right) >= 1)
    model.Add(sum(is_epP[v] for v in top) >= 1)
    model.Add(sum(is_epP[v] for v in bottom) >= 1)

    # Crossing chords: forbid same-colour use of both
    for e1, e2 in mesh.crossing_pairs:
        model.Add(y[e1] + y[e2] <= 1)
        model.Add(p[e1] + p[e2] <= 1)

    # Objective: minimise number of double edges and overall used edges
    double_terms = [d for d in double if d is not None]

    lambda_double = 100
    lambda_edges = 1

    obj_terms = []
    if double_terms:
        obj_terms.append(lambda_double * sum(double_terms))
    obj_terms.append(lambda_edges * sum(base_cost_terms))

    model.Minimize(sum(obj_terms))

    solver = cp_model.CpSolver()
    solver.parameters.max_time_in_seconds = 60.0
    solver.parameters.num_search_workers = 8

    status = solver.Solve(model)
    if status not in (cp_model.OPTIMAL, cp_model.FEASIBLE):
        raise RuntimeError(f"CP-SAT solver failed with status {status}")

    yellow_edges = [e for e in range(num_edges) if solver.Value(y[e]) == 1]
    purple_edges = [e for e in range(num_edges) if solver.Value(p[e]) == 1]

    return CutSolution(yellow_edges=yellow_edges, purple_edges=purple_edges)


# ---------------------------------------------------------------------------
# SVG output
# ---------------------------------------------------------------------------

def write_svg_with_cuts(input_svg: str,
                        output_svg: str,
                        mesh: Mesh,
                        sol: CutSolution) -> None:
    tree = ET.parse(input_svg)
    root = tree.getroot()

    tag = root.tag
    if tag.startswith("{"):
        ns = tag[1:].split("}")[0]
    else:
        ns = None

    def mk(tag_name: str, attrib: Dict[str, str]):
        if ns:
            return ET.Element(f"{{{ns}}}{tag_name}", attrib)
        else:
            return ET.Element(tag_name, attrib)

    cuts_group = mk("g", {"id": "julehjerte_cuts"})

    # Draw yellow then purple on top
    for eidx in sol.yellow_edges:
        edge = mesh.edges[eidx]
        x1, y1 = mesh.vertices[edge.v1]
        x2, y2 = mesh.vertices[edge.v2]
        line = mk("line", {
            "x1": str(x1),
            "y1": str(y1),
            "x2": str(x2),
            "y2": str(y2),
            "stroke": "gold",
            "stroke-width": "1.8",
            "fill": "none",
            "stroke-linecap": "round",
        })
        cuts_group.append(line)

    for eidx in sol.purple_edges:
        edge = mesh.edges[eidx]
        x1, y1 = mesh.vertices[edge.v1]
        x2, y2 = mesh.vertices[edge.v2]
        line = mk("line", {
            "x1": str(x1),
            "y1": str(y1),
            "x2": str(x2),
            "y2": str(y2),
            "stroke": "violet",
            "stroke-width": "1.2",
            "fill": "none",
            "stroke-linecap": "round",
        })
        cuts_group.append(line)

    root.append(cuts_group)
    tree.write(output_svg, encoding="utf-8", xml_declaration=True)


# ---------------------------------------------------------------------------
# CLI
# ---------------------------------------------------------------------------

def main():
    parser = argparse.ArgumentParser(
        description="Compute julehjerte cut lines from a 2-colour SVG "
                    "using boundary edges + straight chords."
    )
    parser.add_argument("input_svg", help="Input SVG file (2 fill colours)")
    parser.add_argument("output_svg", help="Output SVG with cut lines overlaid")
    args = parser.parse_args()

    mesh = build_mesh_from_svg(args.input_svg)
    sol = solve_cuts(mesh)
    write_svg_with_cuts(args.input_svg, args.output_svg, mesh, sol)


if __name__ == "__main__":
    main()
