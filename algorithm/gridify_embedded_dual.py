#!/usr/bin/env python3
"""
gridify_embedded_dual.py

Given an embedded dual graph G0 (faces + green boundary-run nodes) exported by
`image_adjacency.py --embedded-json`, find an expansion whose *face-vertex*
subgraph is isomorphic to a rectangular grid graph (P_rows □ P_cols).

This is phrased as a grid-minor / “reverse contractions” problem:
  - each grid vertex is assigned to exactly one visible face in G0,
  - adjacent grid vertices must map to equal or adjacent faces in G0,
  - each visible face's preimage must be a connected, tree-shaped set in the grid,
  - the boundary run order on each side must match the green nodes on that side.

Output:
  - a JSON file with the chosen grid size, the parent-face id per grid cell, and
    the run lengths per side.
  - optionally, an expanded embedded dual graph JSON for the grid.

Example:
  python3 image_adjacency.py example.png --embedded-json tmp/g0.json
  python3 gridify_embedded_dual.py tmp/g0.json --out tmp/grid.json --out-graph tmp/grid_graph.json
"""

from __future__ import annotations

import argparse
import json
from typing import Any, Dict, List, Optional, Sequence, Tuple

from ortools.sat.python import cp_model

from embedded_dual import DualEdge, DualVertex, EmbeddedDualGraph, HalfEdge


def _load_graph(path: str) -> Tuple[Dict[str, Any], EmbeddedDualGraph]:
    with open(path, "r", encoding="utf-8") as fh:
        data = json.load(fh)
    if isinstance(data, dict) and "graph" in data and isinstance(data["graph"], dict):
        wrapper = dict(data)
        graph_dict = data["graph"]
    elif isinstance(data, dict):
        wrapper = {"graph": data}
        graph_dict = data
    else:
        raise ValueError("Input JSON must be an object (or contain a top-level 'graph' object)")
    return wrapper, EmbeddedDualGraph.from_json_dict(graph_dict)


def _adjacent_face_id_for_green(g: EmbeddedDualGraph, green_vid: int) -> int:
    v = g.vertices[green_vid]
    if v.kind != "green":
        raise ValueError("Expected a green vertex id")
    nbrs: List[int] = []
    for e in g.edges:
        if e.u == green_vid:
            nbrs.append(e.v)
        elif e.v == green_vid:
            nbrs.append(e.u)
    faces = [n for n in nbrs if g.vertices[n].kind == "face"]
    if len(faces) != 1:
        raise ValueError(f"Green vertex {green_vid} must connect to exactly 1 face (got {faces})")
    return faces[0]


def _ordered_green_nodes(g: EmbeddedDualGraph) -> Dict[str, List[int]]:
    by_side: Dict[str, List[int]] = {"top": [], "right": [], "bottom": [], "left": []}
    for v in g.vertices:
        if v.kind == "green":
            if v.side not in by_side:
                raise ValueError(f"Unknown green side: {v.side}")
            by_side[v.side].append(v.id)

    def sort_key(vid: int) -> float:
        c = g.vertices[vid].centroid
        return float(vid) if c is None else float(c[0])

    def sort_key_y(vid: int) -> float:
        c = g.vertices[vid].centroid
        return float(vid) if c is None else float(c[1])

    by_side["top"].sort(key=sort_key)
    by_side["bottom"].sort(key=sort_key)
    by_side["left"].sort(key=sort_key_y)
    by_side["right"].sort(key=sort_key_y)
    return by_side


def _face_adjacency(g: EmbeddedDualGraph, face_vids: Sequence[int]) -> List[List[bool]]:
    idx_of = {vid: i for i, vid in enumerate(face_vids)}
    n = len(face_vids)
    adj = [[False] * n for _ in range(n)]
    for i in range(n):
        adj[i][i] = True
    face_set = set(face_vids)
    for e in g.edges:
        if e.u in face_set and e.v in face_set:
            iu = idx_of[e.u]
            iv = idx_of[e.v]
            adj[iu][iv] = True
            adj[iv][iu] = True
    return adj


def _grid_edges_undirected(rows: int, cols: int) -> List[Tuple[int, int]]:
    def idx(r: int, c: int) -> int:
        return r * cols + c

    edges: List[Tuple[int, int]] = []
    for r in range(rows):
        for c in range(cols):
            if r + 1 < rows:
                edges.append((idx(r, c), idx(r + 1, c)))
            if c + 1 < cols:
                edges.append((idx(r, c), idx(r, c + 1)))
    return edges


