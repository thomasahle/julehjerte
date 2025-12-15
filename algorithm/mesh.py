
#!/usr/bin/env python3
from __future__ import annotations
"""
SVG -> planar mesh for julehjerte optimisation.

This script:

  * parses an SVG (rects, circles, paths, etc., with transforms),
  * keeps the two dominant fill colours,
  * computes the visible regions of those colours (respecting z-order),
  * builds a planar subdivision (faces, edges, vertices),
  * and can write out an SVG overlay that shows all mesh edges as lines.

Usage:
    python svg_to_mesh.py input.svg overlay.svg

Dependencies:
    pip install shapely svgelements
"""

from dataclasses import dataclass
from typing import List, Tuple, Dict, Optional, Set, TYPE_CHECKING
from collections import defaultdict
import sys
import xml.etree.ElementTree as ET
from math import hypot

from shapely.geometry import (
    Polygon,
    MultiPolygon,
    LineString,
    LinearRing,
    Point,
    GeometryCollection,
    MultiLineString,
    MultiPoint,
)
from shapely.ops import unary_union, polygonize

if TYPE_CHECKING:
    from svgelements import SVG, Path, Shape  # type: ignore
    from svgelements import Matrix  # type: ignore


# ----------------------------------------------------------------------
# Helpers
# ----------------------------------------------------------------------

def iter_polygons(geom):
    """Yield Polygon objects from Polygon / MultiPolygon / GeometryCollection."""
    if isinstance(geom, Polygon):
        if not geom.is_empty:
            yield geom
    elif isinstance(geom, MultiPolygon):
        for p in geom.geoms:
            if not p.is_empty:
                yield p
    elif isinstance(geom, GeometryCollection):
        for g in geom.geoms:
            yield from iter_polygons(g)
    else:
        raise TypeError(f"Unexpected geometry type {type(geom)}")


def path_to_polygon(path: "Path",
                    max_segment_len: float = 1.0) -> Polygon:
    """
    Approximate an SVG Path as a Polygon by sampling along each segment.

    max_segment_len controls sampling density in user units.
    """
    pts: List[Tuple[float, float]] = []

    for seg in path:
        try:
            seg_len = seg.length(error=1e-2)
        except Exception:
            seg_len = 1.0
        n = max(2, int(seg_len / max_segment_len))

        for i in range(n):
            t = i / float(n)
            z = seg.point(t)
            pts.append((z.real, z.imag))

    if len(path) > 0:
        z = path[-1].end
        pts.append((z.real, z.imag))

    if len(pts) < 3:
        raise ValueError("Path too short to form a polygon")

    poly = Polygon(pts).buffer(0)  # clean topology
    if isinstance(poly, MultiPolygon):
        poly = max(iter_polygons(poly), key=lambda p: p.area)
    return poly


# ----------------------------------------------------------------------
# Mesh data structures
# ----------------------------------------------------------------------

@dataclass
class Face:
    id: int
    color: int          # 0 or 1
    polygon: Polygon
    boundary: List[int]  # vertex indices in order (outer ring only)


@dataclass
class Edge:
    id: int
    v1: int
    v2: int
    f1: Optional[int]   # one adjacent face (or None)
    f2: Optional[int]   # other adjacent face (or None)
    delta: int          # 1 if colours differ across edge, else 0 (if two faces)


@dataclass
class Mesh:
    vertices: List[Tuple[float, float]]
    faces: List[Face]
    edges: List[Edge]
    vertex_edges: List[List[int]]  # for each vertex, list of incident edge ids
    boundary_vertices: Set[int]


# ----------------------------------------------------------------------
# Derived helpers (e.g. root nodes)
# ----------------------------------------------------------------------

