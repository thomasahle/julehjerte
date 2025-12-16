import fs from 'node:fs/promises';
import path from 'node:path';
import paperPkg from 'paper';

import type { Finger } from '../src/lib/types/heart';
import type { HeartColors } from '../src/lib/stores/colors';
import {
  BASE_CENTER,
  STRIP_WIDTH,
  buildLobeShape,
  buildLobeStrips,
  buildOddWeaveMask,
  getSquareParams,
  itemArea,
  lobeFillColor
} from '../src/lib/rendering/paperWeave';

const { PaperScope } = paperPkg;

const DEFAULT_SIZE = 600;
const REFERENCE_GRID_SIZE = 4;

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

type RenderDesign = { gridSize: number; fingers: Finger[] };

async function loadDesign(input: string): Promise<RenderDesign> {
  const jsonPath = input.endsWith('.json') ? input : path.join('static', 'hearts', `${input}.json`);
  const raw = await fs.readFile(jsonPath, 'utf8');
  const parsed = JSON.parse(raw) as { gridSize: number; fingers: Finger[] };
  return { gridSize: parsed.gridSize, fingers: parsed.fingers };
}

async function renderDesignToPng(
  design: RenderDesign,
  outPath: string,
  size: number,
  colors: HeartColors,
  opts: { noWeave: boolean }
) {
  const { noWeave } = opts;
  const paper = new PaperScope();
  paper.setup([size, size]);

  const { squareSize, squareLeft, squareTop, earRadius } = getSquareParams(design.gridSize, {
    x: BASE_CENTER,
    y: BASE_CENTER
  });

  const referenceSquareSize = REFERENCE_GRID_SIZE * STRIP_WIDTH;
  const referenceExtent = (referenceSquareSize + referenceSquareSize / 2) * Math.SQRT2;
  const scale = (size * 0.85) / referenceExtent;

  const items: paper.Item[] = [];

  const leftLobe = buildLobeShape(paper, 'left', colors, squareLeft, squareTop, squareSize, earRadius);
  const rightLobe = buildLobeShape(paper, 'right', colors, squareLeft, squareTop, squareSize, earRadius);

  const overlapSquare = withInsertItemsDisabled(paper, () => {
    return new paper.Path.Rectangle(new paper.Point(squareLeft, squareTop), new paper.Size(squareSize, squareSize));
  });

  // Render overlap first, then draw the outside lobes on top. This hides any
  // sub-pixel fringes where many weave pieces meet the overlap boundary.
  const overlapBase = overlapSquare.clone({ insert: false }) as paper.PathItem;
  overlapBase.fillColor = lobeFillColor(paper, 'left', colors);
  overlapBase.strokeColor = null;
  items.push(overlapBase);

  const leftOutside = leftLobe.subtract(overlapSquare, { insert: false });
  leftLobe.remove();
  leftOutside.fillColor = lobeFillColor(paper, 'left', colors);
  leftOutside.strokeColor = null;

  let rightOutside = rightLobe.subtract(overlapSquare, { insert: false }) as paper.PathItem;
  rightLobe.remove();
  rightOutside.fillColor = lobeFillColor(paper, 'right', colors);
  rightOutside.strokeColor = null;

  if (!noWeave) {
    const leftStrips = buildLobeStrips(
      paper,
      'left',
      colors,
      design.fingers,
      overlapSquare,
      squareLeft,
      squareTop,
      squareSize,
      true
    );
    const rightStrips = buildLobeStrips(
      paper,
      'right',
      colors,
      design.fingers,
      overlapSquare,
      squareLeft,
      squareTop,
      squareSize,
      true
    );

    const oddMask = buildOddWeaveMask(paper, leftStrips, rightStrips);
    if (oddMask && Math.abs(itemArea(oddMask)) >= 1) {
      oddMask.fillColor = lobeFillColor(paper, 'right', colors);
      oddMask.strokeColor = null;
      // Union the red overlap cells with the red outside lobe to avoid
      // anti-alias seams where same-colored shapes meet along the overlap edge.
      const redComposite = rightOutside.unite(oddMask, { insert: false }) as paper.PathItem;
      oddMask.remove();
      rightOutside.remove();
      redComposite.fillColor = lobeFillColor(paper, 'right', colors);
      redComposite.strokeColor = null;
      rightOutside = redComposite;
    } else {
      oddMask?.remove();
    }
  }

  // Outsides on top of the overlap.
  items.push(leftOutside, rightOutside);

  overlapSquare.remove();

  const group = new paper.Group(items);
  group.rotate(45, new paper.Point(BASE_CENTER, BASE_CENTER));

  const normalizeScale = REFERENCE_GRID_SIZE / design.gridSize;
  if (normalizeScale !== 1) {
    group.scale(normalizeScale, new paper.Point(BASE_CENTER, BASE_CENTER));
  }

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
  await renderDesignToPng(design, outPath, size, colors, { noWeave });
  console.log(`Wrote ${outPath}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
