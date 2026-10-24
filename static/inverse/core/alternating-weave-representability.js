/**
 * Exact combinatorial preflight for alternating weaves (Theorem A, Reading N).
 *
 * This module intentionally has no dependency on the inverse fitter or on the
 * production editor.  It accepts either a binary square mask or an explicit
 * visible-boundary graph.  For a mask, each differing pair of neighbouring
 * cells contributes one unit boundary edge; outer-square edges are not part of
 * Gamma.  For a graph, coordinates are in a square with the supplied bounds
 * (the default is [0, 1]^2).
 *
 * The checker decides the exact A1--A4 criterion from the supplied proof.  A
 * complete geometric witness constructor for the k,l > 0 case still requires
 * the proof's frame/plane-routing construction, so the witness API reports
 * that stage explicitly instead of pretending that a graph traversal is a
 * Bézier template.
 */

const SIDES = Object.freeze(['T', 'R', 'B', 'L']);
const DEFAULT_EPSILON = 1e-9;

function fail(message) {
  throw new TypeError(message);
}

function finiteNumber(value, label) {
  if (!Number.isFinite(value)) fail(`${label} must be finite.`);
  return Number(value);
}

function sideForPoint(point, bounds, epsilon) {
  const [x, y] = point;
  const sides = [];
  if (Math.abs(y - bounds.top) <= epsilon) sides.push('T');
  if (Math.abs(x - bounds.right) <= epsilon) sides.push('R');
  if (Math.abs(y - bounds.bottom) <= epsilon) sides.push('B');
  if (Math.abs(x - bounds.left) <= epsilon) sides.push('L');
  return sides;
}

function assertInsideSquare(point, bounds, epsilon, label) {
  const [x, y] = point;
  if (x < bounds.left - epsilon || x > bounds.right + epsilon ||
      y < bounds.top - epsilon || y > bounds.bottom + epsilon) {
    fail(`${label} lies outside the square bounds.`);
  }
}

function normalizeBounds(input) {
  const bounds = input?.bounds ?? {};
  const left = finiteNumber(bounds.left ?? 0, 'bounds.left');
  const top = finiteNumber(bounds.top ?? 0, 'bounds.top');
  const right = finiteNumber(bounds.right ?? input?.width ?? 1, 'bounds.right');
  const bottom = finiteNumber(bounds.bottom ?? input?.height ?? 1, 'bounds.bottom');
  if (!(right > left && bottom > top)) fail('Bounds must have positive width and height.');
  if (Math.abs((right - left) - (bottom - top)) >
      Math.max(DEFAULT_EPSILON, 1e-9 * Math.max(1, right - left, bottom - top))) {
    fail('Reading N requires a square domain; bounds are not square.');
  }
  return {left, top, right, bottom};
}

function vertexId(value, index) {
  if (value && typeof value === 'object' && 'id' in value) return String(value.id);
  if (value !== undefined && value !== null && (typeof value === 'string' || typeof value === 'number')) {
    return String(value);
  }
  return String(index);
}

function endpointId(edge, key) {
  if (Array.isArray(edge)) return edge[key === 'u' ? 0 : 1];
  if (edge && typeof edge === 'object') {
    const value = edge[key] ?? edge[key === 'u' ? 'a' : 'b'] ?? edge[key === 'u' ? 'from' : 'to'];
    if (value !== undefined) return value;
  }
  fail(`Each edge must provide ${key} and ${key === 'u' ? 'v' : 'u'} endpoints.`);
}

function pointOfVertex(vertex) {
  if (Array.isArray(vertex)) return [finiteNumber(vertex[0], 'vertex x'), finiteNumber(vertex[1], 'vertex y')];
  if (vertex && typeof vertex === 'object') {
    return [finiteNumber(vertex.x, 'vertex x'), finiteNumber(vertex.y, 'vertex y')];
  }
  fail('Each graph vertex must provide x and y coordinates.');
}

function coordinateKey(x, y) {
  return `${x},${y}`;
}

