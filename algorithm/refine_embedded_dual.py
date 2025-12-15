#!/usr/bin/env python3
"""
refine_embedded_dual.py

Apply refinement operations (SplitArc / VertexSplit) to an embedded dual graph
exported by `image_adjacency.py --embedded-json`.

Example:
  python3 image_adjacency.py example.png --embedded-json tmp/g0.json
  python3 refine_embedded_dual.py tmp/g0.json --op split_arc:0 --op vertex_split:1:2:5 --out tmp/g1.json
"""

from __future__ import annotations

import argparse
import json
from typing import Any, Dict, List, Tuple

from embedded_dual import EmbeddedDualGraph


def _load_graph(path: str) -> Tuple[Dict[str, Any], Dict[str, Any]]:
    with open(path, "r", encoding="utf-8") as fh:
        data = json.load(fh)
    if isinstance(data, dict) and "graph" in data:
        graph = data["graph"]
        if not isinstance(graph, dict):
            raise ValueError("Input JSON has a non-object 'graph' field")
        return data, graph
    if isinstance(data, dict):
        return {"graph": data}, data
    raise ValueError("Input JSON must be an object (or contain a top-level 'graph' object)")


def _parse_ops(op_strs: List[str]) -> List[Tuple[str, Tuple[int, ...]]]:
    ops: List[Tuple[str, Tuple[int, ...]]] = []
    for s in op_strs:
        parts = s.split(":")
        if parts[0] == "split_arc":
            if len(parts) != 2:
                raise ValueError("split_arc expects: split_arc:<edge_id>")
            ops.append(("split_arc", (int(parts[1]),)))
        elif parts[0] == "vertex_split":
            if len(parts) != 4:
                raise ValueError("vertex_split expects: vertex_split:<vertex_id>:<i>:<j>")
            ops.append(("vertex_split", (int(parts[1]), int(parts[2]), int(parts[3]))))
        else:
            raise ValueError(f"Unknown op '{parts[0]}'. Supported: split_arc, vertex_split")
    return ops


def main() -> None:
    ap = argparse.ArgumentParser(description="Refine an embedded dual graph with SplitArc / VertexSplit.")
    ap.add_argument("input_json", help="Input JSON from `image_adjacency.py --embedded-json`")
    ap.add_argument("--out", required=True, help="Output JSON path")
    ap.add_argument(
        "--op",
        action="append",
        default=[],
        help="Operation to apply (repeatable): split_arc:<edge_id> or vertex_split:<vertex_id>:<i>:<j>",
    )
    ap.add_argument("--no-validate", action="store_true", help="Skip validation after applying ops")
    args = ap.parse_args()

    wrapper, graph_dict = _load_graph(args.input_json)
    g = EmbeddedDualGraph.from_json_dict(graph_dict)

    ops = _parse_ops(args.op)
    applied: List[Dict[str, Any]] = []

    for op, ints in ops:
        if op == "split_arc":
            (eid,) = ints
            new_eid = g.split_arc(eid)
            applied.append({"op": op, "edge": eid, "new_edge": new_eid})
        elif op == "vertex_split":
            vid, i, j = ints
            new_vid, new_eid = g.vertex_split(vid, i, j)
            applied.append({"op": op, "vertex": vid, "i": i, "j": j, "new_vertex": new_vid, "new_edge": new_eid})
        else:
            raise RuntimeError(f"Unhandled op {op}")

    if not args.no_validate:
        g.validate()

    out: Dict[str, Any] = dict(wrapper)
    out["graph"] = g.to_json_dict()
    if applied:
        out.setdefault("ops", [])
        if isinstance(out["ops"], list):
            out["ops"].extend(applied)
        else:
            out["ops"] = applied

    with open(args.out, "w", encoding="utf-8") as fh:
        json.dump(out, fh, indent=2)

    print(f"Wrote refined embedded dual JSON to {args.out}")


if __name__ == "__main__":
    main()