def find_root_nodes(mesh: Mesh,
                    snap_tol: float = 1e-3,
                    merge_tol: Optional[float] = None,
                    svg_path: Optional[str] = None,
                    max_segment_len: float = 1.0) -> List[Tuple[float, float]]:
    """
    Root nodes: points along the outer bounding box where the visible colour
    switches between the two main fills. Computed by intersecting each colour
    union with the rectangle perimeter and taking segment endpoints.
    """
    if merge_tol is None:
        merge_tol = snap_tol * 2

    if svg_path:
        shapes = parse_svg_shapes(svg_path, max_segment_len=max_segment_len)
        c0, c1 = pick_two_main_colours(shapes)
        vis0, vis1 = compute_visible_regions(shapes, c0, c1)
        col0_union = unary_union(vis0).buffer(0)
        col1_union = unary_union(vis1).buffer(0)
        heart_geom = unary_union([col0_union, col1_union]).buffer(0)
    else:
        col0_union = unary_union([f.polygon for f in mesh.faces if f.color == 0]).buffer(0)
        col1_union = unary_union([f.polygon for f in mesh.faces if f.color == 1]).buffer(0)
        heart_geom = unary_union([col0_union, col1_union]).buffer(0)

    # Use the largest polygon outline to measure perimeter distance.
    poly = None
    for p in iter_polygons(heart_geom):
        if poly is None or p.area > poly.area:
            poly = p
    if poly is None:
        return []

    outline = LineString(poly.exterior.coords)
    perim_len = outline.length
    bbox_poly = Polygon(outline.coords)
    bbox_perim = bbox_poly.boundary

    def collect_endpoints(geom, dists: List[float]):
        if geom.is_empty:
            return
        if isinstance(geom, Point):
            dists.append(bbox_perim.project(geom))
        elif isinstance(geom, MultiPoint):
            for g in geom.geoms:
                dists.append(bbox_perim.project(g))
        elif isinstance(geom, (LineString, LinearRing)):
            coords = list(geom.coords)
            if coords:
                dists.append(bbox_perim.project(Point(coords[0])))
                dists.append(bbox_perim.project(Point(coords[-1])))
        elif isinstance(geom, MultiLineString):
            for g in geom.geoms:
                collect_endpoints(g, dists)
        elif isinstance(geom, GeometryCollection):
            for g in geom.geoms:
                collect_endpoints(g, dists)

    dists: List[float] = []
    collect_endpoints(bbox_perim.intersection(col0_union), dists)
    collect_endpoints(bbox_perim.intersection(col1_union), dists)

    if not dists:
        # Fallback: boundary vertices that see exactly one colour-change edge.
        deg = defaultdict(int)
        for e in mesh.edges:
            if e.delta == 1:
                deg[e.v1] += 1
                deg[e.v2] += 1
        return [mesh.vertices[v] for v, d in deg.items()
                if d == 1 and v in mesh.boundary_vertices]

    # Deduplicate distances
    snap_dists = []
    for d in dists:
        qd = round(d / snap_tol) * snap_tol
        if all(abs(qd - od) > merge_tol for od in snap_dists):
            snap_dists.append(qd)

    snap_dists.extend([0.0, perim_len])
    snap_dists = sorted(set(snap_dists))

    # Walk intervals and detect colour changes
    roots_dists: List[float] = []
    col0_prep = col0_union.buffer(snap_tol * 5)
    current_color = None
    for i in range(len(snap_dists) - 1):
        mid = (snap_dists[i] + snap_dists[i + 1]) / 2.0
        mid_pt = bbox_perim.interpolate(mid % perim_len)
        inside0 = col0_prep.contains(mid_pt)
        color = 0 if inside0 else 1
        if current_color is None:
            current_color = color
        elif color != current_color:
            roots_dists.append(snap_dists[i])
            current_color = color

    final_pts: List[Tuple[float, float]] = []
    for d in roots_dists:
        px, py = bbox_perim.interpolate(d % perim_len).coords[0]
        final_pts.append((px, py))

    return final_pts

    # Fallback: boundary vertices that see exactly one colour-change edge.
    deg = defaultdict(int)
    for e in mesh.edges:
        if e.delta == 1:
            deg[e.v1] += 1
            deg[e.v2] += 1
    return [mesh.vertices[v] for v, d in deg.items()
            if d == 1 and v in mesh.boundary_vertices]


# ----------------------------------------------------------------------
# Step 1: Parse SVG into (polygon, fill, z_index)
# ----------------------------------------------------------------------

def parse_svg_shapes(svg_path: str,
                     max_segment_len: float = 1.0):
    """
    Parse an SVG using svgelements and return a list of
    (polygon, fill_colour_string, z_index) for filled shapes.
    """
    from svgelements import SVG, Path, Shape  # type: ignore
    from svgelements import Matrix  # type: ignore
    svg = SVG.parse(svg_path)
    inv_viewbox: Optional[Matrix] = None
    if getattr(svg, "viewbox_transform", None):
        try:
            inv_viewbox = ~Matrix(svg.viewbox_transform)
        except Exception:
            inv_viewbox = None
    shapes = []

    for z, elem in enumerate(svg.elements()):
        if not isinstance(elem, Shape):
            continue

        fill_obj = getattr(elem, "fill", None)
        if fill_obj is None:
            continue
        fill_str = str(fill_obj)
        if not fill_str or fill_str.lower() == "none":
            continue

        # svgelements 1.9 `Rect` etc. don't expose `as_path()`, but can be
        # converted by constructing a Path from the element.
        try:
            path = Path(elem)
        except Exception:
            continue

        # Realise element transforms, and map viewport coords back into
        # viewBox units so geometry matches the SVG coordinate system.
        try:
            path.reify()
            if inv_viewbox is not None:
                path *= inv_viewbox
                path.reify()
        except Exception:
            continue

        try:
            poly = path_to_polygon(path, max_segment_len=max_segment_len)
        except Exception:
            continue

        if poly.area <= 0:
            continue

        shapes.append((poly, fill_str, z))

    if not shapes:
        raise RuntimeError("No filled shapes found in SVG.")

    return shapes