def _grid_arcs_directed(rows: int, cols: int) -> List[Tuple[int, int]]:
    def idx(r: int, c: int) -> int:
        return r * cols + c

    arcs: List[Tuple[int, int]] = []
    for r in range(rows):
        for c in range(cols):
            if r + 1 < rows:
                arcs.append((idx(r, c), idx(r + 1, c)))
                arcs.append((idx(r + 1, c), idx(r, c)))
            if c + 1 < cols:
                arcs.append((idx(r, c), idx(r, c + 1)))
                arcs.append((idx(r, c + 1), idx(r, c)))
    return arcs


def _solve_for_size(
    *,
    face_vids: Sequence[int],
    face_adj: List[List[bool]],
    run_faces: Dict[str, List[int]],
    rows: int,
    cols: int,
    time_limit_s: float,
) -> Optional[Dict[str, Any]]:
    if rows <= 0 or cols <= 0:
        raise ValueError("rows/cols must be positive")

    n_faces = len(face_vids)
    idx_of_face = {vid: i for i, vid in enumerate(face_vids)}

    # Boundary run counts are lower bounds on side lengths.
    if cols < max(len(run_faces["top"]), len(run_faces["bottom"])):
        return None
    if rows < max(len(run_faces["left"]), len(run_faces["right"])):
        return None

    model = cp_model.CpModel()
    cell: List[List[cp_model.IntVar]] = [
        [model.NewIntVar(0, n_faces - 1, f"cell_{r}_{c}") for c in range(cols)] for r in range(rows)
    ]

    # Adjacency constraint: neighbours must map to equal or adjacent faces in G0.
    allowed_pairs = [[i, j] for i in range(n_faces) for j in range(n_faces) if face_adj[i][j]]
    for r in range(rows):
        for c in range(cols):
            if r + 1 < rows:
                model.AddAllowedAssignments([cell[r][c], cell[r + 1][c]], allowed_pairs)
            if c + 1 < cols:
                model.AddAllowedAssignments([cell[r][c], cell[r][c + 1]], allowed_pairs)

    # Boolean indicator for (cell == face_i).
    # is_face[i][pos] where pos is flattened r*cols+c.
    n_cells = rows * cols
    is_face: List[List[cp_model.BoolVar]] = [
        [model.NewBoolVar(f"is_{i}_{p}") for p in range(n_cells)] for i in range(n_faces)
    ]

    for r in range(rows):
        for c in range(cols):
            p = r * cols + c
            for i in range(n_faces):
                b = is_face[i][p]
                model.Add(cell[r][c] == i).OnlyEnforceIf(b)
                model.Add(cell[r][c] != i).OnlyEnforceIf(b.Not())

    # Each face appears at least once.
    for i in range(n_faces):
        model.Add(sum(is_face[i][p] for p in range(n_cells)) >= 1)

    # Boundary run constraints (runs from green nodes).
    run_lengths: Dict[str, List[cp_model.IntVar]] = {}

    def add_side_runs(side: str, positions: List[Tuple[int, int]]) -> None:
        faces_for_side = run_faces[side]
        k = len(faces_for_side)
        if k == 0:
            return
        L = len(positions)
        if L < k:
            # Infeasible.
            model.AddBoolOr([])
            return

        lens = [model.NewIntVar(1, L, f"{side}_len_{i}") for i in range(k)]
        model.Add(sum(lens) == L)
        run_lengths[side] = lens

        # prefix sums: start[0]=0, start[i+1]=start[i]+lens[i]
        start: List[cp_model.IntVar] = [model.NewIntVar(0, L, f"{side}_start_0")]
        model.Add(start[0] == 0)
        for i in range(k):
            s = model.NewIntVar(0, L, f"{side}_start_{i+1}")
            model.Add(s == start[i] + lens[i])
            start.append(s)

        for t, (r, c) in enumerate(positions):
            bs = []
            for i in range(k):
                b = model.NewBoolVar(f"{side}_at_{i}_{t}")
                bs.append(b)
                model.Add(t >= start[i]).OnlyEnforceIf(b)
                model.Add(t < start[i + 1]).OnlyEnforceIf(b)
                model.Add(cell[r][c] == idx_of_face[faces_for_side[i]]).OnlyEnforceIf(b)
            model.Add(sum(bs) == 1)

    add_side_runs("top", [(0, c) for c in range(cols)])
    add_side_runs("bottom", [(rows - 1, c) for c in range(cols)])
    add_side_runs("left", [(r, 0) for r in range(rows)])
    add_side_runs("right", [(r, cols - 1) for r in range(rows)])

    # Connectivity + tree-shape per face inside the grid.
    arcs = _grid_arcs_directed(rows, cols)
    undirected_edges = _grid_edges_undirected(rows, cols)

    in_arcs: List[List[int]] = [[] for _ in range(n_cells)]
    out_arcs: List[List[int]] = [[] for _ in range(n_cells)]
    for t, (a, b) in enumerate(arcs):
        out_arcs[a].append(t)
        in_arcs[b].append(t)

    for i in range(n_faces):
        k_i = model.NewIntVar(1, n_cells, f"k_{i}")
        model.Add(k_i == sum(is_face[i][p] for p in range(n_cells)))

        # Tree edge count (induced subgraph must be a tree): internal_edges = k_i - 1
        internal_edge_bools: List[cp_model.BoolVar] = []
        for e_idx, (a, b) in enumerate(undirected_edges):
            both = model.NewBoolVar(f"both_{i}_{e_idx}")
            internal_edge_bools.append(both)
            model.Add(both <= is_face[i][a])
            model.Add(both <= is_face[i][b])
            model.Add(both >= is_face[i][a] + is_face[i][b] - 1)
        model.Add(sum(internal_edge_bools) == k_i - 1)

        # Flow connectivity (single-commodity flow from a chosen root).
        root = [model.NewBoolVar(f"root_{i}_{p}") for p in range(n_cells)]
        model.Add(sum(root) == 1)
        for p in range(n_cells):
            model.Add(root[p] <= is_face[i][p])

        root_supply = [model.NewIntVar(0, n_cells, f"root_supply_{i}_{p}") for p in range(n_cells)]
        for p in range(n_cells):
            model.Add(root_supply[p] <= k_i)
            model.Add(root_supply[p] <= n_cells * root[p])
            model.Add(root_supply[p] >= k_i - n_cells * (1 - root[p]))

        flow = [model.NewIntVar(0, n_cells, f"flow_{i}_{t}") for t in range(len(arcs))]
        for t, (a, b) in enumerate(arcs):
            model.Add(flow[t] <= n_cells * is_face[i][a])
            model.Add(flow[t] <= n_cells * is_face[i][b])

        for p in range(n_cells):
            inflow = sum(flow[t] for t in in_arcs[p])
            outflow = sum(flow[t] for t in out_arcs[p])
            model.Add(inflow - outflow == is_face[i][p] - root_supply[p])

    solver = cp_model.CpSolver()
    solver.parameters.max_time_in_seconds = time_limit_s
    solver.parameters.num_search_workers = 8
    status = solver.Solve(model)
    if status not in (cp_model.OPTIMAL, cp_model.FEASIBLE):
        return None

    grid_parent: List[List[int]] = []
    for r in range(rows):
        row: List[int] = []
        for c in range(cols):
            row.append(face_vids[solver.Value(cell[r][c])])
        grid_parent.append(row)

    run_len_out: Dict[str, List[int]] = {}
    for side, lens in run_lengths.items():
        run_len_out[side] = [int(solver.Value(x)) for x in lens]

    return {
        "rows": rows,
        "cols": cols,
        "grid_parent": grid_parent,
        "run_lengths": run_len_out,
    }


