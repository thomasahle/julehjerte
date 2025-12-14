<script lang="ts">
  import { onMount } from 'svelte';
  import paper from 'paper';

  type Vec = { x: number; y: number };
  type LobeId = 'left' | 'right';

  type Finger = {
    id: string;
    lobe: LobeId;
    p0: Vec;
    p1: Vec;
    p2: Vec;
    p3: Vec;
  };

  type DragTarget =
    | { kind: 'control'; fingerId: string; pointKey: 'p0' | 'p1' | 'p2' | 'p3' }
    | { kind: 'path'; fingerId: string }
    | null;

  const CANVAS_SIZE = 600;
  const CENTER: Vec = { x: CANVAS_SIZE / 2, y: CANVAS_SIZE / 2 };
  const ROTATION_RAD = Math.PI / 4;
  const STRIP_WIDTH = 50;
  const LEFT_FILL = { r: 0.56, g: 0.93, b: 0.56, a: 0.7 };
  const RIGHT_FILL = { r: 1, g: 0.78, b: 0.78, a: 0.7 };

  function clamp(value: number, min: number, max: number) {
    return Math.max(min, Math.min(max, value));
  }

  function rotateVecAroundCenter(v: Vec, angleRad: number): Vec {
    const sin = Math.sin(angleRad);
    const cos = Math.cos(angleRad);
    const dx = v.x - CENTER.x;
    const dy = v.y - CENTER.y;
    return {
      x: CENTER.x + dx * cos - dy * sin,
      y: CENTER.y + dx * sin + dy * cos
    };
  }

  function unrotatePoint(p: paper.Point): Vec {
    return rotateVecAroundCenter({ x: p.x, y: p.y }, -ROTATION_RAD);
  }

  function unrotateDelta(delta: paper.Point): Vec {
    const sin = Math.sin(-ROTATION_RAD);
    const cos = Math.cos(-ROTATION_RAD);
    return {
      x: delta.x * cos - delta.y * sin,
      y: delta.x * sin + delta.y * cos
    };
  }

  function toPoint(v: Vec): paper.Point {
    return new paper.Point(v.x, v.y);
  }

  let canvas: HTMLCanvasElement;

  // Editing controls
  let gridSize = $state(3); // number of fingers/strips per lobe (2-8)
  let showBorders = $state(true);

  // Boundary curve model (unrotated coordinates)
  let fingers = $state<Finger[]>([]);
  let selectedFingerId = $state<string | null>(null);
  let dragTarget = $state<DragTarget>(null);

  // Unrotated border paths used for outlines
  let leftBorder: paper.PathItem | null = null;
  let rightBorder: paper.PathItem | null = null;

  function getSquareParams(strips = gridSize) {
    const squareSize = strips * STRIP_WIDTH;
    const squareLeft = CENTER.x - squareSize / 2;
    const squareTop = CENTER.y - squareSize / 2;
    const earRadius = squareSize / 2;
    return { squareSize, squareLeft, squareTop, earRadius };
  }

  function projectEndpoint(finger: Finger, point: Vec, pointKey: 'p0' | 'p3'): Vec {
    const { squareSize, squareLeft, squareTop } = getSquareParams();
    const minX = squareLeft;
    const maxX = squareLeft + squareSize;
    const minY = squareTop;
    const maxY = squareTop + squareSize;

    if (finger.lobe === 'left') {
      const y = clamp(point.y, minY, maxY);
      const x = pointKey === 'p0' ? maxX : minX;
      return { x, y };
    }

    const x = clamp(point.x, minX, maxX);
    const y = pointKey === 'p0' ? maxY : minY;
    return { x, y };
  }

  function createDefaultFingers(countPerLobe: number): Finger[] {
    const strips = countPerLobe;
    const { squareSize, squareLeft, squareTop } = getSquareParams(strips);

    const result: Finger[] = [];

    // Fingers are the space between adjacent curves, so we store the *boundary* curves.
    // For N strips, there are (N-1) internal boundaries per lobe (plus fixed outer edges).
    const internal = Math.max(0, strips - 1);

    // Left lobe boundaries: across overlap square (right edge -> left edge)
    for (let i = 0; i < internal; i++) {
      const t = (i + 1) / strips;
      const y = squareTop + t * squareSize;
      const p0: Vec = { x: squareLeft + squareSize, y };
      const p3: Vec = { x: squareLeft, y };

      const bow = (t - 0.5) * squareSize * 0.12;
      const p1: Vec = { x: p0.x - squareSize * 0.3, y: p0.y + bow };
      const p2: Vec = { x: p3.x + squareSize * 0.3, y: p3.y - bow };

      result.push({ id: `L-${i}`, lobe: 'left', p0, p1, p2, p3 });
    }

    // Right lobe boundaries: across overlap square (bottom edge -> top edge)
    for (let i = 0; i < internal; i++) {
      const t = (i + 1) / strips;
      const x = squareLeft + t * squareSize;
      const p0: Vec = { x, y: squareTop + squareSize };
      const p3: Vec = { x, y: squareTop };

      const bow = (t - 0.5) * squareSize * 0.12;
      const p1: Vec = { x: p0.x + bow, y: p0.y - squareSize * 0.3 };
      const p2: Vec = { x: p3.x - bow, y: p3.y + squareSize * 0.3 };

      result.push({ id: `R-${i}`, lobe: 'right', p0, p1, p2, p3 });
    }

    return result;
  }

  // Regenerate default fingers when count changes
  $effect(() => {
    const n = gridSize;
    fingers = createDefaultFingers(n);
    selectedFingerId = null;
    dragTarget = null;
  });

  function buildLobeShape(
    kind: LobeId,
    squareLeft: number,
    squareTop: number,
    squareSize: number,
    earRadius: number
  ): paper.PathItem {
    const squareRect = new paper.Path.Rectangle(
      new paper.Point(squareLeft, squareTop),
      new paper.Size(squareSize, squareSize)
    );

    let semi: paper.PathItem;
    if (kind === 'left') {
      const ear = new paper.Path.Circle(
        new paper.Point(squareLeft, squareTop + squareSize / 2),
        earRadius
      );
      const cut = new paper.Path.Rectangle(
        new paper.Point(squareLeft, squareTop),
        new paper.Point(squareLeft + earRadius, squareTop + squareSize)
      );
      semi = ear.subtract(cut);
      ear.remove();
      cut.remove();
    } else {
      const ear = new paper.Path.Circle(
        new paper.Point(squareLeft + squareSize / 2, squareTop),
        earRadius
      );
      const cut = new paper.Path.Rectangle(
        new paper.Point(squareLeft, squareTop),
        new paper.Point(squareLeft + squareSize, squareTop + earRadius)
      );
      semi = ear.subtract(cut);
      ear.remove();
      cut.remove();
    }

    const lobe = squareRect.unite(semi);
    squareRect.remove();
    semi.remove();

    lobe.fillColor =
      kind === 'left'
        ? new paper.Color(LEFT_FILL.r, LEFT_FILL.g, LEFT_FILL.b, LEFT_FILL.a)
        : new paper.Color(RIGHT_FILL.r, RIGHT_FILL.g, RIGHT_FILL.b, RIGHT_FILL.a);

    if (showBorders) {
      lobe.strokeColor = new paper.Color('#1a1a1a');
      lobe.strokeWidth = 2;
    } else {
      lobe.strokeColor = null;
      lobe.strokeWidth = 0;
    }

    lobe.data = { kind: 'lobe', lobe: kind };
    return lobe;
  }

  function lobeFillColor(lobe: LobeId) {
    return lobe === 'left'
      ? new paper.Color(LEFT_FILL.r, LEFT_FILL.g, LEFT_FILL.b, LEFT_FILL.a)
      : new paper.Color(RIGHT_FILL.r, RIGHT_FILL.g, RIGHT_FILL.b, RIGHT_FILL.a);
  }

  function withInsertItemsDisabled<T>(fn: () => T): T {
    const prev = paper.settings.insertItems;
    paper.settings.insertItems = false;
    try {
      return fn();
    } finally {
      paper.settings.insertItems = prev;
    }
  }

  function itemArea(item: paper.Item | null | undefined): number {
    const area = (item as unknown as { area?: number }).area;
    return typeof area === 'number' ? area : 0;
  }

  function boundaryIndexFromId(id: string): number {
    const parts = id.split('-');
    const idx = Number(parts[1]);
    return Number.isFinite(idx) ? idx : 0;
  }

  function candidateIsValid(fingerId: string, candidate: Finger): boolean {
    return withInsertItemsDisabled(() => {
      const { squareSize, squareLeft, squareTop } = getSquareParams();
      const minX = squareLeft;
      const maxX = squareLeft + squareSize;
      const minY = squareTop;
      const maxY = squareTop + squareSize;
      const orderEps = 1;
      const tol = 0.5;

      // Keep original boundary ordering: a boundary cannot move past its neighbors.
      const idx = boundaryIndexFromId(candidate.id);
      const prev = fingers.find(
        f => f.id !== fingerId && f.lobe === candidate.lobe && boundaryIndexFromId(f.id) === idx - 1
      );
      const next = fingers.find(
        f => f.id !== fingerId && f.lobe === candidate.lobe && boundaryIndexFromId(f.id) === idx + 1
      );

      if (candidate.lobe === 'left') {
        const minP0Y = (prev?.p0.y ?? minY) + orderEps;
        const maxP0Y = (next?.p0.y ?? maxY) - orderEps;
        const minP3Y = (prev?.p3.y ?? minY) + orderEps;
        const maxP3Y = (next?.p3.y ?? maxY) - orderEps;
        if (candidate.p0.y < minP0Y || candidate.p0.y > maxP0Y) return false;
        if (candidate.p3.y < minP3Y || candidate.p3.y > maxP3Y) return false;
      } else {
        const minP0X = (prev?.p0.x ?? minX) + orderEps;
        const maxP0X = (next?.p0.x ?? maxX) - orderEps;
        const minP3X = (prev?.p3.x ?? minX) + orderEps;
        const maxP3X = (next?.p3.x ?? maxX) - orderEps;
        if (candidate.p0.x < minP0X || candidate.p0.x > maxP0X) return false;
        if (candidate.p3.x < minP3X || candidate.p3.x > maxP3X) return false;
      }

      const candidatePath = buildFingerPath(candidate);
      const bounds = candidatePath.bounds;
      const insideSquare =
        bounds.left >= minX - tol &&
        bounds.right <= maxX + tol &&
        bounds.top >= minY - tol &&
        bounds.bottom <= maxY + tol;
      if (!insideSquare) {
        candidatePath.remove();
        return false;
      }

      for (const other of fingers) {
        if (other.id === fingerId) continue;
        if (other.lobe !== candidate.lobe) continue;
        const otherPath = buildFingerPath(other);
        const intersections = candidatePath.getIntersections(otherPath);
        otherPath.remove();
        if (intersections.length > 0) {
          candidatePath.remove();
          return false;
        }
      }
      candidatePath.remove();
      return true;
    });
  }

  function vecLerp(a: Vec, b: Vec, t: number): Vec {
    return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
  }

  function vecDist(a: Vec, b: Vec): number {
    const dx = a.x - b.x;
    const dy = a.y - b.y;
    return Math.hypot(dx, dy);
  }

  function moveControlToward(
    fingerId: string,
    base: Finger,
    pointKey: 'p1' | 'p2',
    from: Vec,
    to: Vec
  ): Vec {
    const desired = { ...base, [pointKey]: to } as Finger;
    if (candidateIsValid(fingerId, desired)) return to;

    const startOk = candidateIsValid(fingerId, { ...base, [pointKey]: from } as Finger);
    if (!startOk) return from;

    let lo = 0;
    let hi = 1;
    let best = 0;
    for (let i = 0; i < 8; i++) {
      const mid = (lo + hi) / 2;
      const pt = vecLerp(from, to, mid);
      const cand = { ...base, [pointKey]: pt } as Finger;
      if (candidateIsValid(fingerId, cand)) {
        best = mid;
        lo = mid;
      } else {
        hi = mid;
      }
    }
    return vecLerp(from, to, best);
  }

  function snapFreeControlPoint(
    fingerId: string,
    base: Finger,
    pointKey: 'p1' | 'p2',
    desired: Vec
  ): Vec {
    const direct = { ...base, [pointKey]: desired } as Finger;
    if (candidateIsValid(fingerId, direct)) return desired;

    // Start with the furthest point toward the cursor that remains valid
    let pt = moveControlToward(fingerId, base, pointKey, base[pointKey], desired);
    let bestDist = vecDist(pt, desired);

    const dirs: Vec[] = [
      { x: 1, y: 0 },
      { x: -1, y: 0 },
      { x: 0, y: 1 },
      { x: 0, y: -1 },
      { x: 1, y: 1 },
      { x: 1, y: -1 },
      { x: -1, y: 1 },
      { x: -1, y: -1 }
    ].map(d => {
      const len = Math.hypot(d.x, d.y);
      return { x: d.x / len, y: d.y / len };
    });

    const startStep = Math.min(30, Math.max(4, bestDist));
    for (let step = startStep; step >= 1; step /= 2) {
      for (let iter = 0; iter < 4; iter++) {
        let improved = false;
        let bestPt = pt;
        let bestLocalDist = bestDist;

        for (const dir of dirs) {
          const target = { x: pt.x + dir.x * step, y: pt.y + dir.y * step };
          const candPt = moveControlToward(fingerId, base, pointKey, pt, target);
          const d = vecDist(candPt, desired);
          if (d + 0.1 < bestLocalDist) {
            bestPt = candPt;
            bestLocalDist = d;
            improved = true;
          }
        }

        if (!improved) break;
        pt = bestPt;
        bestDist = bestLocalDist;
      }
    }

    return pt;
  }

  function applyConstrainedUpdate(
    fingerId: string,
    buildCandidate: (current: Finger, fraction: number) => Finger
  ) {
    const current = fingers.find(f => f.id === fingerId);
    if (!current) return;

    const desired = buildCandidate(current, 1);
    if (candidateIsValid(fingerId, desired)) {
      updateFinger(fingerId, () => desired);
      return;
    }

    let lo = 0;
    let hi = 1;
    let best = 0;
    for (let i = 0; i < 8; i++) {
      const mid = (lo + hi) / 2;
      const candidate = buildCandidate(current, mid);
      if (candidateIsValid(fingerId, candidate)) {
        best = mid;
        lo = mid;
      } else {
        hi = mid;
      }
    }

    if (best <= 0.001) return;
    const accepted = buildCandidate(current, best);
    updateFinger(fingerId, () => accepted);
  }

  function buildFingerPath(finger: Finger): paper.Path {
    const path = new paper.Path();
    path.moveTo(toPoint(finger.p0));
    path.cubicCurveTo(toPoint(finger.p1), toPoint(finger.p2), toPoint(finger.p3));
    return path;
  }

  function samplePath(path: paper.Path, samples: number): paper.Point[] {
    const length = path.length;
    if (!length) return [];
    const pts: paper.Point[] = [];
    for (let i = 0; i <= samples; i++) {
      const offset = (length * i) / samples;
      const pt = path.getPointAt(offset);
      if (pt) pts.push(pt);
    }
    return pts;
  }

  function buildRibbonBetween(a: paper.Path, b: paper.Path, samples = 40): paper.Path {
    const aPts = samplePath(a, samples);
    const bPts = samplePath(b, samples);
    const ribbon = new paper.Path();
    ribbon.addSegments(aPts.map(p => new paper.Segment(p)));
    ribbon.addSegments(bPts.reverse().map(p => new paper.Segment(p)));
    ribbon.closed = true;
    return ribbon;
  }

  function buildStripRegionBetween(a: paper.Path, b: paper.Path, overlap: paper.PathItem): paper.PathItem | null {
    return withInsertItemsDisabled(() => {
      const ribbon = buildRibbonBetween(a, b, 60);
      const clipped = ribbon.intersect(overlap, { insert: false });
      ribbon.remove();
      return clipped;
    });
  }

  function buildLobeStrips(
    lobe: LobeId,
    overlap: paper.PathItem,
    squareLeft: number,
    squareTop: number,
    squareSize: number
  ): Array<{ index: number; item: paper.PathItem }> {
    const squareRight = squareLeft + squareSize;
    const squareBottom = squareTop + squareSize;

    const internal = fingers
      .filter(f => f.lobe === lobe)
      .slice()
      .sort((a, b) => (lobe === 'left' ? a.p0.y - b.p0.y : a.p0.x - b.p0.x));

    const boundaries: Array<() => paper.Path> = [];

    if (lobe === 'left') {
      boundaries.push(
        () => new paper.Path.Line(new paper.Point(squareRight, squareTop), new paper.Point(squareLeft, squareTop))
      );
      internal.forEach(f => boundaries.push(() => buildFingerPath(f)));
      boundaries.push(
        () =>
          new paper.Path.Line(
            new paper.Point(squareRight, squareBottom),
            new paper.Point(squareLeft, squareBottom)
          )
      );
    } else {
      boundaries.push(
        () =>
          new paper.Path.Line(new paper.Point(squareLeft, squareBottom), new paper.Point(squareLeft, squareTop))
      );
      internal.forEach(f => boundaries.push(() => buildFingerPath(f)));
      boundaries.push(
        () =>
          new paper.Path.Line(new paper.Point(squareRight, squareBottom), new paper.Point(squareRight, squareTop))
      );
    }

    const strips: Array<{ index: number; item: paper.PathItem }> = [];
    for (let i = 0; i < boundaries.length - 1; i++) {
      const a = boundaries[i]();
      const b = boundaries[i + 1]();
      const strip = buildStripRegionBetween(a, b, overlap);
      a.remove();
      b.remove();
      if (!strip || Math.abs(itemArea(strip)) < 1) {
        strip?.remove();
        continue;
      }
      strip.fillColor = lobeFillColor(lobe);
      strip.strokeColor = null;
      strip.data = { kind: 'strip', lobe, stripIndex: i };
      strips.push({ index: i, item: strip });
    }
    return strips;
  }

  function draw() {
    if (!paper.project) return;
    paper.project.clear();

    const strips = gridSize;
    const { squareSize, squareLeft, squareTop, earRadius } = getSquareParams(strips);

    const items: paper.Item[] = [];

    // Lobes (build full shapes, then render outsides + woven overlap)
    const leftLobe = buildLobeShape('left', squareLeft, squareTop, squareSize, earRadius);
    const rightLobe = buildLobeShape('right', squareLeft, squareTop, squareSize, earRadius);

    // Keep unrotated border clones for outlines
    leftBorder = leftLobe.clone({ insert: false }) as paper.PathItem;
    rightBorder = rightLobe.clone({ insert: false }) as paper.PathItem;

    // Overlap and outside fills (avoid blended overlap)
    const overlap = leftLobe.intersect(rightLobe, { insert: false });
    const leftOutside = leftLobe.subtract(overlap, { insert: false });
    const rightOutside = rightLobe.subtract(overlap, { insert: false });
    leftLobe.remove();
    rightLobe.remove();

    leftOutside.fillColor = lobeFillColor('left');
    leftOutside.strokeColor = null;
    rightOutside.fillColor = lobeFillColor('right');
    rightOutside.strokeColor = null;
    items.push(leftOutside, rightOutside);

    // Build strip areas as the space between adjacent boundary curves, clipped to overlap
    const leftStrips = buildLobeStrips('left', overlap, squareLeft, squareTop, squareSize);
    const rightStrips = buildLobeStrips('right', overlap, squareLeft, squareTop, squareSize);

    // Weave: cut the under-strip at each crossing (space between lines)
    for (const l of leftStrips) {
      for (const r of rightStrips) {
        const inter = l.item.intersect(r.item, { insert: false });
        if (!inter || Math.abs(itemArea(inter)) < 1) {
          inter?.remove();
          continue;
        }
        const leftOnTop = (l.index + r.index) % 2 === 0;
        if (leftOnTop) {
          const fill = r.item.fillColor;
          const next = r.item.subtract(inter, { insert: false });
          next.fillColor = fill;
          next.strokeColor = null;
          r.item.remove();
          r.item = next;
        } else {
          const fill = l.item.fillColor;
          const next = l.item.subtract(inter, { insert: false });
          next.fillColor = fill;
          next.strokeColor = null;
          l.item.remove();
          l.item = next;
        }
        inter.remove();
      }
    }

    // Render woven strips
    leftStrips.forEach(s => items.push(s.item));
    rightStrips.forEach(s => items.push(s.item));

    // Render boundary curves on top (for editing/selection)
    for (const finger of fingers) {
      const isSelected = finger.id === selectedFingerId;
      const strokeColor = isSelected
        ? new paper.Color('#111111')
        : finger.lobe === 'left'
          ? new paper.Color('#cc0000')
          : new paper.Color('#006400');

      const path = new paper.Path({
        strokeColor,
        strokeWidth: isSelected ? 4 : 2,
        strokeCap: 'round',
        strokeJoin: 'round'
      });
      path.moveTo(toPoint(finger.p0));
      path.cubicCurveTo(toPoint(finger.p1), toPoint(finger.p2), toPoint(finger.p3));
      path.data = { kind: 'finger', fingerId: finger.id };
      items.push(path);
    }

    // Selected finger handles (drawn on top of weave)
    const selected = fingers.find(f => f.id === selectedFingerId);
    if (selected) {
      const c1 = new paper.Path.Line(toPoint(selected.p0), toPoint(selected.p1));
      c1.strokeColor = new paper.Color('#666666');
      c1.strokeWidth = 1;
      items.push(c1);

      const c2 = new paper.Path.Line(toPoint(selected.p3), toPoint(selected.p2));
      c2.strokeColor = new paper.Color('#666666');
      c2.strokeWidth = 1;
      items.push(c2);

      const endpointSize = 10;
      const handleRadius = 5;

      const p0 = new paper.Path.Rectangle({
        point: new paper.Point(selected.p0.x - endpointSize / 2, selected.p0.y - endpointSize / 2),
        size: endpointSize
      });
      p0.fillColor = new paper.Color('#ffffff');
      p0.strokeColor = new paper.Color('#111111');
      p0.strokeWidth = 2;
      p0.data = { kind: 'control', fingerId: selected.id, pointKey: 'p0' };
      items.push(p0);

      const p3 = new paper.Path.Rectangle({
        point: new paper.Point(selected.p3.x - endpointSize / 2, selected.p3.y - endpointSize / 2),
        size: endpointSize
      });
      p3.fillColor = new paper.Color('#ffffff');
      p3.strokeColor = new paper.Color('#111111');
      p3.strokeWidth = 2;
      p3.data = { kind: 'control', fingerId: selected.id, pointKey: 'p3' };
      items.push(p3);

      const p1 = new paper.Path.Circle(toPoint(selected.p1), handleRadius);
      p1.fillColor = new paper.Color(0.9);
      p1.strokeColor = new paper.Color('#111111');
      p1.strokeWidth = 1.5;
      p1.data = { kind: 'control', fingerId: selected.id, pointKey: 'p1' };
      items.push(p1);

      const p2 = new paper.Path.Circle(toPoint(selected.p2), handleRadius);
      p2.fillColor = new paper.Color(0.9);
      p2.strokeColor = new paper.Color('#111111');
      p2.strokeWidth = 1.5;
      p2.data = { kind: 'control', fingerId: selected.id, pointKey: 'p2' };
      items.push(p2);
    }

    // Lobe outlines last
    if (showBorders && leftBorder && rightBorder) {
      const leftOutline = leftBorder.clone();
      leftOutline.fillColor = null;
      leftOutline.strokeColor = new paper.Color('#1a1a1a');
      leftOutline.strokeWidth = 2;
      items.push(leftOutline);

      const rightOutline = rightBorder.clone();
      rightOutline.fillColor = null;
      rightOutline.strokeColor = new paper.Color('#1a1a1a');
      rightOutline.strokeWidth = 2;
      items.push(rightOutline);
    }

    // Rotate for the classic heart angle (keep state unrotated)
    const group = new paper.Group(items);
    group.rotate(45, new paper.Point(CENTER.x, CENTER.y));
  }

  function updateFinger(fingerId: string, updater: (f: Finger) => Finger) {
    fingers = fingers.map(f => (f.id === fingerId ? updater(f) : f));
  }

  function clampEndpoints(fingerId: string) {
    updateFinger(fingerId, f => ({
      ...f,
      p0: projectEndpoint(f, f.p0, 'p0'),
      p3: projectEndpoint(f, f.p3, 'p3')
    }));
  }

  function handleMouseDown(event: any) {
    const hits = paper.project.hitTestAll(event.point, {
      fill: true,
      stroke: true,
      tolerance: 10
    });
    const hit = hits.find(h => h.item?.data?.kind === 'control' || h.item?.data?.kind === 'finger');

    if (!hit) {
      selectedFingerId = null;
      dragTarget = null;
      draw();
      return;
    }

    const data = hit.item.data;
    if (data.kind === 'control') {
      selectedFingerId = data.fingerId;
      dragTarget = { kind: 'control', fingerId: data.fingerId, pointKey: data.pointKey };
      draw();
      return;
    }

    selectedFingerId = data.fingerId;
    dragTarget = { kind: 'path', fingerId: data.fingerId };
    draw();
  }

  function handleMouseDrag(event: any) {
    const target = dragTarget;
    if (!target) return;

    if (target.kind === 'control') {
      const p = unrotatePoint(event.point);
      if (target.pointKey === 'p1' || target.pointKey === 'p2') {
        const base = fingers.find(f => f.id === target.fingerId);
        if (!base) return;
        const snapped = snapFreeControlPoint(target.fingerId, base, target.pointKey, p);
        updateFinger(target.fingerId, f => ({ ...f, [target.pointKey]: snapped } as Finger));
        draw();
        return;
      }
      applyConstrainedUpdate(target.fingerId, (current, fraction) => {
        const oldPt = current[target.pointKey];
        const desiredPt =
          target.pointKey === 'p0' || target.pointKey === 'p3'
            ? projectEndpoint(current, p, target.pointKey)
            : p;
        const dx = (desiredPt.x - oldPt.x) * fraction;
        const dy = (desiredPt.y - oldPt.y) * fraction;
        const next = {
          ...current,
          [target.pointKey]: { x: oldPt.x + dx, y: oldPt.y + dy }
        } as Finger;
        if (target.pointKey === 'p0' || target.pointKey === 'p3') {
          next[target.pointKey] = projectEndpoint(next, next[target.pointKey], target.pointKey);
        }
        return next;
      });
      draw();
      return;
    }

    // Drag whole path: translate while keeping endpoints snapped and boundaries non-intersecting
    const dRaw = unrotateDelta(event.delta);
    applyConstrainedUpdate(target.fingerId, (current, fraction) => {
      const { squareSize, squareLeft, squareTop } = getSquareParams();
      const minX = squareLeft;
      const maxX = squareLeft + squareSize;
      const minY = squareTop;
      const maxY = squareTop + squareSize;

      let dx = dRaw.x;
      let dy = dRaw.y;

    if (current.lobe === 'left') {
      dx = 0;
      const dyMin = minY - Math.min(current.p0.y, current.p3.y);
      const dyMax = maxY - Math.max(current.p0.y, current.p3.y);
      dy = clamp(dRaw.y, dyMin, dyMax);
    } else {
      dy = 0;
      const dxMin = minX - Math.min(current.p0.x, current.p3.x);
      const dxMax = maxX - Math.max(current.p0.x, current.p3.x);
      dx = clamp(dRaw.x, dxMin, dxMax);
    }

      dx *= fraction;
      dy *= fraction;

      const moved: Finger = {
        ...current,
        p0: { x: current.p0.x + dx, y: current.p0.y + dy },
        p1: { x: current.p1.x + dx, y: current.p1.y + dy },
        p2: { x: current.p2.x + dx, y: current.p2.y + dy },
        p3: { x: current.p3.x + dx, y: current.p3.y + dy }
      };

    moved.p0 = projectEndpoint(moved, moved.p0, 'p0');
    moved.p3 = projectEndpoint(moved, moved.p3, 'p3');
    return moved;
  });
  draw();
}

  function handleMouseUp() {
    if (dragTarget?.kind === 'path') {
      clampEndpoints(dragTarget.fingerId);
    }
    dragTarget = null;
    draw();
  }

  onMount(() => {
    paper.setup(canvas);
    paper.view.onMouseDown = handleMouseDown;
    paper.view.onMouseDrag = handleMouseDrag;
    paper.view.onMouseUp = handleMouseUp;
    draw();
  });

  $effect(() => {
    if (canvas && paper.project) draw();
  });
</script>

<div class="paper-heart">
  <div class="controls">
    <label>
      Fingers:
      <input type="number" bind:value={gridSize} min="2" max="8" />
    </label>
    <label class="checkbox">
      <input type="checkbox" bind:checked={showBorders} />
      Show borders
    </label>
  </div>
  <div class="canvas-wrapper">
    <canvas bind:this={canvas} width={CANVAS_SIZE} height={CANVAS_SIZE}></canvas>
  </div>
</div>

<style>
  .paper-heart {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 1rem;
  }

  .controls {
    display: flex;
    gap: 1rem;
    z-index: 10;
    position: relative;
    align-items: center;
  }

  .checkbox {
    display: flex;
    gap: 0.5rem;
    align-items: center;
    user-select: none;
  }

  .canvas-wrapper {
    width: 600px;
    height: 600px;
  }

  canvas {
    background: transparent;
    cursor: default;
  }

  input[type='number'] {
    width: 60px;
    padding: 4px;
  }
</style>
