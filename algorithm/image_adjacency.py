#!/usr/bin/env python3
"""
Compute the planar face adjacency graph of a two-colour image (SVG or raster).

Definitions:
  - Raster inputs: each pixel is a unit square; faces are 4-connected components
    of equal colour, and adjacencies exist across pixel edges.
  - Optionally, an extra "outside" face is added (the unbounded face in the
    plane), adjacent to any face that touches the image border.

SVG inputs:
  - Prefer vector meshing via `mesh.svg_to_mesh` (requires `svgelements`).
  - If `svgelements` is missing, fall back to rasterising via `rsvg-convert`
    and then run the raster algorithm.
"""

from __future__ import annotations

import argparse
import base64
import json
import os
import shutil
import subprocess
import tempfile
import xml.etree.ElementTree as ET
from collections import Counter, defaultdict, deque
from dataclasses import asdict, dataclass
from typing import Dict, List, Optional, Tuple

from PIL import Image, ImageDraw


RasterMask = List[List[int]]


@dataclass(frozen=True)
class FaceInfo:
    id: int
    kind: str  # "face", "outside", "green"
    color: Optional[int]  # 0/1, or None for outside
    pixel_count: int
    bbox: Tuple[float, float, float, float]  # (min_x, min_y, max_x_excl, max_y_excl)
    centroid: Optional[Tuple[float, float]]
    side: Optional[str] = None  # for kind=="green": "top"|"right"|"bottom"|"left"
    touches_border: bool = False
    touches_top: bool = False
    touches_right: bool = False
    touches_bottom: bool = False
    touches_left: bool = False


def _prepare_rgb(img: Image.Image, background_rgb: Tuple[int, int, int] = (255, 255, 255)) -> Image.Image:
    """
    Convert input image to RGB for quantisation.

    If the image has transparency:
      - if any fully-transparent pixels exist, composite onto background_rgb;
      - otherwise (alpha only used for antialiasing), drop alpha without compositing.
    """
    has_transparency = img.mode in {"RGBA", "LA"} or (img.mode == "P" and "transparency" in img.info)
    if not has_transparency:
        return img.convert("RGB")

    rgba = img.convert("RGBA")
    alpha = rgba.getchannel("A")
    min_a, _ = alpha.getextrema()
    if min_a == 0:
        bg = Image.new("RGBA", rgba.size, (*background_rgb, 255))
        return Image.alpha_composite(bg, rgba).convert("RGB")

    r, g, b, _a = rgba.split()
    return Image.merge("RGB", (r, g, b))


def _colour_saturation(rgb: Tuple[int, int, int]) -> float:
    r, g, b = rgb
    mx = max(r, g, b)
    mn = min(r, g, b)
    if mx == 0:
        return 0.0
    return (mx - mn) / float(mx)


def _colour_luminance(rgb: Tuple[int, int, int]) -> float:
    # Rec. 709
    r, g, b = rgb
    return 0.2126 * r + 0.7152 * g + 0.0722 * b


def _dominant_two_colours(rgb: Image.Image) -> Tuple[Tuple[int, int, int], Tuple[int, int, int]]:
    counts = Counter(rgb.getdata())
    most = counts.most_common(2)
    if len(most) < 2:
        raise RuntimeError("Expected at least two colours in the image.")
    return most[0][0], most[1][0]


def _binarize_two_colour_image(
    rgb: Image.Image,
    *,
    background_distance_ratio: float,
) -> Tuple[RasterMask, List[Tuple[int, int, int]]]:
    """
    Convert an (anti-aliased) two-colour RGB image into a clean 0/1 mask.

    We assume one of the colours is a low-saturation \"background\" (e.g. white/grey).
    A pixel is background iff it's close enough to the background colour.
    """
    if not (0.0 < background_distance_ratio < 1.0):
        raise ValueError("--bg-ratio must be between 0 and 1.")

    c0, c1 = _dominant_two_colours(rgb)
    s0, s1 = _colour_saturation(c0), _colour_saturation(c1)
    if abs(s0 - s1) > 0.05:
        bg, fg = (c0, c1) if s0 < s1 else (c1, c0)
    else:
        l0, l1 = _colour_luminance(c0), _colour_luminance(c1)
        bg, fg = (c0, c1) if l0 >= l1 else (c1, c0)

    dr = fg[0] - bg[0]
    dg = fg[1] - bg[1]
    db = fg[2] - bg[2]
    diff_sq = float(dr * dr + dg * dg + db * db)
    if diff_sq == 0.0:
        raise RuntimeError("Two dominant colours are identical; cannot binarize.")
    tol_sq = (background_distance_ratio * background_distance_ratio) * diff_sq

    w, h = rgb.size
    flat = list(rgb.getdata())
    mask_flat: List[int] = []
    for r, g, b in flat:
        dbr = r - bg[0]
        dbg = g - bg[1]
        dbb = b - bg[2]
        dist_sq = float(dbr * dbr + dbg * dbg + dbb * dbb)
        mask_flat.append(0 if dist_sq <= tol_sq else 1)

    mask: RasterMask = [mask_flat[y * w : (y + 1) * w] for y in range(h)]
    palette = [bg, fg]
    return mask, palette