def _build_expanded_grid_graph(
    *,
    g0: EmbeddedDualGraph,
    grid_parent: List[List[int]],
    run_lengths: Dict[str, List[int]],
) -> EmbeddedDualGraph:
    rows = len(grid_parent)
    cols = len(grid_parent[0]) if rows else 0
    if rows == 0 or cols == 0:
        raise ValueError("grid_parent must be non-empty")

    # Map parent face id -> visible colour.
    parent_color: Dict[int, int] = {}
    for v in g0.vertices:
        if v.kind == "face":
            if v.color is None:
                raise ValueError("face vertex missing color")
            parent_color[v.id] = int(v.color)

    # Reuse green vertices (but reindex contiguously after grid vertices).
    ordered_green = _ordered_green_nodes(g0)
    green_order: List[int] = ordered_green["top"] + ordered_green["right"] + ordered_green["bottom"] + ordered_green["left"]
    old_to_new_green: Dict[int, int] = {}
    vertices: List[DualVertex] = []

    # Grid face-vertices.
    for r in range(rows):
        for c in range(cols):
            parent = int(grid_parent[r][c])
            vertices.append(
                DualVertex(
                    id=len(vertices),
                    kind="face",
                    color=parent_color[parent],
                    parent=parent,
                    centroid=(c + 0.5, r + 0.5),
                )
            )

    # Green nodes (outside ports).
    for old_id in green_order:
        old = g0.vertices[old_id]
        new_id = len(vertices)
        old_to_new_green[old_id] = new_id
        vertices.append(
            DualVertex(
                id=new_id,
                kind="green",
                color=None,
                parent=None,
                side=old.side,
                centroid=old.centroid,
            )
        )

    edges: List[DualEdge] = []
    halfedges: List[HalfEdge] = []
    rotation: List[List[int]] = [[] for _ in range(len(vertices))]

    def add_edge(u: int, v: int, kind: str) -> None:
        eid = len(edges)
        he_u = len(halfedges)
        he_v = he_u + 1
        halfedges.append(HalfEdge(id=he_u, edge=eid, origin=u))
        halfedges.append(HalfEdge(id=he_v, edge=eid, origin=v))
        edges.append(DualEdge(id=eid, u=u, v=v, kind=kind, he_u=he_u, he_v=he_v))
        rotation[u].append(he_u)
        rotation[v].append(he_v)

    def grid_vid(r: int, c: int) -> int:
        return r * cols + c

    # Grid adjacency edges (these make the face-vertex subgraph a grid).
    for r in range(rows):
        for c in range(cols):
            u = grid_vid(r, c)
            if r + 1 < rows:
                v = grid_vid(r + 1, c)
                kind = "internal" if vertices[u].parent == vertices[v].parent else "boundary"
                add_edge(u, v, kind)
            if c + 1 < cols:
                v = grid_vid(r, c + 1)
                kind = "internal" if vertices[u].parent == vertices[v].parent else "boundary"
                add_edge(u, v, kind)

    # Attach green ports along each boundary side, according to run lengths.
    def attach_side(side: str, pos: List[Tuple[int, int]], greens_old: List[int]) -> None:
        lens = run_lengths.get(side)
        if lens is None:
            return
        if len(lens) != len(greens_old):
            raise ValueError(f"run_lengths[{side}] length mismatch")
        t = 0
        for run_idx, run_len in enumerate(lens):
            green_new = old_to_new_green[greens_old[run_idx]]
            for _ in range(run_len):
                r, c = pos[t]
                add_edge(grid_vid(r, c), green_new, "boundary")
                t += 1

    attach_side("top", [(0, c) for c in range(cols)], ordered_green["top"])
    attach_side("bottom", [(rows - 1, c) for c in range(cols)], ordered_green["bottom"])
    attach_side("left", [(r, 0) for r in range(rows)], ordered_green["left"])
    attach_side("right", [(r, cols - 1) for r in range(rows)], ordered_green["right"])

    # Reorder rotations into a sensible cyclic order for drawing.
    # Grid vertices: clockwise by direction (up, right, down, left).
    # Green vertices: monotone by the boundary coordinate along that side.
    def sort_rotation_for_vertex(vid: int) -> None:
        v = vertices[vid]
        hes = rotation[vid]
        if len(hes) <= 2:
            return

        if v.kind == "face":
            cx, cy = v.centroid if v.centroid is not None else (0.0, 0.0)

            def dir_key(he: int) -> int:
                e = edges[halfedges[he].edge]
                other = e.v if e.u == vid else e.u
                ox, oy = vertices[other].centroid if vertices[other].centroid is not None else (0.0, 0.0)
                dx, dy = ox - cx, oy - cy
                if abs(dx) >= abs(dy):
                    return 1 if dx > 0 else 3
                return 2 if dy > 0 else 0

            # up(0), right(1), down(2), left(3)
            hes.sort(key=dir_key)
            rotation[vid] = hes
            return

        if v.kind == "green":
            side = v.side or ""

            def along_key(he: int) -> float:
                e = edges[halfedges[he].edge]
                other = e.v if e.u == vid else e.u
                oc = vertices[other].centroid
                if oc is None:
                    return float(other)
                if side in ("top", "bottom"):
                    return float(oc[0])
                return float(oc[1])

            hes.sort(key=along_key)
            rotation[vid] = hes

    for vid in range(len(vertices)):
        sort_rotation_for_vertex(vid)

    out = EmbeddedDualGraph(vertices=vertices, edges=edges, halfedges=halfedges, rotation=rotation)
    out.validate()
    return out


