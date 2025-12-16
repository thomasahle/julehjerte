import fs from 'node:fs/promises';
import path from 'node:path';
import paperPkg from 'paper';

import type { Finger, GridSize } from '../src/lib/types/heart';
import type { HeartColors } from '../src/lib/stores/colors';
import {
  BASE_CENTER,
  buildLobeShape,
  buildLobeStrips,
  getOverlapParams,
  itemArea,
  lobeFillColor
} from '../src/lib/rendering/paperWeave';

const { PaperScope } = paperPkg;

const DEFAULT_SIZE = 600;
function usage(): never {
  console.error(
    [
      'Usage:',
      '  npm run render:png -- <heart-id-or-json> <out.png> [--size=600] [--left=#ffffff] [--right=#cc0000] [--no-weave]',
      '',
      'Examples:',
      '  npm run render:png -- hourglass-3x3 tmp/hourglass-3x3.png --size=900',
      '  npm run render:png -- static/hearts/hourglass-3x3.json tmp/hg.png --left=#fff --right=#b33'
    ].join('\n')
  );
  process.exit(2);
}

function parseArgs(argv: string[]) {
  const positional: string[] = [];
  const flags = new Map<string, string>();
  for (const arg of argv) {
    if (arg.startsWith('--')) {
      const [k, v = 'true'] = arg.slice(2).split('=');
      flags.set(k, v);
    } else {
      positional.push(arg);
    }
  }
  return { positional, flags };
}

function withInsertItemsDisabled<T>(paper: paper.PaperScope, fn: () => T): T {
  const prev = paper.settings.insertItems;
  paper.settings.insertItems = false;
  try {
    return fn();
  } finally {
    paper.settings.insertItems = prev;
  }
}

type RenderDesign = { gridSize: GridSize; fingers: Finger[] };

function normalizeGridSize(raw: unknown): GridSize {
  const clampInt = (value: number, min: number, max: number) => Math.max(min, Math.min(max, Math.round(value)));
  if (typeof raw === 'number' && Number.isFinite(raw)) {
    const n = clampInt(raw, 2, 8);
    return { x: n, y: n };
  }
  if (raw && typeof raw === 'object') {
    const x = (raw as any).x;
    const y = (raw as any).y;
    if (typeof x === 'number' && typeof y === 'number' && Number.isFinite(x) && Number.isFinite(y)) {
      return { x: clampInt(x, 2, 8), y: clampInt(y, 2, 8) };
    }
  }
  return { x: 3, y: 3 };
}

async function loadDesign(input: string): Promise<RenderDesign> {
  const jsonPath = input.endsWith('.json') ? input : path.join('static', 'hearts', `${input}.json`);
  const raw = await fs.readFile(jsonPath, 'utf8');
  const parsed = JSON.parse(raw) as { gridSize?: unknown; fingers?: unknown };
  const gridSize = normalizeGridSize(parsed.gridSize);
  const fingers = Array.isArray(parsed.fingers) ? (parsed.fingers as Finger[]) : [];
  return { gridSize, fingers };
}