def _raster_faces(mask: RasterMask) -> Tuple[List[FaceInfo], RasterMask]:
    h = len(mask)
    if h == 0:
        raise RuntimeError("Empty image")
    w = len(mask[0])
    comp: RasterMask = [[-1] * w for _ in range(h)]
    faces: List[FaceInfo] = []

    for y0 in range(h):
        for x0 in range(w):
            if comp[y0][x0] != -1:
                continue
            face_id = len(faces)
            face_color = int(mask[y0][x0])

            q = deque([(x0, y0)])
            comp[y0][x0] = face_id

            pixel_count = 0
            min_x = max_x = x0
            min_y = max_y = y0
            sum_x = 0.0
            sum_y = 0.0
            touches_top = False
            touches_right = False
            touches_bottom = False
            touches_left = False

            while q:
                x, y = q.popleft()
                pixel_count += 1
                min_x = min(min_x, x)
                min_y = min(min_y, y)
                max_x = max(max_x, x)
                max_y = max(max_y, y)
                sum_x += x + 0.5
                sum_y += y + 0.5
                if y == 0:
                    touches_top = True
                if y == h - 1:
                    touches_bottom = True
                if x == 0:
                    touches_left = True
                if x == w - 1:
                    touches_right = True

                if x > 0 and comp[y][x - 1] == -1 and mask[y][x - 1] == face_color:
                    comp[y][x - 1] = face_id
                    q.append((x - 1, y))
                if x + 1 < w and comp[y][x + 1] == -1 and mask[y][x + 1] == face_color:
                    comp[y][x + 1] = face_id
                    q.append((x + 1, y))
                if y > 0 and comp[y - 1][x] == -1 and mask[y - 1][x] == face_color:
                    comp[y - 1][x] = face_id
                    q.append((x, y - 1))
                if y + 1 < h and comp[y + 1][x] == -1 and mask[y + 1][x] == face_color:
                    comp[y + 1][x] = face_id
                    q.append((x, y + 1))

            faces.append(
                FaceInfo(
                    id=face_id,
                    kind="face",
                    color=face_color,
                    pixel_count=pixel_count,
                    bbox=(min_x, min_y, max_x + 1, max_y + 1),
                    centroid=(sum_x / pixel_count, sum_y / pixel_count) if pixel_count else None,
                    touches_border=(touches_top or touches_right or touches_bottom or touches_left),
                    touches_top=touches_top,
                    touches_right=touches_right,
                    touches_bottom=touches_bottom,
                    touches_left=touches_left,
                )
            )

    return faces, comp


def _raster_adjacency(comp: RasterMask, face_count: int) -> Dict[int, List[int]]:
    h = len(comp)
    if h == 0:
        return {}
    w = len(comp[0])

    adj_sets: Dict[int, set] = defaultdict(set)
    for y in range(h):
        for x in range(w):
            a = comp[y][x]
            if x + 1 < w:
                b = comp[y][x + 1]
                if a != b:
                    adj_sets[a].add(b)
                    adj_sets[b].add(a)
            if y + 1 < h:
                b = comp[y + 1][x]
                if a != b:
                    adj_sets[a].add(b)
                    adj_sets[b].add(a)

    return {fid: sorted(adj_sets.get(fid, [])) for fid in range(face_count)}


def _add_outside_face(faces: List[FaceInfo], adj: Dict[int, List[int]]) -> Tuple[List[FaceInfo], Dict[int, List[int]]]:
    outside_id = len(faces)
    adj_sets: Dict[int, set] = {k: set(v) for k, v in adj.items()}
    adj_sets[outside_id] = set()

    for f in faces:
        if f.touches_border:
            adj_sets[f.id].add(outside_id)
            adj_sets[outside_id].add(f.id)

    face_nodes = [f for f in faces if f.kind == "face"]
    if face_nodes:
        min_x = min(f.bbox[0] for f in face_nodes)
        max_x = max(f.bbox[2] for f in face_nodes)
        min_y = min(f.bbox[1] for f in face_nodes)
        max_y = max(f.bbox[3] for f in face_nodes)
        offset = max(1.5, (max_y - min_y) * 0.05)
        outside_centroid: Optional[Tuple[float, float]] = ((min_x + max_x) / 2.0, max_y + offset)
    else:
        outside_centroid = None

    faces_out = faces + [
        FaceInfo(
            id=outside_id,
            kind="outside",
            color=None,
            pixel_count=0,
            bbox=(0.0, 0.0, 0.0, 0.0),
            centroid=outside_centroid,
        )
    ]
    adj_out = {fid: sorted(adj_sets.get(fid, [])) for fid in range(len(faces_out))}
    return faces_out, adj_out