function addMaskEdge(edges, edgeKeys, vertices, x1, y1, x2, y2) {
  const aKey = coordinateKey(x1, y1), bKey = coordinateKey(x2, y2);
  const a = vertices.get(aKey) ?? (() => {
    const value = {id: aKey, x: x1, y: y1};
    vertices.set(aKey, value);
    return value;
  })();
  const b = vertices.get(bKey) ?? (() => {
    const value = {id: bKey, x: x2, y: y2};
    vertices.set(bKey, value);
    return value;
  })();
  const key = a.id < b.id ? `${a.id}|${b.id}` : `${b.id}|${a.id}`;
  if (edgeKeys.has(key)) return;
  edgeKeys.add(key);
  edges.push({id: String(edges.length), u: a.id, v: b.id});
}

function polygonPoint(raw, label) {
  if (Array.isArray(raw)) {
    return [finiteNumber(raw[0], `${label} x`), finiteNumber(raw[1], `${label} y`)];
  }
  return pointOfVertex(raw);
}

function samePoint(a, b, epsilon = DEFAULT_EPSILON) {
  return Math.abs(a[0] - b[0]) <= epsilon && Math.abs(a[1] - b[1]) <= epsilon;
}

/**
 * Convert closed polygon contours to the visible graph Γ.
 *
 * Contours are arrays of [x, y] points (the repeated closing point is
 * optional). Polygon sides contained in a square side are omitted, as
 * required by (C1); all remaining contour segments are retained. This is
 * deliberately a small noded-contour adapter: crossings in a contour must
 * already be represented by vertices.
 */
export function boundaryGraphFromPolygons(input) {
  const polygons = input?.polygons;
  if (!Array.isArray(polygons) || polygons.length === 0) fail('A polygon input must provide a non-empty polygons array.');
  const bounds = normalizeBounds(input);
  const epsilon = input?.epsilon ?? DEFAULT_EPSILON;
  if (!(Number.isFinite(epsilon) && epsilon >= 0)) fail('epsilon must be a finite non-negative number.');
  const vertices = new Map(), edges = [], edgeKeys = new Set();
  const idFor = (point) => {
    assertInsideSquare(point, bounds, epsilon, 'Polygon point');
    const key = coordinateKey(point[0], point[1]);
    if (!vertices.has(key)) vertices.set(key, {id: key, x: point[0], y: point[1]});
    return key;
  };
  const boundarySide = (point) => sideForPoint(point, bounds, epsilon);
  polygons.forEach((contour, polygonIndex) => {
    if (!Array.isArray(contour) || contour.length < 3) fail(`Polygon ${polygonIndex} must contain at least three points.`);
    const points = contour.map((point, index) => polygonPoint(point, `polygon ${polygonIndex} point ${index}`));
    if (samePoint(points[0], points.at(-1), epsilon)) points.pop();
    if (points.length < 3) fail(`Polygon ${polygonIndex} must contain at least three distinct points.`);
    for (let index = 0; index < points.length; index++) {
      const a = points[index], b = points[(index + 1) % points.length];
      if (samePoint(a, b, epsilon)) fail(`Polygon ${polygonIndex} contains a zero-length edge.`);
      const aSides = boundarySide(a), bSides = boundarySide(b);
      // A segment is part of ∂Q only when both endpoints lie on that same side.
      const onSquareSide = aSides.some((side) => bSides.includes(side));
      if (onSquareSide) continue;
      const u = idFor(a), v = idFor(b);
      const key = edgeKey(u, v);
      if (!edgeKeys.has(key)) {
        edgeKeys.add(key);
        edges.push({id: String(edges.length), u, v});
      }
    }
  });
  return {vertices: [...vertices.values()], edges, bounds, epsilon, source: 'polygons'};
}

function maskValues(input) {
  const raw = input?.mask;
  if (raw === undefined) fail('A mask input must provide mask.');
  let rows;
  if (Array.isArray(raw) && raw.length && Array.isArray(raw[0])) {
    rows = raw;
  } else {
    const width = input.width ?? input.resolution;
    if (!Number.isInteger(width) || width < 1) fail('A flat mask requires a positive integer width or resolution.');
    if (!raw || typeof raw.length !== 'number' || raw.length !== width * width) {
      fail('A flat mask must contain width * width binary values.');
    }
    rows = Array.from({length: width}, (_, y) => Array.from({length: width}, (_, x) => raw[y * width + x]));
  }
  const height = rows.length;
  const width = rows[0]?.length ?? 0;
  if (!width || rows.some(row => !Array.isArray(row) || row.length !== width)) {
    fail('A mask must be a non-empty rectangular array.');
  }
  if (height !== width) fail('Reading N requires a square mask.');
  const values = new Uint8Array(width * height);
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const value = rows[y][x] === true ? 1 : rows[y][x] === false ? 0 : rows[y][x];
    if (value !== 0 && value !== 1) fail(`Mask value at (${x}, ${y}) must be binary.`);
    values[y * width + x] = value;
  }
  return {values, width};
}