async function renderDesignToPng(design: RenderDesign, outPath: string, size: number, colors: HeartColors, noWeave: boolean) {
  const paper = new PaperScope();
  paper.setup([size, size]);

  const SEAM_BLEED_PX = 3;

  const { width: overlapWidth, height: overlapHeight, left: overlapLeft, top: overlapTop } = getOverlapParams(design.gridSize, {
    x: BASE_CENTER,
    y: BASE_CENTER
  });

  const items: paper.Item[] = [];

  const leftLobe = buildLobeShape(paper, 'left', colors, overlapLeft, overlapTop, overlapWidth, overlapHeight);
  const rightLobe = buildLobeShape(paper, 'right', colors, overlapLeft, overlapTop, overlapWidth, overlapHeight);

  const overlapSquare = withInsertItemsDisabled(paper, () => {
    return new paper.Path.Rectangle(new paper.Point(overlapLeft, overlapTop), new paper.Size(overlapWidth, overlapHeight));
  });
  overlapSquare.fillColor = null;
  overlapSquare.strokeColor = null;

  // Base fill as a single color first, then layer the red-on-top regions. This
  // avoids a white-on-red AA seam along the fold line when the weave touches it.
  leftLobe.fillColor = lobeFillColor(paper, 'left', colors);
  leftLobe.strokeColor = null;
  rightLobe.fillColor = lobeFillColor(paper, 'left', colors);
  rightLobe.strokeColor = null;
  items.push(leftLobe, rightLobe);

  const rightOutsideOverlap = rightLobe.subtract(overlapSquare, { insert: false }) as paper.PathItem;
  rightOutsideOverlap.fillColor = lobeFillColor(paper, 'right', colors);
  rightOutsideOverlap.strokeColor = null;

  if (!noWeave) {
    // Only even-index strips are needed for the even-odd weave mask.
    const leftStrips = buildLobeStrips(
      paper,
      'left',
      colors,
      design.fingers,
      overlapSquare,
      overlapLeft,
      overlapTop,
      overlapWidth,
      overlapHeight,
      true
    );
    const rightStrips = buildLobeStrips(
      paper,
      'right',
      colors,
      design.fingers,
      overlapSquare,
      overlapLeft,
      overlapTop,
      overlapWidth,
      overlapHeight,
      true
    );

      // Build a single even-odd mask in the overlap and unite it with the
      // outside-right region. Painting this as one PathItem avoids hairline AA
      // seams where two red regions meet exactly on the fold line.
      const maskChildren = [
        ...leftStrips.filter((s) => s.index % 2 === 0).map((s) => s.item),
        ...rightStrips.filter((s) => s.index % 2 === 0).map((s) => s.item)
      ];

      const overlapOdd = withInsertItemsDisabled(paper, () => new paper.CompoundPath({ children: maskChildren }));
      overlapOdd.fillRule = 'evenodd';
      overlapOdd.fillColor = null;
      overlapOdd.strokeColor = null;

      // Add a tiny "bleed" bridge across the fold line for the odd overlap
      // cells. The outside-right lobe and overlap cells touch exactly at the
      // boundary, which can leave 1px AA seams at small sizes.
      const seamBand = withInsertItemsDisabled(paper, () => {
        return new paper.Path.Rectangle(
          new paper.Point(overlapLeft, overlapTop),
          new paper.Size(overlapWidth, SEAM_BLEED_PX)
        );
      });
      seamBand.fillColor = null;
      seamBand.strokeColor = null;

      const oddEdge = overlapOdd.intersect(seamBand, { insert: false }) as paper.PathItem | null;
      seamBand.remove();

      let seamBridge: paper.PathItem | null = null;
      if (oddEdge && Math.abs(itemArea(oddEdge)) >= 0.5) {
        const moved = oddEdge.clone({ insert: false }) as paper.PathItem;
        moved.translate(new paper.Point(0, -SEAM_BLEED_PX / 2));

        const rightClip = rightLobe.clone({ insert: false }) as paper.PathItem;
        rightClip.fillColor = null;
        rightClip.strokeColor = null;

        seamBridge = moved.intersect(rightClip, { insert: false }) as paper.PathItem | null;
        moved.remove();
        rightClip.remove();
      }
      oddEdge?.remove();

      const redTop = overlapOdd.unite(rightOutsideOverlap, { insert: false }) as paper.PathItem;
      overlapOdd.remove();
      rightOutsideOverlap.remove();

      redTop.fillColor = lobeFillColor(paper, 'right', colors);
      redTop.strokeColor = null;
      if (seamBridge && Math.abs(itemArea(seamBridge)) >= 0.5) {
        seamBridge.fillColor = lobeFillColor(paper, 'right', colors);
        seamBridge.strokeColor = null;
        items.push(seamBridge);
      } else {
        seamBridge?.remove();
      }
      if (Math.abs(itemArea(redTop)) >= 1) items.push(redTop);
      else redTop.remove();
  } else {
    rightOutsideOverlap.fillColor = lobeFillColor(paper, 'right', colors);
    rightOutsideOverlap.strokeColor = null;
    items.push(rightOutsideOverlap);
  }

  overlapSquare.remove();
  if (noWeave) {
    // nothing extra; base + rightOutsideOverlap already built
  }

  const group = new paper.Group(items);
  group.rotate(45, new paper.Point(BASE_CENTER, BASE_CENTER));
  const target = size * 0.85;
  const maxDim = Math.max(group.bounds.width, group.bounds.height) || 1;
  const scale = target / maxDim;
  group.scale(scale, new paper.Point(BASE_CENTER, BASE_CENTER));
  group.position = new paper.Point(size / 2, size / 2);

  paper.view.update();

  await fs.mkdir(path.dirname(outPath), { recursive: true });
  const buf = (paper.view.element as unknown as { toBuffer: (format: string) => Buffer }).toBuffer('image/png');
  await fs.writeFile(outPath, buf);

  paper.project.clear();
}

async function main() {
  const { positional, flags } = parseArgs(process.argv.slice(2));
  if (positional.length < 2) usage();

  const [input, outPath] = positional;
  const size = Number(flags.get('size') ?? DEFAULT_SIZE);
  if (!Number.isFinite(size) || size <= 0) throw new Error(`Invalid --size=${flags.get('size')}`);

  const colors: HeartColors = {
    left: flags.get('left') ?? '#ffffff',
    right: flags.get('right') ?? '#cc0000'
  };
  const noWeave = flags.get('no-weave') === 'true';

  const design = await loadDesign(input);
  await renderDesignToPng(design, outPath, size, colors, noWeave);
  console.log(`Wrote ${outPath}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