def _add_green_side_nodes(
    faces: List[FaceInfo],
    adj: Dict[int, List[int]],
    *,
    comp: RasterMask,
    image_size: Tuple[int, int],
) -> Tuple[List[FaceInfo], Dict[int, List[int]]]:
    """
    Add "green" nodes outside the image boundary.

    For each side (top/right/bottom/left), we create one green node for each
    contiguous boundary run of a face along that side, and connect it to that
    face. (A face can therefore have multiple green nodes on the same side if
    it touches the boundary in multiple disjoint segments.)
    """
    w, h = image_size
    face_nodes = [f for f in faces if f.kind == "face"]
    if not face_nodes:
        return faces, adj

    adj_sets: Dict[int, set] = {k: set(v) for k, v in adj.items()}
    for f in faces:
        adj_sets.setdefault(f.id, set())

    start_id = max(adj_sets.keys(), default=-1) + 1
    faces_out = list(faces)

    def add_edge(u: int, v: int):
        adj_sets[u].add(v)
        adj_sets[v].add(u)

    def boundary_runs(side: str) -> List[Tuple[int, float, float]]:
        """
        Return list of runs as (face_id, start, end_exclusive) in pixel coords
        along the varying axis.
        """
        if side == "top":
            seq = [comp[0][x] for x in range(w)]
        elif side == "bottom":
            seq = [comp[h - 1][x] for x in range(w)]
        elif side == "left":
            seq = [comp[y][0] for y in range(h)]
        elif side == "right":
            seq = [comp[y][w - 1] for y in range(h)]
        else:
            raise ValueError(f"Unknown side: {side}")

        runs: List[Tuple[int, float, float]] = []
        if not seq:
            return runs
        cur = seq[0]
        start = 0
        for i in range(1, len(seq)):
            if seq[i] != cur:
                runs.append((cur, float(start), float(i)))
                cur = seq[i]
                start = i
        runs.append((cur, float(start), float(len(seq))))
        return runs

    def run_mid(start: float, end_excl: float) -> float:
        # run covers [start, end_excl) in pixel indices along boundary; each
        # pixel is [i, i+1], so midpoint is average of endpoints.
        return (start + end_excl) / 2.0

    edge_offset = 0.5
    for side in ("top", "right", "bottom", "left"):
        for fid, start, end_excl in boundary_runs(side):
            nid = start_id
            start_id += 1
            if side in ("top", "bottom"):
                cx = run_mid(start, end_excl)
                cy = -edge_offset if side == "top" else h + edge_offset
            else:
                cy = run_mid(start, end_excl)
                cx = -edge_offset if side == "left" else w + edge_offset
            faces_out.append(
                FaceInfo(
                    id=nid,
                    kind="green",
                    side=side,
                    color=None,
                    pixel_count=0,
                    bbox=(0.0, 0.0, 0.0, 0.0),
                    centroid=(cx, cy),
                )
            )
            adj_sets[nid] = set()
            add_edge(int(fid), nid)

    adj_out = {fid: sorted(adj_sets.get(fid, [])) for fid in range(len(faces_out))}
    return faces_out, adj_out


def _raster_graph_from_image(
    img: Image.Image,
    *,
    include_outside: bool,
    include_green_sides: bool,
    background_distance_ratio: float,
) -> Tuple[List[FaceInfo], Dict[int, List[int]], List[Tuple[int, int, int]]]:
    rgb = _prepare_rgb(img)
    mask, palette = _binarize_two_colour_image(rgb, background_distance_ratio=background_distance_ratio)
    faces, comp = _raster_faces(mask)
    adj = _raster_adjacency(comp, face_count=len(faces))
    if include_outside:
        faces, adj = _add_outside_face(faces, adj)
    if include_green_sides:
        faces, adj = _add_green_side_nodes(faces, adj, comp=comp, image_size=rgb.size)
    return faces, adj, palette


def _rasterize_svg(svg_path: str, scale: float) -> Image.Image:
    rsvg = shutil.which("rsvg-convert")
    if not rsvg:
        raise RuntimeError("SVG input needs either `svgelements` or `rsvg-convert`.")

    with tempfile.TemporaryDirectory(dir=os.getcwd()) as tmpdir:
        out_png = os.path.join(tmpdir, "render.png")
        cmd = [rsvg, "--zoom", str(scale), "-o", out_png, svg_path]
        subprocess.run(cmd, check=True, stdout=subprocess.DEVNULL, stderr=subprocess.PIPE)
        img = Image.open(out_png)
        img.load()
        return img


def _mesh_adjacency(mesh, include_outside: bool) -> Dict[int, List[int]]:
    adj_sets: Dict[int, set] = defaultdict(set)
    for e in mesh.edges:
        if e.f1 is not None and e.f2 is not None and e.f1 != e.f2:
            adj_sets[e.f1].add(e.f2)
            adj_sets[e.f2].add(e.f1)

    total_faces = len(mesh.faces)
    if include_outside:
        outside_id = total_faces
        for e in mesh.edges:
            if e.f2 is None and e.f1 is not None:
                adj_sets[e.f1].add(outside_id)
                adj_sets[outside_id].add(e.f1)
        total_faces += 1

    return {fid: sorted(adj_sets.get(fid, [])) for fid in range(total_faces)}


def _mesh_bounds(mesh) -> Tuple[float, float, float, float]:
    xs = [xy[0] for xy in mesh.vertices]
    ys = [xy[1] for xy in mesh.vertices]
    if not xs or not ys:
        return (0.0, 0.0, 0.0, 0.0)
    return (min(xs), min(ys), max(xs), max(ys))


