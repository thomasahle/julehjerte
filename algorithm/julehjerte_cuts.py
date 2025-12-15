#!/usr/bin/env python3
"""
julehjerte_cuts.py

Compute yellow / purple cut lines for a 2-colour Danish "julehjerte" SVG,
using boundary edges plus straight chords inside faces, solved via CP-SAT.

Usage:
    python julehjerte_cuts.py input.svg output.svg

Dependencies:
    pip install shapely svgpathtools ortools
"""

import argparse
import re
import math
from dataclasses import dataclass
from typing import List, Tuple, Dict, Set
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
    if geom is None or geom.is_empty:
        return
    if isinstance(geom, Polygon):
        if not geom.is_empty:
            yield geom
    elif isinstance(geom, MultiPolygon):
        for p in geom.geoms:
            if not p.is_empty:
                yield p
    elif hasattr(geom, 'geoms'):
        for g in geom.geoms:
            yield from _iter_polygons(g)


def _parse_transform(transform_str: str) -> Tuple[float, float, float, float, float, float]:
    a, b, c, d, e, f = 1, 0, 0, 1, 0, 0
    if not transform_str:
        return (a, b, c, d, e, f)

    rotate_match = re.search(r'rotate\(([^)]+)\)', transform_str)
    if rotate_match:
        parts = re.split(r'[\s,]+', rotate_match.group(1).strip())
        angle = float(parts[0]) * math.pi / 180
        cos_a, sin_a = math.cos(angle), math.sin(angle)
        a, b, c, d = cos_a, sin_a, -sin_a, cos_a

    matrix_match = re.search(r'matrix\(([^)]+)\)', transform_str)
    if matrix_match:
        parts = [float(x) for x in re.split(r'[\s,]+', matrix_match.group(1).strip())]
        if len(parts) >= 6:
            a, b, c, d, e, f = parts[:6]

    translate_match = re.search(r'translate\(([^)]+)\)', transform_str)
    if translate_match:
        parts = [float(x) for x in re.split(r'[\s,]+', translate_match.group(1).strip())]
        e = parts[0] if len(parts) > 0 else 0
        f = parts[1] if len(parts) > 1 else 0

    return (a, b, c, d, e, f)


def _apply_transform(x: float, y: float, t: Tuple) -> Tuple[float, float]:
    a, b, c, d, e, f = t
    return (a * x + c * y + e, b * x + d * y + f)


def _multiply_transforms(t1: Tuple, t2: Tuple) -> Tuple:
    a1, b1, c1, d1, e1, f1 = t1
    a2, b2, c2, d2, e2, f2 = t2
    return (a1*a2 + c1*b2, b1*a2 + d1*b2, a1*c2 + c1*d2, b1*c2 + d1*d2,
            a1*e2 + c1*f2 + e1, b1*e2 + d1*f2 + f1)


def _rect_to_polygon(x, y, w, h, t):
    corners = [(x, y), (x+w, y), (x+w, y+h), (x, y+h)]
    return Polygon([_apply_transform(px, py, t) for px, py in corners])


def _path_to_polygon(path, samples=16):
    pts = []
    for seg in path:
        for i in range(samples):
            z = seg.point(i / samples)
            pts.append((z.real, z.imag))
    if path:
        z = path[-1].point(1.0)
        pts.append((z.real, z.imag))
    if len(pts) < 3:
        return None
    poly = Polygon(pts).buffer(0)
    if isinstance(poly, Polygon):
        return poly
    polys = list(_iter_polygons(poly))
    return max(polys, key=lambda p: p.area) if polys else None


def _extract_fill(style, fill_attr):
    if style:
        m = re.search(r'fill:\s*([^;]+)', style)
        if m and m.group(1).strip().lower() != 'none':
            return m.group(1).strip()
    if fill_attr and fill_attr.lower() != 'none':
        return fill_attr
    return None


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
# SVG -> Mesh (boundaries + chords)
# ---------------------------------------------------------------------------