# ----------------------------------------------------------------------
# Step 2: pick the two main colours
# ----------------------------------------------------------------------

def pick_two_main_colours(shapes) -> Tuple[str, str]:
    area_by_color: Dict[str, float] = defaultdict(float)
    for poly, fill, _ in shapes:
        area_by_color[fill] += poly.area

    if len(area_by_color) < 2:
        raise RuntimeError("Expected at least two different fill colours.")

    colours_sorted = sorted(area_by_color.keys(),
                            key=lambda c: area_by_color[c],
                            reverse=True)
    c0, c1 = colours_sorted[:2]
    return c0, c1


# ----------------------------------------------------------------------
# Step 3: compute visible regions per colour (respect z-order)
# ----------------------------------------------------------------------

def compute_visible_regions(shapes,
                            colour0: str,
                            colour1: str):
    """
    shapes: list of (poly, fill, z_index)
    returns: (visible0, visible1) lists of polygons
    """
    filtered = [(poly, fill, z)
                for (poly, fill, z) in shapes
                if fill in (colour0, colour1)]
    if not filtered:
        raise RuntimeError("No shapes with the two main colours found.")

    filtered.sort(key=lambda t: t[2])  # by DOM order
    covered = GeometryCollection()
    visible0 = []
    visible1 = []

    for poly, fill, _ in reversed(filtered):  # from top to bottom
        visible_part = poly.difference(covered)
        if visible_part.is_empty:
            continue

        if fill == colour0:
            visible0.append(visible_part)
        else:
            visible1.append(visible_part)

        covered = unary_union([covered, visible_part])

    if not visible0 or not visible1:
        raise RuntimeError("One of the two colours has no visible area.")

    return visible0, visible1


# ----------------------------------------------------------------------
# Step 4: planar subdivision into faces with colour labels
# ----------------------------------------------------------------------

def build_faces_from_visible_regions(visible0, visible1,
                                     snap_tol: float = 1e-3,
                                     gap_tol: Optional[float] = None):
    """
    Build faces from visible regions. gap_tol closes tiny gaps/holes that can
    appear between adjacent shapes; defaults to half of snap_tol.
    """
    if gap_tol is None:
        gap_tol = snap_tol

    def clean(geom):
        # Dilate then erode to close sub-gap_tol holes/slivers, while keeping
        # the outline nearly unchanged.
        if gap_tol and gap_tol > 0:
            return geom.buffer(gap_tol).buffer(-gap_tol).buffer(0)
        return geom.buffer(0)

    col0_union = clean(unary_union(visible0))
    col1_union = clean(unary_union(visible1))
    heart_union = clean(unary_union([col0_union, col1_union]))

    lines = []
    for geom in [col0_union, col1_union]:
        for poly in iter_polygons(geom):
            lines.append(LinearRing(poly.exterior.coords))
            for ring in poly.interiors:
                lines.append(LinearRing(ring.coords))

    merged_lines = unary_union(lines)
    raw_faces = list(polygonize(merged_lines))

    vertex_map: Dict[Tuple[float, float], int] = {}
    vertices: List[Tuple[float, float]] = []

    def quantise(pt: Tuple[float, float]) -> Tuple[float, float]:
        x, y = pt
        return (round(x / snap_tol) * snap_tol,
                round(y / snap_tol) * snap_tol)

    def get_vid(pt: Tuple[float, float]) -> int:
        key = quantise(pt)
        if key not in vertex_map:
            vertex_map[key] = len(vertices)
            vertices.append(key)
        return vertex_map[key]

    faces: List[Face] = []

    for poly in raw_faces:
        rep = poly.representative_point()
        if not heart_union.buffer(1e-9).contains(rep):
            continue

        if col0_union.buffer(1e-9).contains(rep):
            colour = 0
        elif col1_union.buffer(1e-9).contains(rep):
            colour = 1
        else:
            continue

        coords = list(poly.exterior.coords)[:-1]
        b_verts = [get_vid((x, y)) for (x, y) in coords]

        face_id = len(faces)
        faces.append(Face(id=face_id,
                          color=colour,
                          polygon=poly,
                          boundary=b_verts))

    return faces, vertices


# ----------------------------------------------------------------------
# Step 5: build edges and adjacency
# ----------------------------------------------------------------------