/** Convert a square binary cell mask to the visible boundary graph Gamma. */
export function boundaryGraphFromMask(input) {
  const {values, width} = maskValues(input);
  const vertices = new Map(), edges = [], edgeKeys = new Set();
  const at = (x, y) => values[y * width + x];
  for (let y = 0; y < width; y++) for (let x = 0; x + 1 < width; x++) {
    if (at(x, y) !== at(x + 1, y)) addMaskEdge(edges, edgeKeys, vertices, x + 1, y, x + 1, y + 1);
  }
  for (let y = 0; y + 1 < width; y++) for (let x = 0; x < width; x++) {
    if (at(x, y) !== at(x, y + 1)) addMaskEdge(edges, edgeKeys, vertices, x, y + 1, x + 1, y + 1);
  }
  return {
    vertices: [...vertices.values()], edges,
    bounds: {left: 0, top: 0, right: width, bottom: width},
    source: 'mask', width,
  };
}

function normalizeGraph(input) {
  const graph = input?.vertices && input?.edges ? input : input?.graph;
  if (!graph || !Array.isArray(graph.vertices) || !Array.isArray(graph.edges)) {
    fail('Expected {mask, width} or {vertices, edges} boundary graph.');
  }
  const bounds = normalizeBounds(graph);
  const epsilon = input?.epsilon ?? graph.epsilon ?? DEFAULT_EPSILON;
  if (!(Number.isFinite(epsilon) && epsilon >= 0)) fail('epsilon must be a finite non-negative number.');
  const vertices = new Map();
  graph.vertices.forEach((raw, index) => {
    const id = vertexId(raw, index);
    if (vertices.has(id)) fail(`Duplicate graph vertex id: ${id}.`);
    const [x, y] = pointOfVertex(raw);
    assertInsideSquare([x, y], bounds, epsilon, `Vertex ${id}`);
    vertices.set(id, {id, x, y, sides: sideForPoint([x, y], bounds, epsilon)});
  });
  const edges = [], edgeKeys = new Set();
  graph.edges.forEach((raw, index) => {
    const u = String(endpointId(raw, 'u')), v = String(endpointId(raw, 'v'));
    if (!vertices.has(u) || !vertices.has(v)) fail(`Edge ${index} references an unknown vertex.`);
    if (u === v) fail(`Edge ${index} is a self-loop.`);
    const key = u < v ? `${u}|${v}` : `${v}|${u}`;
    if (edgeKeys.has(key)) fail(`Duplicate graph edge ${u}--${v}.`);
    edgeKeys.add(key); edges.push({id: String(raw?.id ?? index), u, v});
  });
  return {vertices, edges, bounds, epsilon, source: 'graph'};
}

function prepareInput(input) {
  if (input && input.mask !== undefined) return normalizeGraph(boundaryGraphFromMask(input));
  if (input && input.polygons !== undefined) return normalizeGraph(boundaryGraphFromPolygons(input));
  return normalizeGraph(input);
}

function edgeKey(u, v) { return u < v ? `${u}|${v}` : `${v}|${u}`; }

function connectedComponents(graph, adjacency) {
  const seen = new Set(), components = [];
  for (const id of graph.vertices.keys()) {
    if (seen.has(id)) continue;
    const vertices = [], edges = [], queue = [id]; seen.add(id);
    while (queue.length) {
      const current = queue.shift(); vertices.push(current);
      for (const {to, edge} of adjacency.get(current) ?? []) {
        edges.push(edge.id);
        if (!seen.has(to)) { seen.add(to); queue.push(to); }
      }
    }
    components.push({vertices: vertices.sort(), edges: [...new Set(edges)].sort()});
  }
  return components;
}

function componentSummary(component, graph, degrees) {
  const endpoints = component.vertices.filter(id => degrees.get(id) === 1);
  const endpointSides = endpoints.flatMap(id => graph.vertices.get(id).sides);
  return {
    vertices: component.vertices,
    edges: component.edges,
    endpointIds: endpoints,
    endpointSides,
    cycle: endpoints.length === 0,
    simplePath: endpoints.length === 2 && component.vertices.every(id => (degrees.get(id) ?? 0) <= 2),
  };
}