def parse_svg_polygons(svg_path: str) -> Dict[str, List[Polygon]]:
    """Parse SVG and extract polygons grouped by fill color."""
    tree = ET.parse(svg_path)
    root = tree.getroot()
    polys_by_color: Dict[str, List[Polygon]] = defaultdict(list)

    def process(elem, parent_t):
        t_str = elem.get('transform', '')
        local_t = _parse_transform(t_str)
        combined_t = _multiply_transforms(parent_t, local_t)
        tag = elem.tag.split('}')[-1]

        if tag == 'rect':
            fill = _extract_fill(elem.get('style', ''), elem.get('fill'))
            if fill:
                x, y = float(elem.get('x', 0)), float(elem.get('y', 0))
                w, h = float(elem.get('width', 0)), float(elem.get('height', 0))
                if w > 0 and h > 0:
                    poly = _rect_to_polygon(x, y, w, h, combined_t)
                    if poly.area > 0:
                        polys_by_color[fill].append(poly)

        elif tag == 'path':
            fill = _extract_fill(elem.get('style', ''), elem.get('fill'))
            d = elem.get('d')
            if fill and d:
                try:
                    path = parse_path(d)
                    poly = _path_to_polygon(path)
                    if poly and poly.area > 0:
                        coords = list(poly.exterior.coords)
                        t_coords = [_apply_transform(x, y, combined_t) for x, y in coords]
                        t_poly = Polygon(t_coords).buffer(0)
                        for p in _iter_polygons(t_poly):
                            if p.area > 0:
                                polys_by_color[fill].append(p)
                except:
                    pass

        for child in elem:
            process(child, combined_t)

    process(root, (1, 0, 0, 1, 0, 0))
    return polys_by_color


def build_mesh_from_svg(svg_path: str, vertex_snap_tol: float = 0.1) -> Mesh:
    """
    Parse the SVG, construct a coloured planar subdivision, and build a graph.
    """
    polys_by_colour = parse_svg_polygons(svg_path)

    if len(polys_by_colour) != 2:
        raise ValueError(f"Expected exactly 2 fill colours, found {len(polys_by_colour)}: {list(polys_by_colour.keys())}")

    colours = list(polys_by_colour.keys())

    unions: Dict[str, Polygon] = {}
    for col in colours:
        unions[col] = unary_union(polys_by_colour[col]).buffer(0)

    bg_colour = max(colours, key=lambda c: unions[c].area if hasattr(unions[c], 'area') else 0)
    fg_colour = [c for c in colours if c != bg_colour][0]
    bg_geom = unions[bg_colour]
    fg_geom = unions[fg_colour]

    heart_outline = max(_iter_polygons(bg_geom), key=lambda p: p.area)

    # Planar subdivision from union boundaries
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
            continue
        faces.append(Face(polygon=poly, color=colour))

    print(f"  Found {len(faces)} faces")

    # Build vertex and edge structures
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

    face_boundary_verts: List[List[int]] = []
    edge_faces: Dict[Tuple[int, int], List[int]] = defaultdict(list)

    for fi, f in enumerate(faces):
        ring_coords = list(f.polygon.exterior.coords)[:-1]
        vids = [get_vid(pt) for pt in ring_coords]
        face_boundary_verts.append(vids)
        for i in range(len(vids)):
            v1, v2 = vids[i], vids[(i + 1) % len(vids)]
            if v1 != v2:
                key = (min(v1, v2), max(v1, v2))
                edge_faces[key].append(fi)

    edges: List[Edge] = []
    vertex_edges: List[List[int]] = [[] for _ in range(len(vertices))]

    for (v1, v2), flist in edge_faces.items():
        if len(flist) == 2:
            delta = 1 if faces[flist[0]].color != faces[flist[1]].color else 0
            eid = len(edges)
            edges.append(Edge(v1=v1, v2=v2, delta=delta))
            vertex_edges[v1].append(eid)
            vertex_edges[v2].append(eid)

    delta1 = sum(1 for e in edges if e.delta == 1)
    print(f"  Found {len(edges)} boundary edges ({delta1} color boundaries), {len(vertices)} vertices")

    # Boundary vertices on heart outline
    boundary_vertices: Set[int] = set()
    heart_boundary = LineString(heart_outline.exterior.coords)
    for vid, (x, y) in enumerate(vertices):
        if heart_boundary.distance(Point(x, y)) < vertex_snap_tol * 2:
            boundary_vertices.add(vid)

    print(f"  Found {len(boundary_vertices)} boundary vertices")

    if not edges:
        raise RuntimeError("No edges constructed in mesh.")

    xs = [x for (x, y) in vertices]
    ys = [y for (x, y) in vertices]
    minx, maxx = min(xs), max(xs)
    miny, maxy = min(ys), max(ys)

    # No crossing pairs needed (no chords)
    crossing_pairs: List[Tuple[int, int]] = []

    return Mesh(
        faces=faces,
        vertices=vertices,
        edges=edges,
        vertex_edges=vertex_edges,
        boundary_vertices=boundary_vertices,
        bbox=(minx, miny, maxx, maxy),
        crossing_pairs=crossing_pairs,
    )


# ---------------------------------------------------------------------------
# Cut solver (CP-SAT)
# ---------------------------------------------------------------------------

@dataclass
class CutSolution:
    yellow_edges: List[int]
    purple_edges: List[int]