def _add_green_side_nodes_mesh(
    mesh,
    adj: Dict[int, List[int]],
    *,
    tol: float,
) -> Tuple[Dict[int, List[int]], Dict[str, int]]:
    """
    For SVG mesh mode: add 4 green side nodes and connect them to any mesh face
    that touches the outer mesh bounds.
    """
    min_x, min_y, max_x, max_y = _mesh_bounds(mesh)

    side_faces = {"top": set(), "right": set(), "bottom": set(), "left": set()}
    for f in mesh.faces:
        bx0, by0, bx1, by1 = f.polygon.bounds
        if abs(by0 - min_y) <= tol:
            side_faces["top"].add(f.id)
        if abs(bx1 - max_x) <= tol:
            side_faces["right"].add(f.id)
        if abs(by1 - max_y) <= tol:
            side_faces["bottom"].add(f.id)
        if abs(bx0 - min_x) <= tol:
            side_faces["left"].add(f.id)

    adj_sets: Dict[int, set] = {k: set(v) for k, v in adj.items()}
    start_id = max(adj_sets.keys(), default=-1) + 1
    green_ids: Dict[str, int] = {}

    def add_edge(u: int, v: int):
        adj_sets.setdefault(u, set()).add(v)
        adj_sets.setdefault(v, set()).add(u)

    for side in ("top", "right", "bottom", "left"):
        nid = start_id
        start_id += 1
        green_ids[side] = nid
        adj_sets[nid] = set()
        for fid in side_faces[side]:
            add_edge(fid, nid)

    adj_out = {fid: sorted(adj_sets.get(fid, [])) for fid in range(start_id)}
    return adj_out, green_ids


def _print_graph(face_labels: Dict[int, str], adj: Dict[int, List[int]]):
    print(f"Nodes: {len(face_labels)}")
    for fid in sorted(face_labels.keys()):
        print(f"Node {fid} ({face_labels[fid]}): {adj.get(fid, [])}")


def _label_for_node(node: FaceInfo) -> str:
    if node.kind == "outside":
        return "outside"
    if node.kind == "green":
        return f"green {node.side}"
    return f"color {node.color}"


def _write_json(path: str, data: Dict[str, object]):
    with open(path, "w", encoding="utf-8") as fh:
        json.dump(data, fh, indent=2)


def _auto_draw_scale(size: Tuple[int, int]) -> int:
    w, h = size
    m = max(w, h)
    if m <= 128:
        return 8
    if m <= 256:
        return 4
    if m <= 512:
        return 2
    return 1


def _text_center(draw: ImageDraw.ImageDraw, xy: Tuple[float, float], text: str) -> Tuple[float, float]:
    try:
        left, top, right, bottom = draw.textbbox((0, 0), text)
        tw = right - left
        th = bottom - top
    except Exception:
        tw, th = draw.textsize(text)
    x, y = xy
    return x - tw / 2.0, y - th / 2.0