function pathWitness(component, graph, adjacency, degrees) {
  const endpoints = component.vertices.filter(id => degrees.get(id) === 1).sort();
  if (endpoints.length !== 2) return null;
  const vertices = [endpoints[0]], edges = [], used = new Set();
  let current = endpoints[0], previous = null;
  while (current !== endpoints[1]) {
    const next = (adjacency.get(current) ?? []).find(item => item.to !== previous && !used.has(item.edge.id));
    if (!next) return null;
    used.add(next.edge.id); edges.push(next.edge.id); previous = current; current = next.to; vertices.push(current);
    if (vertices.length > component.vertices.length + 1) return null;
  }
  return {vertices, edges, from: graph.vertices.get(vertices[0]).sides[0], to: graph.vertices.get(vertices.at(-1)).sides[0]};
}

function addConstraint(constraints, first, second, different) {
  constraints.get(first).push([second, different ? 1 : 0]);
  constraints.get(second).push([first, different ? 1 : 0]);
}

function edgeDirection(graph, edge, vertex) {
  const other = edge.u === vertex ? edge.v : edge.u;
  const from = graph.vertices.get(vertex), to = graph.vertices.get(other);
  return Math.atan2(to.y - from.y, to.x - from.x);
}

/**
 * Solve the finite local sheet assignment from the proof. Degree-2 vertices
 * continue one sheet. At a degree-4 vertex opposite half-edges form one
 * sheet and the other opposite pair forms the other sheet. The resulting
 * equalities and disequalities are solved by linear parity propagation.
 */
function sheetLabels(graph, adjacency, degrees) {
  const constraints = new Map(graph.edges.map(edge => [edge.id, []]));
  const fixed = new Map();
  for (const [vertex, incident] of adjacency) {
    const degree = degrees.get(vertex);
    if (degree === 2) {
      addConstraint(constraints, incident[0].edge.id, incident[1].edge.id, false);
    } else if (degree === 4) {
      const ordered = incident.toSorted((a, b) => edgeDirection(graph, a.edge, vertex) - edgeDirection(graph, b.edge, vertex));
      addConstraint(constraints, ordered[0].edge.id, ordered[2].edge.id, false);
      addConstraint(constraints, ordered[1].edge.id, ordered[3].edge.id, false);
      addConstraint(constraints, ordered[0].edge.id, ordered[1].edge.id, true);
    } else if (degree !== 1) {
      return {error: {type: 'unsupported_visible_degree', vertex, degree}};
    }
    if (degree === 1) {
      const edge = incident[0].edge;
      const side = graph.vertices.get(vertex).sides[0];
      if (!side) return {error: {type: 'interior_endpoint', vertex}};
      const value = side === 'T' || side === 'B' ? 0 : 1;
      const prior = fixed.get(edge.id);
      if (prior !== undefined && prior !== value) return {error: {type: 'endpoint_sheet_conflict', edge: edge.id}};
      fixed.set(edge.id, value);
    }
  }
  const labels = new Map();
  for (const edge of graph.edges) {
    if (labels.has(edge.id)) continue;
    labels.set(edge.id, fixed.get(edge.id) ?? 0);
    const queue = [edge.id];
    while (queue.length) {
      const current = queue.shift(), value = labels.get(current);
      for (const [next, parity] of constraints.get(current)) {
        const expected = value ^ parity;
        if (labels.has(next)) {
          if (labels.get(next) !== expected) return {error: {type: 'sheet_parity_conflict', edge: next, through: current}};
        } else {
          const forced = fixed.get(next);
          if (forced !== undefined && forced !== expected) return {error: {type: 'endpoint_sheet_conflict', edge: next}};
          labels.set(next, expected);
          queue.push(next);
        }
      }
    }
  }
  return {labels, constraints};
}