def solve_cuts(mesh: Mesh) -> CutSolution:
    """
    ILP-based solver using CP-SAT:
    - Each color boundary edge must be used by exactly one color
    - Vertices have degree 0, 1, or 2 for each color
    - Minimize endpoints to encourage connected paths
    - Yellow endpoints on left/right, purple on top/bottom
    """
    model = cp_model.CpModel()

    num_edges = len(mesh.edges)
    num_vertices = len(mesh.vertices)

    # Boolean variables: y[e] = 1 if yellow uses edge e, p[e] = 1 if purple
    y = [model.NewBoolVar(f"y_{e}") for e in range(num_edges)]
    p = [model.NewBoolVar(f"p_{e}") for e in range(num_edges)]

    # Constraint: each color boundary edge used by at most one color
    # (allowing unused edges for path connectivity)
    for e_idx, edge in enumerate(mesh.edges):
        if edge.delta == 1:
            model.Add(y[e_idx] + p[e_idx] <= 1)
        else:
            # Same-color edges: both or neither
            model.Add(y[e_idx] == p[e_idx])

    # Degree and endpoint variables
    boundary_vertices = mesh.boundary_vertices
    is_epY = []
    is_epP = []

    for v in range(num_vertices):
        inc = mesh.vertex_edges[v]
        dY = model.NewIntVar(0, len(inc), f"degY_{v}")
        dP = model.NewIntVar(0, len(inc), f"degP_{v}")
        model.Add(dY == sum(y[e] for e in inc))
        model.Add(dP == sum(p[e] for e in inc))

        epY = model.NewBoolVar(f"epY_{v}")
        epP = model.NewBoolVar(f"epP_{v}")
        is_epY.append(epY)
        is_epP.append(epP)

        if v in boundary_vertices:
            # Boundary vertices: degree 0, 1 (endpoint), or 2 (pass-through)
            model.AddAllowedAssignments([dY, epY], [(0, 0), (1, 1), (2, 0)])
            model.AddAllowedAssignments([dP, epP], [(0, 0), (1, 1), (2, 0)])
        else:
            # Interior vertices: degree 0 or 2 only (no endpoints inside)
            model.Add(epY == 0)
            model.Add(epP == 0)
            model.AddAllowedAssignments([dY], [(0,), (2,)])
            model.AddAllowedAssignments([dP], [(0,), (2,)])

    # Count endpoints
    total_epY = sum(is_epY)
    total_epP = sum(is_epP)

    # Require exactly one path per color (exactly 2 endpoints each)
    model.Add(total_epY == 2)
    model.Add(total_epP == 2)

    # Endpoint position constraints: yellow left↔right, purple top↔bottom
    minx, miny, maxx, maxy = mesh.bbox
    cx, cy = (minx + maxx) / 2, (miny + maxy) / 2

    left, right, top, bottom = [], [], [], []
    for v in boundary_vertices:
        vx, vy = mesh.vertices[v]
        angle = math.atan2(vy - cy, vx - cx)
        if abs(angle) > 2.35:
            left.append(v)
        elif abs(angle) < 0.79:
            right.append(v)
        elif angle < 0:
            top.append(v)
        else:
            bottom.append(v)

    print(f"  Boundary sides: left={len(left)}, right={len(right)}, top={len(top)}, bottom={len(bottom)}")

    # Soft preference for endpoint positions (don't make infeasible)
    if left and right:
        model.Add(sum(is_epY[v] for v in left) >= 1)
        model.Add(sum(is_epY[v] for v in right) >= 1)
    if top and bottom:
        model.Add(sum(is_epP[v] for v in top) >= 1)
        model.Add(sum(is_epP[v] for v in bottom) >= 1)

    # Objective: maximize edge coverage (since we allow unused edges)
    total_edges_used = sum(y) + sum(p)
    model.Maximize(total_edges_used)

    # Solve
    solver = cp_model.CpSolver()
    solver.parameters.max_time_in_seconds = 60.0
    solver.parameters.num_search_workers = 8

    print("  Running CP-SAT solver...")
    status = solver.Solve(model)

    if status == cp_model.OPTIMAL:
        print("  Found OPTIMAL solution")
    elif status == cp_model.FEASIBLE:
        print("  Found FEASIBLE solution")
    else:
        status_names = {0: "UNKNOWN", 1: "MODEL_INVALID", 2: "FEASIBLE", 3: "INFEASIBLE", 4: "OPTIMAL"}
        raise RuntimeError(f"CP-SAT solver failed: {status_names.get(status, status)}")

    yellow_edges = [e for e in range(num_edges) if solver.Value(y[e]) == 1]
    purple_edges = [e for e in range(num_edges) if solver.Value(p[e]) == 1]

    # Report endpoint counts
    y_eps = sum(1 for v in range(num_vertices) if solver.Value(is_epY[v]) == 1)
    p_eps = sum(1 for v in range(num_vertices) if solver.Value(is_epP[v]) == 1)
    print(f"  Yellow: {len(yellow_edges)} edges, {y_eps} endpoints ({y_eps//2} paths)")
    print(f"  Purple: {len(purple_edges)} edges, {p_eps} endpoints ({p_eps//2} paths)")

    return CutSolution(yellow_edges=yellow_edges, purple_edges=purple_edges)