def build_edges(faces: List[Face],
                vertices: List[Tuple[float, float]]) -> Mesh:
    edge_map: Dict[Tuple[int, int], Dict] = {}
    vertex_edges: List[List[int]] = [[] for _ in range(len(vertices))]

    for face in faces:
        b = face.boundary
        n = len(b)
        for i in range(n):
            a = b[i]
            c = b[(i + 1) % n]
            if a == c:
                continue
            key = (a, c) if a < c else (c, a)
            ed = edge_map.get(key)
            if ed is None:
                ed = {"v1": key[0], "v2": key[1], "faces": [face.id]}
                edge_map[key] = ed
            else:
                ed["faces"].append(face.id)

    edges: List[Edge] = []
    boundary_vertices: Set[int] = set()

    for key, ed in edge_map.items():
        v1, v2 = ed["v1"], ed["v2"]
        flist = ed["faces"]

        if len(flist) == 1:
            f1, f2 = flist[0], None
            delta = 0
            boundary_vertices.add(v1)
            boundary_vertices.add(v2)
        else:
            f1, f2 = flist[0], flist[1]
            c1 = faces[f1].color
            c2 = faces[f2].color
            delta = 1 if c1 != c2 else 0

        eid = len(edges)
        edges.append(Edge(id=eid, v1=v1, v2=v2,
                          f1=f1, f2=f2, delta=delta))
        vertex_edges[v1].append(eid)
        vertex_edges[v2].append(eid)

    mesh = Mesh(
        vertices=vertices,
        faces=faces,
        edges=edges,
        vertex_edges=vertex_edges,
        boundary_vertices=boundary_vertices,
    )
    return mesh


# ----------------------------------------------------------------------
# Public entry: svg -> mesh
# ----------------------------------------------------------------------

def svg_to_mesh(svg_path: str,
                max_segment_len: float = 1.0,
                snap_tol: float = 1e-3,
                gap_tol: Optional[float] = None) -> Mesh:
    shapes = parse_svg_shapes(svg_path, max_segment_len=max_segment_len)
    c0, c1 = pick_two_main_colours(shapes)
    visible0, visible1 = compute_visible_regions(shapes, c0, c1)
    faces, vertices = build_faces_from_visible_regions(
        visible0, visible1, snap_tol=snap_tol, gap_tol=gap_tol
    )
    mesh = build_edges(faces, vertices)
    return mesh


# ----------------------------------------------------------------------
# SVG overlay writer
# ----------------------------------------------------------------------

def write_mesh_overlay_svg(input_svg: str,
                           output_svg: str,
                           mesh: Mesh,
                           stroke_width: float = 0.2,
                           root_nodes: Optional[List[Tuple[float, float]]] = None,
                           root_radius: float = 0.6):
    """
    Take the original SVG, overlay all mesh edges as black lines, and write
    the result to output_svg.
    """
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

    g = mk("g", {"id": "mesh_edges"})

    for edge in mesh.edges:
        x1, y1 = mesh.vertices[edge.v1]
        x2, y2 = mesh.vertices[edge.v2]
        line = mk("line", {
            "x1": str(x1),
            "y1": str(y1),
            "x2": str(x2),
            "y2": str(y2),
            "stroke": "black",
            "stroke-width": str(stroke_width),
            "fill": "none",
            "stroke-linecap": "round",
        })
        g.append(line)

    if root_nodes:
        for x, y in root_nodes:
            circ = mk("circle", {
                "cx": str(x),
                "cy": str(y),
                "r": str(root_radius),
                "stroke": "lime",
                "stroke-width": str(stroke_width * 1.5),
                "fill": "none",
            })
            g.append(circ)

    root.append(g)
    tree.write(output_svg, encoding="utf-8", xml_declaration=True)


# ----------------------------------------------------------------------
# CLI
# ----------------------------------------------------------------------

def main():
    if len(sys.argv) < 3:
        print("Usage: python svg_to_mesh.py input.svg overlay.svg [overlay_with_roots.svg]")
        sys.exit(1)

    input_svg = sys.argv[1]
    output_svg = sys.argv[2]
    roots_svg = sys.argv[3] if len(sys.argv) >= 4 else None
    snap_tol = 0.01

    mesh = svg_to_mesh(input_svg, max_segment_len=0.5, snap_tol=snap_tol)
    print(f"Vertices: {len(mesh.vertices)}")
    print(f"Faces:    {len(mesh.faces)}")
    print(f"Edges:    {len(mesh.edges)}")
    print(f"Boundary vertices: {len(mesh.boundary_vertices)}")

    roots = find_root_nodes(mesh, snap_tol=snap_tol, svg_path=input_svg,
                            max_segment_len=0.5)

    write_mesh_overlay_svg(input_svg, output_svg, mesh, stroke_width=0.25)
    if roots_svg:
        write_mesh_overlay_svg(input_svg, roots_svg, mesh,
                               stroke_width=0.25,
                               root_nodes=roots,
                               root_radius=1.0)
        print(f"Root nodes: {len(roots)}")
        print(f"Overlay with roots written to {roots_svg}")

    print(f"Overlay written to {output_svg}")


if __name__ == "__main__":
    main()