function traceSheetPaths(graph, labels, family, expectedStart, expectedEnd) {
  const incident = new Map([...graph.vertices.keys()].map(id => [id, []]));
  for (const edge of graph.edges) if (labels.get(edge.id) === family) {
    incident.get(edge.u).push(edge);
    incident.get(edge.v).push(edge);
  }
  const startVertices = [...incident].filter(([vertex, edges]) => edges.length === 1 &&
    graph.vertices.get(vertex).sides.includes(expectedStart)).map(([vertex]) => vertex).sort();
  const seen = new Set(), paths = [];
  for (const start of startVertices) {
    if (seen.has(start)) continue;
    const path = [], vertices = [start];
    let vertex = start, previous = null;
    while (true) {
      const candidates = incident.get(vertex).filter(edge => edge.id !== previous);
      if (candidates.length !== 1) return {error: {type: 'sheet_branch_or_gap', family, vertex, degree: candidates.length}};
      const edge = candidates[0], reverse = edge.v === vertex;
      if (seen.has(edge.id)) return {error: {type: 'sheet_cycle', family, edge: edge.id}};
      seen.add(edge.id);
      path.push({curve: edge.id, reverse});
      vertex = reverse ? edge.u : edge.v;
      vertices.push(vertex);
      previous = edge.id;
      const next = incident.get(vertex);
      if (next.length === 1) {
        if (!graph.vertices.get(vertex).sides.includes(expectedEnd)) {
          return {error: {type: 'wrong_sheet_endpoint', family, vertex, sides: graph.vertices.get(vertex).sides}};
        }
        break;
      }
      if (next.length !== 2) return {error: {type: 'sheet_branch_or_gap', family, vertex, degree: next.length}};
    }
    paths.push({vertices, edges: path});
  }
  for (const edge of graph.edges) {
    if (labels.get(edge.id) === family && !seen.has(edge.id)) {
      return {error: {type: 'sheet_cycle', family, edge: edge.id}};
    }
  }
  return {paths};
}

function cross2(a, b, c) {
  return (b[0] - a[0]) * (c[1] - b[1]) - (b[1] - a[1]) * (c[0] - b[0]);
}

function dot2(a, b, c) {
  return (b[0] - a[0]) * (c[0] - b[0]) + (b[1] - a[1]) * (c[1] - b[1]);
}

function simplifiedPathPoints(path, graph, bounds, edgeById) {
  const points = [];
  for (const [index, segment] of path.edges.entries()) {
    const edge = edgeById.get(segment.curve);
    const first = segment.reverse ? edge.v : edge.u;
    const last = segment.reverse ? edge.u : edge.v;
    if (!index) points.push(graph.vertices.get(first));
    points.push(graph.vertices.get(last));
  }
  const simplified = [];
  for (const point of points) {
    const shifted = [point.x - bounds.left, point.y - bounds.top];
    while (simplified.length >= 2 &&
      Math.abs(cross2(simplified.at(-2), simplified.at(-1), shifted)) <= 1e-9 &&
      dot2(simplified.at(-2), simplified.at(-1), shifted) >= -1e-9) simplified.pop();
    simplified.push(shifted);
  }
  return simplified;
}

function lineControlPoints(a, b) {
  return [a,
    [a[0] * 2 / 3 + b[0] / 3, a[1] * 2 / 3 + b[1] / 3],
    [a[0] / 3 + b[0] * 2 / 3, a[1] / 3 + b[1] * 2 / 3],
    b];
}

/**
 * Construct a current heartcurves-2 template when the visible boundary
 * already is a pair of disjoint sheet paths. General accepted masks may need
 * hidden W/K switches; those are reported instead of silently routed through
 * MILP.
 */