def write_debug_svg(output_path: str, mesh: Mesh) -> None:
    """Write a debug SVG showing the mesh structure."""
    minx, miny, maxx, maxy = mesh.bbox
    width = maxx - minx + 10
    height = maxy - miny + 10

    svg = f'''<?xml version="1.0" encoding="utf-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="{width}mm" height="{height}mm" viewBox="{minx-5} {miny-5} {width} {height}">
'''

    # Draw faces with colors
    for i, face in enumerate(mesh.faces):
        coords = list(face.polygon.exterior.coords)
        points = " ".join(f"{x},{y}" for x, y in coords)
        color = "#ffcccc" if face.color == 1 else "#ccccff"
        svg += f'  <polygon points="{points}" fill="{color}" stroke="gray" stroke-width="0.1" opacity="0.5"/>\n'

    # Draw delta=0 edges first (background), then delta=1 on top
    for edge in mesh.edges:
        if edge.delta == 0:
            v1 = mesh.vertices[edge.v1]
            v2 = mesh.vertices[edge.v2]
            svg += f'  <line x1="{v1[0]}" y1="{v1[1]}" x2="{v2[0]}" y2="{v2[1]}" stroke="lightblue" stroke-width="0.2"/>\n'

    # Draw delta=1 edges prominently on top
    for edge in mesh.edges:
        if edge.delta == 1:
            v1 = mesh.vertices[edge.v1]
            v2 = mesh.vertices[edge.v2]
            svg += f'  <line x1="{v1[0]}" y1="{v1[1]}" x2="{v2[0]}" y2="{v2[1]}" stroke="red" stroke-width="0.8"/>\n'

    # Draw vertices
    for i, (x, y) in enumerate(mesh.vertices):
        color = "green" if i in mesh.boundary_vertices else "black"
        svg += f'  <circle cx="{x}" cy="{y}" r="0.5" fill="{color}"/>\n'

    svg += '</svg>'

    with open(output_path, 'w') as f:
        f.write(svg)


# ---------------------------------------------------------------------------
# SVG output
# ---------------------------------------------------------------------------

def write_svg_with_cuts(input_svg: str, output_svg: str, mesh: Mesh, sol: CutSolution) -> None:
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
            "x1": str(x1), "y1": str(y1),
            "x2": str(x2), "y2": str(y2),
            "stroke": "gold", "stroke-width": "1.8",
            "fill": "none", "stroke-linecap": "round",
        })
        cuts_group.append(line)

    for eidx in sol.purple_edges:
        edge = mesh.edges[eidx]
        x1, y1 = mesh.vertices[edge.v1]
        x2, y2 = mesh.vertices[edge.v2]
        line = mk("line", {
            "x1": str(x1), "y1": str(y1),
            "x2": str(x2), "y2": str(y2),
            "stroke": "violet", "stroke-width": "1.2",
            "fill": "none", "stroke-linecap": "round",
        })
        cuts_group.append(line)

    root.append(cuts_group)
    tree.write(output_svg, encoding="utf-8", xml_declaration=True)


# ---------------------------------------------------------------------------
# CLI
# ---------------------------------------------------------------------------

def main():
    parser = argparse.ArgumentParser(
        description="Compute julehjerte cut lines from a 2-colour SVG"
    )
    parser.add_argument("input_svg", help="Input SVG file (2 fill colours)")
    parser.add_argument("output_svg", help="Output SVG with cut lines overlaid")
    parser.add_argument("--debug", action="store_true", help="Write debug mesh visualization")
    args = parser.parse_args()

    print(f"Reading {args.input_svg}...")
    mesh = build_mesh_from_svg(args.input_svg)

    if args.debug:
        debug_path = args.output_svg.replace('.svg', '_mesh.svg')
        print(f"Writing debug mesh to {debug_path}...")
        write_debug_svg(debug_path, mesh)

    print("Solving for cuts...")
    sol = solve_cuts(mesh)
    print(f"  Yellow: {len(sol.yellow_edges)} edges")
    print(f"  Purple: {len(sol.purple_edges)} edges")

    print(f"Writing {args.output_svg}...")
    write_svg_with_cuts(args.input_svg, args.output_svg, mesh, sol)
    print("Done!")


if __name__ == "__main__":
    main()