def _draw_graph_overlay_png(
    *,
    base_image: Image.Image,
    faces: List[FaceInfo],
    adj: Dict[int, List[int]],
    palette: List[Tuple[int, int, int]],
    out_path: str,
    scale: int,
):
    if scale <= 0:
        raise ValueError("--draw-scale must be >= 1")

    img = base_image.convert("RGBA")
    w, h = img.size
    scaled_img = img.resize((w * scale, h * scale), resample=Image.Resampling.NEAREST)
    r = max(3, int(scale * 0.6))
    outline_w = max(1, r // 3)
    outside_gap_px = max(4, r // 2)
    outside_offset_units = max(2.0, (r + outside_gap_px) / float(scale))

    def node_fill(face: FaceInfo) -> Tuple[int, int, int, int]:
        if face.kind == "green":
            return (44, 160, 44, 255)
        if face.kind == "outside":
            return (180, 180, 180, 255)
        r, g, b = palette[int(face.color)]
        return (r, g, b, 255)

    def node_text_color(fill: Tuple[int, int, int, int]) -> Tuple[int, int, int, int]:
        r, g, b, _a = fill
        lum = 0.2126 * r + 0.7152 * g + 0.0722 * b
        return (0, 0, 0, 255) if lum > 140 else (255, 255, 255, 255)

    positions: Dict[int, Tuple[float, float]] = {}
    for f in faces:
        if f.centroid is None:
            continue
        cx, cy = f.centroid
        if f.kind == "green" and f.side:
            if f.side == "top":
                cy = -outside_offset_units
            elif f.side == "bottom":
                cy = h + outside_offset_units
            elif f.side == "left":
                cx = -outside_offset_units
            elif f.side == "right":
                cx = w + outside_offset_units
        positions[f.id] = (cx * scale, cy * scale)

    # Canvas padding so nodes placed \"outside\" are visible.
    pad = max(20, 10 * scale)
    img_w = w * scale
    img_h = h * scale
    pos_xs = list(positions.values())
    if pos_xs:
        xs = [p[0] for p in pos_xs] + [0.0, float(img_w)]
        ys = [p[1] for p in pos_xs] + [0.0, float(img_h)]
        min_x = min(xs)
        max_x = max(xs)
        min_y = min(ys)
        max_y = max(ys)
    else:
        min_x, min_y, max_x, max_y = 0.0, 0.0, float(img_w), float(img_h)

    offset_x = pad - min_x
    offset_y = pad - min_y
    canvas_w = int((max_x - min_x) + 2 * pad)
    canvas_h = int((max_y - min_y) + 2 * pad)

    canvas = Image.new("RGBA", (canvas_w, canvas_h), (255, 255, 255, 255))
    canvas.paste(scaled_img, (int(offset_x), int(offset_y)))
    draw = ImageDraw.Draw(canvas, "RGBA")

    edge_width = max(1, scale // 4)
    for u, nbrs in adj.items():
        for v in nbrs:
            if v <= u:
                continue
            if u not in positions or v not in positions:
                continue
            x1, y1 = positions[u]
            x2, y2 = positions[v]
            x1 += offset_x
            y1 += offset_y
            x2 += offset_x
            y2 += offset_y
            draw.line((x1, y1, x2, y2), fill=(0, 0, 0, 140), width=edge_width)

    for f in faces:
        if f.id not in positions:
            continue
        x, y = positions[f.id]
        x += offset_x
        y += offset_y
        fill = node_fill(f)
        draw.ellipse((x - r, y - r, x + r, y + r), fill=fill, outline=(0, 0, 0, 255), width=outline_w)
        label = str(f.id)
        tx, ty = _text_center(draw, (x, y), label)
        draw.text((tx, ty), label, fill=node_text_color(fill))

    canvas.save(out_path)


def _write_svg_graph_overlay_svg(
    *,
    input_svg: str,
    output_svg: str,
    mesh,
    adj: Dict[int, List[int]],
    include_outside: bool,
    green_ids: Optional[Dict[str, int]] = None,
):
    tree = ET.parse(input_svg)
    root = tree.getroot()

    tag = root.tag
    if tag.startswith("{"):
        ns = tag[1:].split("}")[0]
    else:
        ns = None

    def mk(tag_name: str, attrib: Dict[str, str]):
        return ET.Element(f"{{{ns}}}{tag_name}" if ns else tag_name, attrib)

    g = mk("g", {"id": "face_graph"})

    view_box = root.get("viewBox")
    vb_bounds: Optional[Tuple[float, float, float, float]] = None
    if view_box:
        try:
            x0, y0, vw, vh = [float(v) for v in view_box.strip().split()]
            vb_bounds = (x0, y0, x0 + vw, y0 + vh)
        except Exception:
            vb_bounds = None

    positions: Dict[int, Tuple[float, float]] = {}
    for f in mesh.faces:
        pt = f.polygon.representative_point()
        positions[f.id] = pt.coords[0]

    # Placement bounds for extra nodes / viewBox expansion.
    min_x, min_y, max_x, max_y = vb_bounds if vb_bounds is not None else _mesh_bounds(mesh)
    max_dim = max(max_x - min_x, max_y - min_y)
    off = max(max_dim * 0.03, 0.5)

    outside_id: Optional[int] = len(mesh.faces) if include_outside else None

    green_ids = green_ids or {}
    if green_ids:
        cx = (min_x + max_x) / 2.0
        cy = (min_y + max_y) / 2.0
        if "top" in green_ids:
            positions[green_ids["top"]] = (cx, min_y - off)
        if "right" in green_ids:
            positions[green_ids["right"]] = (max_x + off, cy)
        if "bottom" in green_ids:
            positions[green_ids["bottom"]] = (cx, max_y + off)
        if "left" in green_ids:
            positions[green_ids["left"]] = (min_x - off, cy)

    if outside_id is not None:
        cx = (min_x + max_x) / 2.0
        positions[outside_id] = (cx, max_y + off * 3.0)

    # Expand viewBox to include outside/green nodes.
    if vb_bounds is not None and (green_ids or outside_id is not None):
        pos_xs = [p[0] for p in positions.values()]
        pos_ys = [p[1] for p in positions.values()]
        new_min_x = min(min_x, min(pos_xs) - off)
        new_max_x = max(max_x, max(pos_xs) + off)
        new_min_y = min(min_y, min(pos_ys) - off)
        new_max_y = max(max_y, max(pos_ys) + off)
        root.set("viewBox", f"{new_min_x} {new_min_y} {new_max_x - new_min_x} {new_max_y - new_min_y}")

    stroke_width = "0.2"

    # edges
    for u, nbrs in adj.items():
        for v in nbrs:
            if v <= u:
                continue
            if u not in positions or v not in positions:
                continue
            x1, y1 = positions[u]
            x2, y2 = positions[v]
            g.append(
                mk(
                    "line",
                    {
                        "x1": str(x1),
                        "y1": str(y1),
                        "x2": str(x2),
                        "y2": str(y2),
                        "stroke": "black",
                        "stroke-width": stroke_width,
                        "stroke-opacity": "0.45",
                        "stroke-linecap": "round",
                    },
                )
            )

    # nodes + labels
    green_by_id = {nid: side for side, nid in (green_ids or {}).items()}
    for fid, (x, y) in positions.items():
        if fid in green_by_id:
            fill = "#2ca02c"
            text_fill = "white"
        elif outside_id is not None and fid == outside_id:
            fill = "#bbbbbb"
            text_fill = "black"
        else:
            fill = "#2b83ba" if mesh.faces[fid].color == 0 else "#d7191c"
            text_fill = "white"
        g.append(
            mk(
                "circle",
                {
                    "cx": str(x),
                    "cy": str(y),
                    "r": "0.6",
                    "fill": fill,
                    "stroke": "black",
                    "stroke-width": stroke_width,
                },
            )
        )
        text_el = mk(
            "text",
            {
                "x": str(x),
                "y": str(y),
                "font-size": "1.2",
                "text-anchor": "middle",
                "dominant-baseline": "central",
                "fill": text_fill,
            },
        )
        text_el.text = str(fid)
        g.append(text_el)

    root.append(g)
    tree.write(output_svg, encoding="utf-8", xml_declaration=True)


def _write_raster_graph_overlay_svg(
    *,
    base_image: Image.Image,
    faces: List[FaceInfo],
    adj: Dict[int, List[int]],
    palette: List[Tuple[int, int, int]],
    output_svg: str,
    scale: int,
):
    """
    SVG overlay for raster mode: embed the base image and draw edges/nodes on top.
    """
    if scale <= 0:
        raise ValueError("--draw-scale must be >= 1")

    img = base_image.convert("RGBA")
    w, h = img.size
    scaled = img.resize((w * scale, h * scale), resample=Image.Resampling.NEAREST)

    buf = tempfile.SpooledTemporaryFile()
    scaled.save(buf, format="PNG")
    buf.seek(0)
    b64 = base64.b64encode(buf.read()).decode("ascii")

    r = max(3, int(scale * 0.6))
    outside_gap_px = max(4, r // 2)
    outside_offset_units = max(2.0, (r + outside_gap_px) / float(scale))

    positions: Dict[int, Tuple[float, float]] = {}
    for f in faces:
        if f.centroid is None:
            continue
        cx, cy = f.centroid
        if f.kind == "green" and f.side:
            if f.side == "top":
                cy = -outside_offset_units
            elif f.side == "bottom":
                cy = h + outside_offset_units
            elif f.side == "left":
                cx = -outside_offset_units
            elif f.side == "right":
                cx = w + outside_offset_units
        positions[f.id] = (cx * scale, cy * scale)

    img_w = w * scale
    img_h = h * scale
    pad = max(20, 10 * scale)
    if positions:
        xs = [p[0] for p in positions.values()] + [0.0, float(img_w)]
        ys = [p[1] for p in positions.values()] + [0.0, float(img_h)]
        min_x = min(xs)
        max_x = max(xs)
        min_y = min(ys)
        max_y = max(ys)
    else:
        min_x, min_y, max_x, max_y = 0.0, 0.0, float(img_w), float(img_h)

    offset_x = pad - min_x
    offset_y = pad - min_y
    svg_w = int((max_x - min_x) + 2 * pad)
    svg_h = int((max_y - min_y) + 2 * pad)

    def rgba_hex(face: FaceInfo) -> str:
        if face.kind == "green":
            return "#2ca02c"
        if face.kind == "outside":
            return "#bbbbbb"
        r, g, b = palette[int(face.color)]
        return f"#{r:02x}{g:02x}{b:02x}"

    root = ET.Element(
        "svg",
        {
            "xmlns": "http://www.w3.org/2000/svg",
            "xmlns:xlink": "http://www.w3.org/1999/xlink",
            "width": str(svg_w),
            "height": str(svg_h),
            "viewBox": f"0 0 {svg_w} {svg_h}",
        },
    )
    ET.SubElement(
        root,
        "image",
        {
            "x": str(offset_x),
            "y": str(offset_y),
            "width": str(img_w),
            "height": str(img_h),
            "href": f"data:image/png;base64,{b64}",
        },
    )

    g = ET.SubElement(root, "g", {"id": "face_graph"})
    # edges
    for u, nbrs in adj.items():
        for v in nbrs:
            if v <= u:
                continue
            if u not in positions or v not in positions:
                continue
            x1, y1 = positions[u]
            x2, y2 = positions[v]
            x1 += offset_x
            y1 += offset_y
            x2 += offset_x
            y2 += offset_y
            ET.SubElement(
                g,
                "line",
                {
                    "x1": str(x1),
                    "y1": str(y1),
                    "x2": str(x2),
                    "y2": str(y2),
                    "stroke": "black",
                    "stroke-width": str(max(1, scale // 4)),
                    "stroke-opacity": "0.55",
                    "stroke-linecap": "round",
                },
            )

    # nodes
    for f in faces:
        if f.id not in positions:
            continue
        x, y = positions[f.id]
        x += offset_x
        y += offset_y
        text_fill = "black" if f.kind == "outside" else "white"
        ET.SubElement(
            g,
            "circle",
            {
                "cx": str(x),
                "cy": str(y),
                "r": str(r),
                "fill": rgba_hex(f),
                "stroke": "black",
                "stroke-width": str(max(1, scale // 4)),
            },
        )
        t = ET.SubElement(
            g,
            "text",
            {
                "x": str(x),
                "y": str(y),
                "font-size": str(max(10, 2 * scale)),
                "text-anchor": "middle",
                "dominant-baseline": "central",
                "fill": text_fill,
            },
        )
        t.text = str(f.id)

    ET.ElementTree(root).write(output_svg, encoding="utf-8", xml_declaration=True)


def main():
    parser = argparse.ArgumentParser(description="Build planar face adjacency graph from a two-colour SVG/PNG.")
    parser.add_argument("input", help="Path to SVG or raster (PNG/JPG/etc)")
    parser.add_argument("--json", dest="json_out", help="Optional path to write JSON graph")
    parser.add_argument(
        "--embedded-json",
        dest="embedded_json_out",
        help="Optional path to write embedded dual graph JSON (edges + rotation system)",
    )
    parser.add_argument(
        "--outside",
        action=argparse.BooleanOptionalAction,
        default=False,
        help="Include an extra unbounded outside face (default: false)",
    )
    parser.add_argument(
        "--green-sides",
        action=argparse.BooleanOptionalAction,
        default=True,
        help="Add green boundary nodes (one per boundary segment) (default: true)",
    )
    parser.add_argument(
        "--bg-ratio",
        type=float,
        default=0.34,
        help="Background distance ratio for raster binarization (default 0.34)",
    )
    parser.add_argument("--draw", dest="draw_out", help="Optional output path to draw the graph")
    parser.add_argument("--draw-scale", type=int, default=None, help="Scale factor for PNG drawing (auto if omitted)")
    parser.add_argument("--snap", type=float, default=0.05, help="SVG snapping tolerance (default 0.05)")
    parser.add_argument(
        "--svg-raster-scale",
        type=float,
        default=8.0,
        help="Fallback SVG rasterisation scale when svgelements is missing (default 8.0)",
    )
    args = parser.parse_args()

    ext = os.path.splitext(args.input)[1].lower()

    if ext == ".svg":
        try:
            from mesh import svg_to_mesh

            mesh = svg_to_mesh(args.input, snap_tol=args.snap)
        except ModuleNotFoundError as exc:
            if exc.name != "svgelements":
                raise
            img = _rasterize_svg(args.input, scale=args.svg_raster_scale)
            faces, adj, palette = _raster_graph_from_image(
                img,
                include_outside=args.outside,
                include_green_sides=args.green_sides,
                background_distance_ratio=args.bg_ratio,
            )

            labels = {f.id: _label_for_node(f) for f in faces}
            _print_graph(labels, adj)

            if args.draw_out:
                draw_ext = os.path.splitext(args.draw_out)[1].lower()
                draw_scale = args.draw_scale or _auto_draw_scale(img.size)
                if draw_ext == ".png":
                    _draw_graph_overlay_png(
                        base_image=img,
                        faces=faces,
                        adj=adj,
                        palette=palette,
                        out_path=args.draw_out,
                        scale=draw_scale,
                    )
                    print(f"Wrote graph image to {args.draw_out}")
                elif draw_ext == ".svg":
                    _write_raster_graph_overlay_svg(
                        base_image=img,
                        faces=faces,
                        adj=adj,
                        palette=palette,
                        output_svg=args.draw_out,
                        scale=draw_scale,
                    )
                    print(f"Wrote graph SVG to {args.draw_out}")
                else:
                    raise SystemExit("--draw supports .png or .svg output.")

            if args.json_out:
                _write_json(
                    args.json_out,
                    {
                        "faces": [asdict(f) for f in faces],
                        "adjacency": adj,
                        "palette": palette,
                        "source": {"path": args.input, "mode": "svg-raster"},
                    },
                )
                print(f"Wrote graph JSON to {args.json_out}")

            if args.embedded_json_out:
                if args.outside:
                    raise SystemExit("--embedded-json currently does not support --outside (use green ports).")
                from embedded_dual import VisibleFace, build_embedded_dual_from_raster

                # Recompute components so we have the face-label matrix (comp).
                rgb2 = _prepare_rgb(img)
                mask2, _palette2 = _binarize_two_colour_image(rgb2, background_distance_ratio=args.bg_ratio)
                base_faces, comp = _raster_faces(mask2)
                vis_faces = [VisibleFace(id=f.id, color=int(f.color), centroid=f.centroid) for f in base_faces]
                g0 = build_embedded_dual_from_raster(
                    faces=vis_faces, comp=comp, image_size=rgb2.size, green_sides=args.green_sides
                )
                _write_json(
                    args.embedded_json_out,
                    {
                        "graph": g0.to_json_dict(),
                        "source": {"path": args.input, "mode": "svg-raster"},
                    },
                )
                print(f"Wrote embedded dual JSON to {args.embedded_json_out}")
            return

        adj = _mesh_adjacency(mesh, include_outside=args.outside)
        green_ids: Dict[str, int] = {}
        if args.green_sides:
            adj, green_ids = _add_green_side_nodes_mesh(mesh, adj, tol=max(args.snap * 2.0, 1e-6))

        green_by_id = {nid: side for side, nid in green_ids.items()}
        labels: Dict[int, str] = {}
        for fid in range(len(adj)):
            if fid < len(mesh.faces):
                labels[fid] = f"color {mesh.faces[fid].color}"
            elif fid in green_by_id:
                labels[fid] = f"green {green_by_id[fid]}"
            elif args.outside and fid == len(mesh.faces):
                labels[fid] = "outside"
            else:
                labels[fid] = "node"
        _print_graph(labels, adj)

        if args.draw_out:
            draw_ext = os.path.splitext(args.draw_out)[1].lower()
            if draw_ext == ".svg":
                _write_svg_graph_overlay_svg(
                    input_svg=args.input,
                    output_svg=args.draw_out,
                    mesh=mesh,
                    adj=adj,
                    include_outside=args.outside,
                    green_ids=green_ids,
                )
                print(f"Wrote graph SVG to {args.draw_out}")
            elif draw_ext == ".png":
                rsvg = shutil.which("rsvg-convert")
                if not rsvg:
                    raise SystemExit("Converting SVG overlay to PNG requires `rsvg-convert`.")
                with tempfile.TemporaryDirectory(dir=os.getcwd()) as tmpdir:
                    tmp_svg = os.path.join(tmpdir, "overlay.svg")
                    _write_svg_graph_overlay_svg(
                        input_svg=args.input,
                        output_svg=tmp_svg,
                        mesh=mesh,
                        adj=adj,
                        include_outside=args.outside,
                        green_ids=green_ids,
                    )
                    cmd = [rsvg, "--zoom", str(args.svg_raster_scale), "-o", args.draw_out, tmp_svg]
                    subprocess.run(cmd, check=True, stdout=subprocess.DEVNULL, stderr=subprocess.PIPE)
                print(f"Wrote graph PNG to {args.draw_out}")
            else:
                raise SystemExit("--draw for SVG inputs supports .svg or .png output.")

        if args.json_out:
            faces_json = [
                {
                    "id": f.id,
                    "color": f.color,
                    "area": float(f.polygon.area),
                    "centroid": list(f.polygon.centroid.coords)[0],
                }
                for f in mesh.faces
            ]
            if args.outside:
                faces_json.append({"id": len(mesh.faces), "color": None, "area": 0.0, "centroid": (0.0, 0.0)})

            _write_json(
                args.json_out,
                {
                    "faces": faces_json,
                    "adjacency": adj,
                    "vertices": mesh.vertices,
                    "edges": [
                        {
                            "id": e.id,
                            "v1": e.v1,
                            "v2": e.v2,
                            "f1": e.f1,
                            "f2": e.f2,
                            "delta": e.delta,
                        }
                        for e in mesh.edges
                    ],
                    "source": {"path": args.input, "mode": "svg-mesh"},
                },
            )
            print(f"Wrote graph JSON to {args.json_out}")
        return

    img = Image.open(args.input)
    faces, adj, palette = _raster_graph_from_image(
        img,
        include_outside=args.outside,
        include_green_sides=args.green_sides,
        background_distance_ratio=args.bg_ratio,
    )
    labels = {f.id: _label_for_node(f) for f in faces}
    _print_graph(labels, adj)

    if args.draw_out:
        draw_ext = os.path.splitext(args.draw_out)[1].lower()
        draw_scale = args.draw_scale or _auto_draw_scale(img.size)
        if draw_ext == ".png":
            _draw_graph_overlay_png(
                base_image=img,
                faces=faces,
                adj=adj,
                palette=palette,
                out_path=args.draw_out,
                scale=draw_scale,
            )
            print(f"Wrote graph image to {args.draw_out}")
        elif draw_ext == ".svg":
            _write_raster_graph_overlay_svg(
                base_image=img,
                faces=faces,
                adj=adj,
                palette=palette,
                output_svg=args.draw_out,
                scale=draw_scale,
            )
            print(f"Wrote graph SVG to {args.draw_out}")
        else:
            raise SystemExit("--draw supports .png or .svg output.")

    if args.json_out:
        _write_json(
            args.json_out,
            {
                "faces": [asdict(f) for f in faces],
                "adjacency": adj,
                "palette": palette,
                "source": {"path": args.input, "mode": "raster"},
            },
        )
        print(f"Wrote graph JSON to {args.json_out}")

    if args.embedded_json_out:
        if args.outside:
            raise SystemExit("--embedded-json currently does not support --outside (use green ports).")
        from embedded_dual import VisibleFace, build_embedded_dual_from_raster

        # Recompute components so we have the face-label matrix (comp).
        rgb2 = _prepare_rgb(img)
        mask2, _palette2 = _binarize_two_colour_image(rgb2, background_distance_ratio=args.bg_ratio)
        base_faces, comp = _raster_faces(mask2)
        vis_faces = [VisibleFace(id=f.id, color=int(f.color), centroid=f.centroid) for f in base_faces]
        g0 = build_embedded_dual_from_raster(faces=vis_faces, comp=comp, image_size=rgb2.size, green_sides=args.green_sides)
        _write_json(
            args.embedded_json_out,
            {
                "graph": g0.to_json_dict(),
                "source": {"path": args.input, "mode": "raster"},
            },
        )
        print(f"Wrote embedded dual JSON to {args.embedded_json_out}")


if __name__ == "__main__":
    main()