export function constructVisibleSheetWitness(input) {
  let graph;
  try { graph = prepareInput(input); } catch (error) {
    return {accepted: false, error: error instanceof Error ? error.message : String(error)};
  }
  const checked = checkReadingN(input);
  if (!checked.passed) return {accepted: false, report: checked, reason: 'criterion_rejected'};
  const adjacency = new Map([...graph.vertices.keys()].map(id => [id, []]));
  for (const edge of graph.edges) {
    adjacency.get(edge.u).push({to: edge.v, edge});
    adjacency.get(edge.v).push({to: edge.u, edge});
  }
  const degrees = new Map([...graph.vertices.keys()].map(id => [id, adjacency.get(id).length]));
  const assignment = sheetLabels(graph, adjacency, degrees);
  if (assignment.error) return {accepted: false, report: checked, reason: 'sheet_decomposition_failed', detail: assignment.error};
  const a = traceSheetPaths(graph, assignment.labels, 0, 'T', 'B');
  if (a.error) return {accepted: false, report: checked, reason: 'sheet_decomposition_failed', detail: a.error};
  const b = traceSheetPaths(graph, assignment.labels, 1, 'L', 'R');
  if (b.error) return {accepted: false, report: checked, reason: 'sheet_decomposition_failed', detail: b.error};
  const width = graph.bounds.right - graph.bounds.left;
  const allPaths = [a.paths, b.paths];
  const edgeById = new Map(graph.edges.map(edge => [edge.id, edge]));
  const curves = {};
  const encoded = allPaths.map((familyPaths, family) => familyPaths.map((path, pathIndex) => {
    const points = simplifiedPathPoints(path, graph, graph.bounds, edgeById);
    const segments = [];
    for (let index = 1; index < points.length; index++) {
      const id = 'sheet-' + family + '-' + pathIndex + '-' + (index - 1);
      curves[id] = {control_points: lineControlPoints(points[index - 1], points[index]), visible_boundary: true, family};
      segments.push({curve: id, reverse: false});
    }
    return segments;
  }));
  const result = {
    accepted: true,
    kind: 'visible-sheet-witness',
    report: checked,
    labels: Object.fromEntries(assignment.labels),
    paths: encoded,
    template: {
      schema: 'heartcurves-2',
      units: 'mm',
      square_width_mm: width,
      phase: 0,
      paper_colors: ['#bd1111', '#ffffff'],
      curves,
      A_overlap_paths: encoded[0],
      B_overlap_paths: encoded[1],
      cutCounts: {A: encoded[0].length, B: encoded[1].length},
      curveCounts: {A: encoded[0].reduce((sum, path) => sum + path.length, 0), B: encoded[1].reduce((sum, path) => sum + path.length, 0)},
      note: 'Polynomial visible-sheet witness; collinear path segments are merged and no hidden switches are required.',
    },
  };
  if (checked.counts.k === 0 && checked.counts.l === 0) {
    result.aArcs = [];
    result.bArcs = [];
  } else if (checked.counts.l === 0 || checked.counts.k === 0) {
    result.family = checked.counts.l === 0 ? 'A' : 'B';
  }
  return result;
}

function reject(code, message, details = {}) {
  return {passed: false, code, message, ...details};
}

/**
 * Decide Theorem A (Reading N) for a binary mask or visible-boundary graph.
 * The returned report is JSON-serializable and includes the normalized graph
 * counts, component summaries, and one stable rejection code when rejected.
 */
export function checkReadingN(input) {
  let graph;
  try { graph = prepareInput(input); } catch (error) {
    return reject('invalid_input', error instanceof Error ? error.message : String(error));
  }
  const {vertices, edges, bounds, epsilon, source} = graph;
  const adjacency = new Map([...vertices.keys()].map(id => [id, []]));
  for (const edge of edges) {
    adjacency.get(edge.u).push({to: edge.v, edge}); adjacency.get(edge.v).push({to: edge.u, edge});
  }
  const degrees = new Map([...vertices.keys()].map(id => [id, adjacency.get(id).length]));
  const sideVertices = [];
  for (const [id, vertex] of vertices) {
    const degree = degrees.get(id);
    if (vertex.sides.length > 1) {
      return reject('corner_contact', `Boundary graph touches a square corner at vertex ${id}; Reading N forbids corner contacts.`, {vertex: id, sides: vertex.sides});
    }
    if (vertex.sides.length === 1) {
      sideVertices.push(id);
      if (degree !== 1) return reject('side_endpoint_degree', `Side contact ${id} has degree ${degree}; each Reading-N side contact must end exactly one visible edge.`, {vertex: id, side: vertex.sides[0], degree});
    } else if (vertex.sides.length === 0) {
      if (degree !== 2 && degree !== 4) return reject('interior_vertex_degree', `Interior vertex ${id} has degree ${degree}; Reading N permits only degree 2 or 4.`, {vertex: id, degree});
    }
  }
  for (const [id, degree] of degrees) {
    if (degree === 0) return reject('isolated_vertex', `Vertex ${id} is isolated from the visible boundary.`, {vertex: id});
  }
  const sideCounts = Object.fromEntries(SIDES.map(side => [side, 0]));
  for (const id of sideVertices) sideCounts[vertices.get(id).sides[0]]++;
  if (sideCounts.T !== sideCounts.B) return reject('top_bottom_imbalance', `Top and bottom transition counts differ (${sideCounts.T} versus ${sideCounts.B}).`, {sideCounts});
  if (sideCounts.L !== sideCounts.R) return reject('left_right_imbalance', `Left and right transition counts differ (${sideCounts.L} versus ${sideCounts.R}).`, {sideCounts});
  const components = connectedComponents(graph, adjacency);
  const summaries = components.map(component => componentSummary(component, graph, degrees));
  const k = sideCounts.T, l = sideCounts.L;
  if (l === 0 && k === 0 && edges.length > 0) {
    return reject('nonempty_without_transitions', 'A mask with no side transitions must be uniform (the visible boundary cannot be an interior cycle when both families are absent).', {sideCounts, components: summaries});
  }
  if (l === 0 && k > 0) {
    for (const summary of summaries) {
      if (!summary.simplePath || summary.endpointSides.sort().join(',') !== 'B,T') {
        return reject('absent_horizontal_family_component', 'With no left/right transitions, every visible component must be a simple top-to-bottom arc.', {component: summary, sideCounts});
      }
    }
  }
  if (k === 0 && l > 0) {
    for (const summary of summaries) {
      if (!summary.simplePath || summary.endpointSides.sort().join(',') !== 'L,R') {
        return reject('absent_vertical_family_component', 'With no top/bottom transitions, every visible component must be a simple left-to-right arc.', {component: summary, sideCounts});
      }
    }
  }
  return {
    passed: true, theorem: 'A', reading: 'N', source, bounds, epsilon,
    counts: {k, l, ...sideCounts}, vertices: vertices.size, edges: edges.length,
    components: summaries,
    note: k > 0 && l > 0
      ? 'The local criterion accepts this graph. A complete frame/plane-routing witness is not produced by this offline checker.'
      : 'The visible boundary itself is the one-family witness (or the mask is uniform).',
  };
}