def _expansion_summary(
    *,
    g0: EmbeddedDualGraph,
    grid_parent: List[List[int]],
    run_lengths: Dict[str, List[int]],
) -> Dict[str, Any]:
    rows = len(grid_parent)
    cols = len(grid_parent[0]) if rows else 0
    if rows == 0 or cols == 0:
        raise ValueError("grid_parent must be non-empty")

    # Face split counts.
    face_cells: Dict[int, int] = {}
    for r in range(rows):
        for c in range(cols):
            face_cells[int(grid_parent[r][c])] = face_cells.get(int(grid_parent[r][c]), 0) + 1

    face_summary: Dict[str, Any] = {}
    total_vertex_splits = 0
    for v in g0.vertices:
        if v.kind != "face":
            continue
        k = int(face_cells.get(v.id, 0))
        if k <= 0:
            raise ValueError(f"Grid solution does not use face {v.id}")
        face_summary[str(v.id)] = {"cells": k, "vertex_splits": k - 1}
        total_vertex_splits += k - 1

    # Grid crossings between visible faces (for split-arc multiplicity).
    pair_cross: Dict[Tuple[int, int], int] = {}
    for r in range(rows):
        for c in range(cols):
            a = int(grid_parent[r][c])
            if r + 1 < rows:
                b = int(grid_parent[r + 1][c])
                if a != b:
                    key = (a, b) if a < b else (b, a)
                    pair_cross[key] = pair_cross.get(key, 0) + 1
            if c + 1 < cols:
                b = int(grid_parent[r][c + 1])
                if a != b:
                    key = (a, b) if a < b else (b, a)
                    pair_cross[key] = pair_cross.get(key, 0) + 1

    # Green run lengths, keyed by green vertex id.
    green_order = _ordered_green_nodes(g0)
    green_len: Dict[int, int] = {}
    for side, vids in green_order.items():
        lens = run_lengths.get(side)
        if lens is None:
            continue
        if len(lens) != len(vids):
            raise ValueError(f"run_lengths[{side}] length mismatch")
        for i, vid in enumerate(vids):
            green_len[int(vid)] = int(lens[i])

    edge_summary: Dict[str, Any] = {}
    total_split_arcs = 0
    for e in g0.edges:
        u, v = int(e.u), int(e.v)
        vu, vv = g0.vertices[u], g0.vertices[v]
        multiplicity = 1
        if vu.kind == "face" and vv.kind == "face":
            key = (u, v) if u < v else (v, u)
            multiplicity = int(pair_cross.get(key, 0))
        elif vu.kind == "green" and vv.kind == "face":
            multiplicity = int(green_len.get(u, 0))
        elif vv.kind == "green" and vu.kind == "face":
            multiplicity = int(green_len.get(v, 0))
        else:
            # Unexpected in G0.
            multiplicity = 1

        if multiplicity <= 0:
            raise ValueError(f"Grid solution does not realize g0 edge {e.id} ({u}-{v})")
        split_arcs = multiplicity - 1
        total_split_arcs += split_arcs
        edge_summary[str(e.id)] = {
            "u": u,
            "v": v,
            "kind": e.kind,
            "multiplicity": multiplicity,
            "split_arcs": split_arcs,
        }

    return {
        "faces": face_summary,
        "edges": edge_summary,
        "totals": {"vertex_splits": total_vertex_splits, "split_arcs": total_split_arcs},
    }


