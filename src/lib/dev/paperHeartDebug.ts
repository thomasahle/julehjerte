type PaperHeartDebugCtx = {
  paper: any;
  get fingers(): any[];
  set fingers(v: any[]);
  get gridSize(): number;
  set gridSize(v: number);
  get selectedFingerId(): string | null;
  set selectedFingerId(v: string | null);
  get selectedAnchors(): number[];
  set selectedAnchors(v: number[]);
  get hoverFingerId(): string | null;
  set hoverFingerId(v: string | null);
  get showCurves(): boolean;
  set showCurves(v: boolean);
  draw: () => void;
  fingerToSegments: (finger: any) => any[];
  getFingerById: (id: string) => any | null;
  cloneSegments: (segments: any[]) => any[];
  updateFingerSegments: (finger: any, segments: any[]) => any;
  applyDeltaToAnchorsInSegments: (finger: any, segments: any[], anchors: Iterable<number>, delta: any) => any[];
  snapshotState: () => any;
  pushUndo: (before: any) => void;
  undo: () => void;
};

export function attachPaperHeartDebug(target: any, ctx: PaperHeartDebugCtx): () => void {
  const getSegmentCountFromDom = () => {
    if (typeof document === 'undefined') return null;
    const text = document.querySelector('.segment-controls')?.textContent || '';
    const m = text.match(/Curve segments:\s*(\d+)/);
    return m ? Number(m[1]) : null;
  };

  const findControlItem = (fingerId: string, pointKey: string, segmentIndex?: number) => {
    const project = ctx.paper?.project;
    if (!project) return null;
    const items = project.getItems({
      match: (it: any) => {
        const d = it?.data;
        if (!d || d.kind !== 'control') return false;
        if (d.fingerId !== fingerId) return false;
        if (d.pointKey !== pointKey) return false;
        if (segmentIndex != null && d.segmentIndex !== segmentIndex) return false;
        return true;
      }
    });
    return items?.[0] ?? null;
  };

  const controlClientPoint = (fingerId: string, pointKey: string, segmentIndex?: number) => {
    const item = findControlItem(fingerId, pointKey, segmentIndex);
    if (!item) return null;
    const view = ctx.paper?.view;
    const el: HTMLCanvasElement | null = view?.element ?? null;
    if (!view || !el) return null;
    const rect = el.getBoundingClientRect();
    const viewPt = view.projectToView(item.position);
    const viewSize = view.viewSize ?? view.size;
    const scaleX = rect.width / (viewSize?.width || rect.width || 1);
    const scaleY = rect.height / (viewSize?.height || rect.height || 1);
    return {
      clientX: rect.left + viewPt.x * scaleX,
      clientY: rect.top + viewPt.y * scaleY,
      viewX: viewPt.x,
      viewY: viewPt.y,
      pointKey,
      fingerId
    };
  };

  type DebugState = {
    gridSize: number;
    fingers: any[];
    selectedFingerId: string | null;
    selectedAnchors: number[];
    hoverFingerId: string | null;
    showCurves: boolean;
  };

  const api = {
    getState(): DebugState {
      return {
        gridSize: ctx.gridSize,
        fingers: ctx.fingers,
        selectedFingerId: ctx.selectedFingerId,
        selectedAnchors: ctx.selectedAnchors,
        hoverFingerId: ctx.hoverFingerId,
        showCurves: ctx.showCurves
      };
    },

    setState(patch: Partial<DebugState>) {
      if (patch.gridSize != null) ctx.gridSize = patch.gridSize;
      if (patch.fingers != null) ctx.fingers = patch.fingers;
      if (patch.selectedFingerId !== undefined) ctx.selectedFingerId = patch.selectedFingerId;
      if (patch.selectedAnchors != null) ctx.selectedAnchors = patch.selectedAnchors;
      if (patch.hoverFingerId !== undefined) ctx.hoverFingerId = patch.hoverFingerId;
      if (patch.showCurves != null) ctx.showCurves = patch.showCurves;
      ctx.draw();
    },

    selectFinger(fingerId: string | null) {
      ctx.selectedFingerId = fingerId;
      ctx.selectedAnchors = [];
      ctx.draw();
    },

    selectAnchors(anchorIdxs: number[]) {
      ctx.selectedAnchors = anchorIdxs.slice();
      ctx.draw();
    },

    getSegmentsForFinger(fingerId: string) {
      const f = ctx.getFingerById(fingerId);
      if (!f) return null;
      return ctx.fingerToSegments(f);
    },

    getSegmentCountFromDom() {
      return getSegmentCountFromDom();
    },

    getControlClientPoint(fingerId: string, pointKey: string, segmentIndex?: number) {
      return controlClientPoint(fingerId, pointKey, segmentIndex);
    },

    moveAnchors(fingerId: string, anchorIdxs: number[], delta: { x: number; y: number }, pushToUndo = false) {
      const finger = ctx.getFingerById(fingerId);
      if (!finger) return false;

      const before = pushToUndo ? ctx.snapshotState() : null;
      const segs = ctx.cloneSegments(ctx.fingerToSegments(finger));
      ctx.applyDeltaToAnchorsInSegments(finger, segs, anchorIdxs, delta);
      const updated = ctx.updateFingerSegments(finger, segs);
      ctx.fingers = ctx.fingers.map((f) => (f.id === fingerId ? updated : f));
      if (before) ctx.pushUndo(before);
      ctx.draw();
      return true;
    },

    undo() {
      ctx.undo();
    },

    draw() {
      ctx.draw();
    }
  };

  target.__julefletPaperHeartDebug = api;
  return () => {
    if (target.__julefletPaperHeartDebug === api) {
      delete target.__julefletPaperHeartDebug;
    }
  };
}