/**
 * Return a deterministic combinatorial witness where the proof needs no
 * hidden connectors (uniform masks and the one-family A4 cases).  For k,l>0,
 * return the exact decision plus a stable routing plan summary and an explicit
 * unsupported stage for the proof's geometric construction.
 */
export function constructReadingNWitness(input) {
  const report = checkReadingN(input);
  if (!report.passed) return {accepted: false, report, reason: 'not_representable'};
  const direct = constructVisibleSheetWitness(input);
  if (direct.accepted) return direct;
  const graph = prepareInput(input);
  const adjacency = new Map([...graph.vertices.keys()].map(id => [id, []]));
  for (const edge of graph.edges) {
    adjacency.get(edge.u).push({to: edge.v, edge}); adjacency.get(edge.v).push({to: edge.u, edge});
  }
  const degrees = new Map([...graph.vertices.keys()].map(id => [id, adjacency.get(id).length]));
  const components = connectedComponents(graph, adjacency);
  if (report.counts.k === 0 && report.counts.l === 0) {
    return {accepted: true, kind: 'uniform', phase: 0, aArcs: [], bArcs: [], report};
  }
  if (report.counts.l === 0 || report.counts.k === 0) {
    const arcs = components.map(component => pathWitness(component, graph, adjacency, degrees));
    const family = report.counts.l === 0 ? 'A' : 'B';
    return {accepted: true, kind: 'visible-boundary-arcs', family, phase: 0, arcs, report};
  }
  const routingComponents = components.map(component => componentSummary(component, graph, degrees));
  routingComponents.sort((a, b) => a.vertices[0].localeCompare(b.vertices[0]));
  return {
    accepted: true, kind: 'state-plan', familyCounts: {A: report.counts.k, B: report.counts.l},
    cutCounts: {A: report.counts.k, B: report.counts.l},
    cutCountOptimality: 'The side-transition counts are the minimum possible family cut counts; helper routing must stay inside these paths.',
    phase: 0, visibleBoundary: routingComponents,
    geometricTransportImplemented: false,
    directWitnessFailure: direct.detail ?? direct.reason,
    unsupportedStage: 'frame-plane-routing-and-geometric-transport',
    reason: 'Theorem A decides this case, but this module does not emit the proof’s O(n²) weave state or Bézier geometry yet.',
    report,
  };
}

export const readingN = Object.freeze({check: checkReadingN, witness: constructReadingNWitness, boundaryGraphFromMask, boundaryGraphFromPolygons});