def main() -> None:
    ap = argparse.ArgumentParser(description="Find a grid expansion of an embedded dual graph (G0).")
    ap.add_argument("g0_json", help="Input JSON from `image_adjacency.py --embedded-json`")
    ap.add_argument("--out", required=True, help="Output JSON path (grid assignment + run lengths)")
    ap.add_argument("--rows", type=int, default=None, help="Target grid rows (auto if omitted)")
    ap.add_argument("--cols", type=int, default=None, help="Target grid cols (auto if omitted)")
    ap.add_argument("--max-rows", type=int, default=12, help="Max rows for auto-search (default 12)")
    ap.add_argument("--max-cols", type=int, default=12, help="Max cols for auto-search (default 12)")
    ap.add_argument("--time-limit", type=float, default=10.0, help="CP-SAT time limit per size (seconds)")
    ap.add_argument(
        "--prefer-square",
        action=argparse.BooleanOptionalAction,
        default=True,
        help="Auto-search prefers near-square grids (default true)",
    )
    ap.add_argument("--out-graph", help="Optional path to write the expanded embedded dual grid graph JSON")
    args = ap.parse_args()

    wrapper, g0 = _load_graph(args.g0_json)

    face_vids = [v.id for v in g0.vertices if v.kind == "face"]
    face_vids.sort()
    if not face_vids:
        raise SystemExit("No face vertices found in g0")

    face_adj = _face_adjacency(g0, face_vids)

    green_by_side = _ordered_green_nodes(g0)
    run_faces: Dict[str, List[int]] = {}
    for side, vids in green_by_side.items():
        run_faces[side] = [_adjacent_face_id_for_green(g0, vid) for vid in vids]

    min_rows = max(len(run_faces["left"]), len(run_faces["right"]), 1)
    min_cols = max(len(run_faces["top"]), len(run_faces["bottom"]), 1)

    solution: Optional[Dict[str, Any]] = None
    if args.rows is not None or args.cols is not None:
        if args.rows is None or args.cols is None:
            raise SystemExit("Specify both --rows and --cols, or neither.")
        solution = _solve_for_size(
            face_vids=face_vids,
            face_adj=face_adj,
            run_faces=run_faces,
            rows=int(args.rows),
            cols=int(args.cols),
            time_limit_s=float(args.time_limit),
        )
        if solution is None:
            raise SystemExit(f"No solution for rows={args.rows}, cols={args.cols}")
    else:
        # Candidate sizes.
        candidates: List[Tuple[int, int]] = []
        for r in range(min_rows, int(args.max_rows) + 1):
            for c in range(min_cols, int(args.max_cols) + 1):
                candidates.append((r, c))
        if args.prefer_square:
            candidates.sort(key=lambda rc: (abs(rc[0] - rc[1]), rc[0] * rc[1]))
        else:
            candidates.sort(key=lambda rc: (rc[0] * rc[1], abs(rc[0] - rc[1])))

        for r, c in candidates:
            sol = _solve_for_size(
                face_vids=face_vids,
                face_adj=face_adj,
                run_faces=run_faces,
                rows=r,
                cols=c,
                time_limit_s=float(args.time_limit),
            )
            if sol is not None:
                solution = sol
                break

        if solution is None:
            raise SystemExit(
                f"No solution found up to rows={args.max_rows}, cols={args.max_cols} "
                f"(mins: rows>={min_rows}, cols>={min_cols})."
            )

    out: Dict[str, Any] = {
        "grid": solution,
        "run_faces": run_faces,
        "expansion_summary": _expansion_summary(
            g0=g0, grid_parent=solution["grid_parent"], run_lengths=solution["run_lengths"]
        ),
        "source": wrapper.get("source", {"input": args.g0_json}),
    }

    with open(args.out, "w", encoding="utf-8") as fh:
        json.dump(out, fh, indent=2)
    print(f"Wrote grid assignment to {args.out} (rows={solution['rows']}, cols={solution['cols']})")

    if args.out_graph:
        g_grid = _build_expanded_grid_graph(
            g0=g0,
            grid_parent=solution["grid_parent"],
            run_lengths=solution["run_lengths"],
        )
        with open(args.out_graph, "w", encoding="utf-8") as fh:
            json.dump({"graph": g_grid.to_json_dict(), "source": out["source"]}, fh, indent=2)
        print(f"Wrote expanded embedded dual grid graph JSON to {args.out_graph}")


if __name__ == "__main__":
    main()
