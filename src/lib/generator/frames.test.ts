import { describe, it, expect } from 'vitest';
import { slow } from './slow.test-helpers';
import { generate, fillSquare, fitCircle } from './generate';
import { cutTipCounts } from './cutQuality';
import { generateFittedFigure, mirrorSymmetric } from './fitted';
import { generateLayeredFigure } from './layers';
import { generateCornerChecks, hasThreeCounterLanes } from './cornerChecks';
import { defaults, frameGap, readGeneratorState, stripCount, stripPlace, stripSide } from './state';
import { templateVariants } from './templates';
import { inside, uprightToSheet, distance, boardFill, boardLines, boardRangeLines, boardRangePattern, boardRanges, boardWholeRadius, boardWholeTop, layerInset, withVisibleIslands, ConstructionError, WEDGES, type Point, type Ring } from './geometry';
import { generateTextGrid } from './textGrid';
import { geometryKey } from './cache';
import { MOTIF, boardRadius, boardSetting, boardSteps, motifChoices, motifPatterns, squareChoices } from './boardMotif';
import { normalizeContours } from './contours';
import { rasterizeDesign } from '$lib/paint/rasterize';
import { serializeHeartDesign, normalizeHeartDesign, serializeHeartToSVG, parseHeartFromSVG } from '$lib/utils/heartDesign';
import { inferOverlapRect } from '$lib/utils/overlapRect';
import { intersectionMarginPx } from '$lib/editor/curveIssues';
import { findSearchIssues } from './searchClearance';
import { gridClearanceScale } from '$lib/geometry/clearance';
import tree from '../../../static/generator/motifs/tree.json';
import deer from '../../../static/generator/motifs/pin-reindeer.json';
import horse from '../../../static/generator/motifs/ph-horse.json';
import bird from '../../../static/generator/motifs/ph-bird.json';
import star from '../../../static/generator/motifs/star.json';
import houseMotif from '../../../static/generator/motifs/house.json';
import snowflake from '../../../static/generator/motifs/ph-snowflake.json';
import gift from '../../../static/generator/motifs/gift.json';
import female from '../../../static/generator/motifs/ph-gender-female.json';
import sun from '../../../static/generator/motifs/ph-sun.json';
import bicycle from '../../../static/generator/motifs/ph-bicycle.json';
import coffee from '../../../static/generator/motifs/ph-coffee.json';
import snow from '../../../static/generator/motifs/snow.json';
import sailboat from '../../../static/generator/motifs/ph-sailboat.json';
import cookie from '../../../static/generator/motifs/tb-cookie.json';
import cat from '../../../static/generator/motifs/ph-cat.json';
import tablerGift from '../../../static/generator/motifs/tb-gift.json';
import bow from '../../../static/generator/motifs/tb-bow.json';
import butterfly from '../../../static/generator/motifs/ph-butterfly.json';
import paw from '../../../static/generator/motifs/tb-paw.json';
import crown from '../../../static/generator/motifs/ph-crown.json';
import bell from '../../../static/generator/motifs/bell.json';
import heart from '../../../static/generator/motifs/heart.json';
import fish from '../../../static/generator/motifs/ph-fish.json';
import butterflyMotif from '../../../static/generator/motifs/ph-butterfly.json';
import tablerFlower from '../../../static/generator/motifs/tb-flower.json';
import columnsPlus from '../../../static/generator/motifs/ph-columns-plus-left.json';
import peace from '../../../static/generator/motifs/ph-peace.json';
import copyPlus from '../../../static/generator/motifs/tb-copy-plus.json';
import polarStar from '../../../static/generator/motifs/gi-polar-star.json';
import dove from '../../../static/generator/motifs/pin-dove.json';
import pinCat from '../../../static/generator/motifs/pin-cat.json';
import candyCane from '../../../static/generator/motifs/mdi-candy-cane.json';
import candy from '../../../static/generator/motifs/mc-candy.json';
import faFish from '../../../static/generator/motifs/fa-fish.json';
import circleMotif from '../../../static/generator/motifs/circle.json';
import { lobesShareTemplate } from '$lib/utils/symmetry';
const colors = { left: '#fff', right: '#b91313' };
const examples = { tree, horse, bird, star, snowflake };

describe('complete motif frames', () => {
 it('divides the crown between three lanes without changing its outline or checked corners', () => {
  const rings = normalizeContours(crown.contours as Ring[]);
  expect(hasThreeCounterLanes(rings)).toBe(true);
  expect(hasThreeCounterLanes(normalizeContours(cat.contours as Ring[]))).toBe(false);
  const result = generateCornerChecks(rings, 70, .7, 'separated', true, false, undefined, .25);
  expect(result.artwork).toEqual(rings.map(r => r.map(([x, y]) => uprightToSheet([x * 70 * .7, y * 70 * .7]))));
  expect(result.geometry.A_overlap_paths).toHaveLength(5);
  expect(result.geometry.B_overlap_paths).toHaveLength(5);
  for (const t of [6, 94]) {
   expect(result.edges).toContainEqual({ from: [t, 0], to: [t, 100], family: 'A', kind: 'frame' });
   expect(result.edges).toContainEqual({ from: [0, t], to: [100, t], family: 'B', kind: 'frame' });
  }
 });
 it('keeps all three crown counters on open strips through both exports', () => {
  const { design } = generate({ mode: 'figure', name: 'Crown', contours: crown.contours as Ring[], colors, style: 'corners' });
  expect(design.gridSize).toEqual({ x: 6, y: 6 });
  expect(cutTipCounts(design)).toEqual([0, 0]);
  const margin = intersectionMarginPx(inferOverlapRect(design.fingers, design.gridSize), gridClearanceScale(6));
  expect(findSearchIssues(design.fingers, margin * 1.1).size).toBe(0);
  const before = rasterizeDesign(design, 240).data;
  for (const restored of [normalizeHeartDesign(serializeHeartDesign(design)), parseHeartFromSVG(serializeHeartToSVG(design))]) {
   expect(restored).not.toBeNull();
   expect(restored!.fingers).toHaveLength(design.fingers.length);
   expect(restored).not.toHaveProperty('leftCutouts');
   expect(restored).not.toHaveProperty('rightCutouts');
   const rect = inferOverlapRect(restored!.fingers, restored!.gridSize);
   expect(findSearchIssues(restored!.fingers, intersectionMarginPx(rect, gridClearanceScale(6))).size).toBe(0);
   expect(rasterizeDesign(restored!, 240).data).toEqual(before);
  }
 }, 20000);
 it('tilts invisible panel seams without distorting the paw, medallion or outer bands', () => {
  const rings = normalizeContours(paw.contours as Ring[]);
  const result = generateLayeredFigure(rings, 70, .7,
   { columns: 2, rows: 2, filled: false, adaptive: true, shear: -.2 });
  expect(result.artwork.slice(1)).toEqual(rings.map(r => r.map(([x, y]) => uprightToSheet([x * .7 * 70, y * .7 * 70]))));
  expect(result.artwork[0]).toEqual(Array.from({ length: 96 }, (_, i) =>
   uprightToSheet([.5 * Math.cos(i * Math.PI / 48) * 70, .5 * Math.sin(i * Math.PI / 48) * 70] as Point)));
  for (const t of [layerInset(70), 11, 89, 100 - layerInset(70)]) {
   expect(result.edges).toContainEqual({ from: [t, 0], to: [t, 100], family: 'A', kind: 'frame' });
   expect(result.edges).toContainEqual({ from: [0, t], to: [100, t], family: 'B', kind: 'frame' });
  }
 });
 it('cuts the fish\'s outline on from its eye\'s bridge without turning back', () => {
  // The bridge met the outline a hair from a vertex, which the arc it split
  // left out: the bridge's index lay a vertex behind its point, so one sheet
  // cut back along the outline and out again, three needles at 80%.
  const { design, hardToCut } = generate({ mode: 'figure', name: 'Fish', contours: faFish.contours as Ring[], colors, style: 'silhouette', frame: 'circle', frameSize: 70, scale: .8, gap: 3 });
  expect(hardToCut).toBeUndefined();
  expect(cutTipCounts(design)).toEqual([0, 0]);
 });
 it('cuts the dove without the needles of its outline\'s hairline zigzag', () => {
  // Its outline ran 0.7 back and forth along itself under the wing.
  const { design } = generate({ mode: 'figure', name: 'Dove', contours: dove.contours as Ring[], colors, style: 'rays', frame: 'circle', frameSize: 70, scale: .7, gap: 3 });
  expect(cutTipCounts(design)).toEqual([0, 0]);
 });
 it('cuts the plain circle with one template for both lobes', () => {
  // Its points lie in mirror pairs across the heart's middle: a 63-gon from
  // 5.7° did not, and in the rays below 78% its lobes' cuts differed.
  const { design } = generate({ mode: 'figure', name: 'Circle', contours: circleMotif.contours as Ring[], colors, style: 'rays', frame: 'circle', frameSize: 70, scale: .7, gap: 3 });
  expect(lobesShareTemplate(design.fingers, design.gridSize)).toBe(true);
 });
 slow('bends a hard-to-cut figure at sharp tips where its narrowest paper keeps', () => {
  // The cat's tail meets its body in a notch the double border leaves on one
  // sheet (hard to cut); its connections' sharp tips bend as a clean heart's.
  const result = generate({ mode: 'figure', name: 'Cat', contours: pinCat.contours as Ring[], colors, style: 'layers' });
  expect(result.hardToCut).toBeDefined();
  expect(cutTipCounts(result.design)).toEqual([1, 1]);
 });
 slow('rounds the layered paw connections and keeps its open cuts through both exports', () => {
  const { design } = generate({ mode: 'figure', name: 'Paw', contours: paw.contours as Ring[], colors, style: 'layers' });
  expect(design.gridSize).toEqual({ x: 9, y: 9 });
  expect(cutTipCounts(design)).toEqual([1, 1]);
  const before = rasterizeDesign(design, 240).data;
  for (const restored of [normalizeHeartDesign(serializeHeartDesign(design)), parseHeartFromSVG(serializeHeartToSVG(design))]) {
   expect(restored).not.toBeNull();
   expect(restored!.fingers).toHaveLength(design.fingers.length);
   expect(restored).not.toHaveProperty('leftCutouts');
   expect(restored).not.toHaveProperty('rightCutouts');
   const rect = inferOverlapRect(restored!.fingers, restored!.gridSize);
   const margin = intersectionMarginPx(rect, gridClearanceScale(9, 9));
   expect(findSearchIssues(restored!.fingers, margin).size).toBe(0);
   expect(rasterizeDesign(restored!, 240).data).toEqual(before);
  }
 }, 20000);
 for (const [name, motif, style, size] of [
  ['bow', bow, 'fitted', 4], ['butterfly', butterfly, 'layers', 8]
 ] as const) {
  it(`moves the ${name} panel seam clear of narrow outline details`, () => {
   const { design } = generate({ mode: 'figure', name, contours: motif.contours as Ring[], colors, style });
   expect(design.gridSize).toEqual({ x: size, y: size });
   expect(design).not.toHaveProperty('leftCutouts');
   expect(design).not.toHaveProperty('rightCutouts');
   const restored = normalizeHeartDesign(serializeHeartDesign(design));
   expect(rasterizeDesign(restored!, 240).data).toEqual(rasterizeDesign(design, 240).data);
  }, 20000);
 }
 for (const [name, motif] of Object.entries({ gift, bicycle, coffee, snow, sailboat })) {
  it(`keeps ${name} and its counters in the six-strip checked-tip frame`, () => {
   const { design } = generate({ mode: 'figure', name, contours: motif.contours as Ring[], colors, style: 'corners' });
   expect(design.gridSize).toEqual({ x: 6, y: 6 });
   expect(design).not.toHaveProperty('rightCutouts');
   expect(design).not.toHaveProperty('leftCutouts');
   const restored = normalizeHeartDesign(serializeHeartDesign(design));
   expect(restored).not.toBeNull();
   expect(rasterizeDesign(restored!, 160).data).toEqual(rasterizeDesign(design, 160).data);
  });
 }
 it('fits a large motif between the corner checks without crossing the outer bands', () => {
  const { design } = generate({ mode: 'figure', name: 'Large gift', contours: gift.contours as Ring[], colors, style: 'corners', scale: .85 });
  expect(design.gridSize).toEqual({ x: 6, y: 6 });
  expect(design).not.toHaveProperty('rightCutouts');
  expect(design).not.toHaveProperty('leftCutouts');
 });
 it('bends the checked-tip frame\'s side lanes out past a full-size star', () => {
  // At 100% the star's lower tips came within half a unit of the side lanes'
  // straight legs to the bottom tip: hard to cut.
  const result = generate({ mode: 'figure', name: 'Star', contours: star.contours as Ring[], colors, style: 'corners', scale: 1 });
  expect(result.hardToCut).toBeUndefined();
 });
 for (const style of ['fitted', 'corners', 'layers'] as const) {
  for (const [name, motif] of Object.entries(examples)) {
   it(`constructs ${name} with ${style} using validated open cuts`, () => {
    const { design } = generate({ mode: 'figure', name, contours: motif.contours as Ring[], colors, style });
    const strips = style === 'fitted' ? 5 : style === 'corners' ? 6 : 7;
    expect(design.gridSize).toEqual({ x: strips, y: strips });
    expect(design).not.toHaveProperty('rightCutouts');
    expect(design).not.toHaveProperty('leftCutouts');
    const restored = normalizeHeartDesign(serializeHeartDesign(design));
    expect(restored?.gridSize).toEqual(design.gridSize);
   });
  }
  it(`shares ${style} as one complete frame selection`, () => {
   const state = { ...defaults, mode: 'figure' as const, style };
   expect(readGeneratorState('#make=' + encodeURIComponent(JSON.stringify(state)))).toEqual(state);
   expect(templateVariants(state).find(v => v.state.style === style)?.state).toEqual(state);
  });
 }
 it('attaches the fitted grid directly to silhouette support points', () => {
  const result = generateFittedFigure(horse.contours as Ring[]);
  const frame = result.edges.filter(e => e.kind === 'frame');
  const attached = frame.filter(e => result.artwork.some(r => r.some(p => Math.hypot(p[0] - e.to[0], p[1] - e.to[1]) < 1e-6)));
  expect(attached.length).toBeGreaterThanOrEqual(4);
 });
 it('leaves no decorative checkerboard in the central field of the checked-tip frame', () => {
  const contours = star.contours as Ring[];
  const original = generateCornerChecks(contours);
  const { design } = generate({ mode: 'figure', name: 'Star', contours, colors, style: 'corners' });
  const mask = rasterizeDesign(design, 100).data;
  let background = 0;
  for (let y = 32; y < 68; y++) for (let x = 32; x < 68; x++) {
   const p: [number, number] = [x + .5, y + .5];
   if (!original.artwork.some(r => inside(p, r))) background += Number(mask[y * 100 + x] === 0);
  }
  expect(background).toBeGreaterThan(500);
 });
 it('routes nested gift contours through the layered border without holes in either paper', () => {
  const { design } = generate({ mode: 'figure', name: 'Gift', contours: gift.contours as Ring[], colors, style: 'layers' });
  expect(design.gridSize).toEqual({ x: 7, y: 7 });
  expect(design).not.toHaveProperty('rightCutouts');
 });
 it('builds the layered female-symbol reference with nested invisible cuts', () => {
  const { design } = generate({ mode: 'figure', name: 'Female', contours: female.contours as Ring[], colors, style: 'layers' });
  expect(design.gridSize).toEqual({ x: 7, y: 7 });
 });
 it('retains two complete outer bands when the medallion uses several panels', () => {
  const result = generateLayeredFigure(sun.contours as Ring[], 70, .7, { columns: 1, rows: 2, filled: false });
  for (const t of [layerInset(70), 11, 89, 100 - layerInset(70)]) {
   expect(result.edges).toContainEqual({ from: [t, 0], to: [t, 100], family: 'A', kind: 'frame' });
   expect(result.edges).toContainEqual({ from: [0, t], to: [100, t], family: 'B', kind: 'frame' });
  }
 });
 for (const [name, motif] of Object.entries({ cookie, cat, bicycle, tablerGift })) {
  slow(`opens the nested ${name} counters in the layered frame with seven strips`, () => {
   const { design } = generate({ mode: 'figure', name, contours: motif.contours as Ring[], colors, style: 'layers' });
   expect(design.gridSize).toEqual({ x: 7, y: 7 });
   expect(design).not.toHaveProperty('leftCutouts');
   expect(design).not.toHaveProperty('rightCutouts');
   expect(cutTipCounts(design)[1]).toBeLessThanOrEqual(name === 'cookie' ? 2 : 0);
   const restored = normalizeHeartDesign(serializeHeartDesign(design));
   expect(restored?.fingers).toHaveLength(design.fingers.length);
   expect(rasterizeDesign(restored!, 240).data).toEqual(rasterizeDesign(design, 240).data);
  });
 }
 it('distributes separate stars and a snowflake over the three central lanes', () => {
  const contours: Ring[] = (snowflake.contours as Ring[]).map(r => r.map(([x,y]) => [x*.6,y*.6]));
  for (const x of [-.36,.36]) for (const y of [-.3,.3])
   contours.push(...(star.contours as Ring[]).map(r => r.map(([u,v]) => [x+u*.18,y+v*.18] as [number,number])));
  const { design } = generate({ mode: 'figure', name: 'Snowflake and stars', contours, colors, style: 'corners' });
  expect(design.gridSize).toEqual({ x: 6, y: 6 });
 });
});

describe('frames from real hearts', () => {
 const corners: Point[] = [[0, 0], [100, 0], [100, 100], [0, 100]];
 it('points a wedge from each corner at the motif, stopping a gap short of it', () => {
  const result = generateFittedFigure(star.contours as Ring[], 70, .7, undefined, undefined, 0, WEDGES);
  const legs = result.edges.filter(e => e.kind === 'frame');
  expect(legs).toHaveLength(8);
  for (const [i, corner] of corners.entries()) {
   const tip = result.domain[0][i], own = legs.filter(e => distance(e.to, tip) < 1e-9);
   expect(own).toHaveLength(2);
   // Each leg meets the paper edge part of the way from the corner.
   for (const { from } of own) for (const axis of [0, 1]) if (from[axis] !== corner[axis])
    expect(Math.abs(from[axis] - corner[axis])).toBeCloseTo(Math.abs(tip[axis] - corner[axis]) * WEDGES.taper);
   // The tip lies the gap beyond the motif's own supporting line.
   const d: Point = [corner[0] ? Math.SQRT1_2 : -Math.SQRT1_2, corner[1] ? Math.SQRT1_2 : -Math.SQRT1_2];
   const reach = Math.max(...result.artwork.flat().map(p => p[0] * d[0] + p[1] * d[1]));
   expect(tip[0] * d[0] + tip[1] * d[1] - reach).toBeCloseTo(WEDGES.gap);
  }
 });
 it('colours the wedges like the motif, with plain paper between them', () => {
  const { design } = generate({ mode: 'figure', name: 'Star', contours: star.contours as Ring[], colors, style: 'wedges' });
  expect(design.gridSize).toEqual({ x: 3, y: 3 });
  const mask = rasterizeDesign(design, 100).data, at = ([x, y]: Point) => mask[Math.floor(y) * 100 + Math.floor(x)];
  const ink = at([50, 50]);
  for (const corner of corners) expect(at([corner[0] ? 99 : 1, corner[1] ? 99 : 1])).toBe(ink);
  for (const side of [[50, 1], [99, 50], [50, 99], [1, 50]] as Point[]) expect(at(side)).toBe(1 - ink);
 }, 20000);
 for (const [name, motif] of Object.entries(examples))
  it(`weaves ${name} with wedges using validated open cuts`, () => {
   const { design, hardToCut } = generate({ mode: 'figure', name, contours: motif.contours as Ring[], colors, style: 'wedges' });
   expect(hardToCut).toBeUndefined();
   expect(design).not.toHaveProperty('rightCutouts');
   expect(design).not.toHaveProperty('leftCutouts');
   const restored = normalizeHeartDesign(serializeHeartDesign(design));
   expect(rasterizeDesign(restored!, 240).data).toEqual(rasterizeDesign(design, 240).data);
  }, 20000);
 it('scales the silhouette to fill the square, keeping a margin for its corner checks', () => {
  const request = { mode: 'figure' as const, name: 'Star', contours: star.contours as Ring[], colors, style: 'silhouette' as const };
  const reach = (scale: number) => {
   const filled = fillSquare({ ...request, scale });
   const size = filled.frameSize! * filled.scale!;
   return Math.max(...(star.contours as Ring[]).flat().map(([x, y]) => (Math.abs(x) + Math.abs(y)) * size));
  };
  expect(reach(.85)).toBeCloseTo(50 * Math.SQRT2 - 6);
  expect(reach(.7) / reach(.85)).toBeCloseTo(.7 / .85);
  expect(fillSquare({ ...request, style: 'fitted' })).toEqual({ ...request, style: 'fitted' });
  const { design } = generate(request);
  expect(design.gridSize).toEqual({ x: 3, y: 3 });
  const mask = rasterizeDesign(design, 100).data, at = ([x, y]: Point) => mask[Math.floor(y) * 100 + Math.floor(x)];
  // The motif's colour fills the centre; each corner keeps a check of it.
  for (const corner of corners) expect(at([corner[0] ? 99 : 1, corner[1] ? 99 : 1])).toBe(at([50, 50]));
 }, 20000);
 it('repeats a simple motif on every square of one colour of a 4×4 board', () => {
  const { design, hardToCut } = generate({ mode: 'figure', name: 'Star', contours: star.contours as Ring[], colors, style: 'motifs' });
  expect(design.gridSize).toEqual({ x: 4, y: 4 });
  expect(hardToCut).toBeUndefined();
  const mask = rasterizeDesign(design, 400).data;
  for (let row = 0; row < 4; row++) for (let col = 0; col < 4; col++) {
   const background = (row + col) % 2, centre = mask[Math.floor((row + .5) * 100) * 400 + Math.floor((col + .5) * 100)];
   // Squares of the first colour show a star in the other colour; the
   // other squares are plain, so both centres have that other colour.
   expect(mask[(row * 100 + 2) * 400 + col * 100 + 2]).toBe(background);
   expect(centre).toBe(1);
  }
 }, 20000);
 it('knows a motif that is its own mirror image', () => {
  expect(mirrorSymmetric(normalizeContours(tree.contours as Ring[]))).toBe(true);
  expect(mirrorSymmetric(normalizeContours(horse.contours as Ring[]))).toBe(false);
 });
 slow('gives a motif that is its own mirror image symmetric wedges, where its own gates leave narrow paper too', () => {
  // The flower's two lower petals tie; the gate between them left narrow
  // paper, and its own extremes gave a lopsided frame.
  const { design } = generate({ mode: 'figure', name: 'Flower', contours: tablerFlower.contours as Ring[], colors, style: 'wedges' });
  const n = 120, mask = rasterizeDesign(design, n).data;
  let differ = 0;
  // Mirrored across the heart's middle the paper's x and y swap, and so do the sheets.
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) differ += Number(mask[y * n + x] === mask[x * n + y]);
  expect(Math.min(differ, n * n - differ) / n / n).toBeLessThan(.01);
 });
 it('lays small motifs on the other colour of four strips where the first cannot be cut', () => {
  // The bell cannot stand in the top and bottom squares of four strips; the
  // other colour's eight squares hold it, before fewer copies on a smaller board.
  const { design, hardToCut, layout } = generate({ mode: 'figure', name: 'Bell', contours: bell.contours as Ring[], colors, style: 'motifs' });
  expect(design.gridSize).toEqual({ x: 4, y: 4 });
  expect(hardToCut).toBeUndefined();
  expect(motifChoices()[layout!.alternative].text).toBe(motifPatterns(4)[1]);
  const restored = parseHeartFromSVG(serializeHeartToSVG(design));
  expect(rasterizeDesign(restored!, 240).data).toEqual(rasterizeDesign(design, 240).data);
 }, 30000);
 it('lays as many small motifs as the strips the visitor chose hold', () => {
  for (const board of [2, 6, 8]) {
   const { design, hardToCut, layout } = generate({ mode: 'figure', name: 'Star', contours: star.contours as Ring[], colors, style: 'motifs', board });
   expect(design.gridSize.x, `${board}`).toBe(board);
   expect(hardToCut, `${board}`).toBeUndefined();
   // Every square of one colour, where it can be: 2, 18 and 32 stars.
   expect([...motifChoices(board)[layout!.alternative].text].filter(c => c === '*').length, `${board}`).toBe([2, 18, 32][[2, 6, 8].indexOf(board)]);
  }
 });
 it('lays the motif in the centre square of a regular board, with equal squares around it', () => {
  for (const [name, motif] of Object.entries({ star, tree, gift, cat })) {
   const { design, hardToCut } = generate({ mode: 'figure', name, contours: motif.contours as Ring[], colors, style: 'squares' });
   expect(design.gridSize, name).toEqual({ x: 3, y: 3 });
   expect(hardToCut, name).toBeUndefined();
   // Every cut leaves the paper edge along a line of the board and runs one
   // whole square before turning at a corner of the motif's square, and back.
   const rect = inferOverlapRect(design.fingers, design.gridSize);
   const board = ({ x, y }: { x: number; y: number }) => [(x - rect.left) / rect.width * 3, (y - rect.top) / rect.height * 3];
   for (const { segments } of design.fingers.filter(f => f.segments.length > 1))
    for (const { p0, p3 } of [segments[0], segments[segments.length - 1]])
     for (const v of [...board(p0), ...board(p3)]) expect(Math.abs(v - Math.round(v)), name).toBeLessThan(1e-6);
  }
 }, 30000);
 it('lays the motif alone in the centre square of the strips the visitor chose, every square equal', () => {
  for (const board of [5, 7]) {
   const { design, hardToCut } = generate({ mode: 'figure', name: 'Star', contours: star.contours as Ring[], colors, style: 'squares', board });
   expect(design.gridSize, `${board}`).toEqual({ x: board, y: board });
   expect(hardToCut, `${board}`).toBeUndefined();
   const rect = inferOverlapRect(design.fingers, design.gridSize);
   const square = ({ x, y }: { x: number; y: number }) => [(x - rect.left) / rect.width * board, (y - rect.top) / rect.height * board];
   for (const { segments } of design.fingers.filter(f => f.segments.length > 1))
    for (const { p0, p3 } of [segments[0], segments[segments.length - 1]])
     for (const v of [...square(p0), ...square(p3)]) expect(Math.abs(v - Math.round(v)), `${board}`).toBeLessThan(1e-6);
  }
 });
 slow('keeps the strips asked for a motif whose sides cannot meet the cells beside it, hard to cut', () => {
  // On three strips until the strips asked for were kept before changing them (1ca80163).
  const { design, layout, hardToCut } = generate({ mode: 'figure', name: 'Gift', contours: gift.contours as Ring[], colors, style: 'squares', board: 5 });
  expect(design.gridSize).toEqual({ x: 5, y: 5 });
  expect(squareChoices(5)[layout!.alternative].board).toBe(5);
  expect(hardToCut).toBeDefined();
 });
 slow('lays the circle on a regular five-strip board, every square outside it equal', () => {
  for (const [name, motif] of Object.entries({ star, tree, cat, gift })) {
   const { design, hardToCut } = generate({ mode: 'figure', name, contours: motif.contours as Ring[], colors, style: 'board' });
   expect(design.gridSize, name).toEqual({ x: 5, y: 5 });
   expect(hardToCut, name).toBeUndefined();
   // Every cut leaves the paper edge along a line of the board, straight
   // across the paper or to the circle (unlike the santa heart's lines).
   const rect = inferOverlapRect(design.fingers, design.gridSize);
   const board = ({ x, y }: { x: number; y: number }) => [(x - rect.left) / rect.width * 5, (y - rect.top) / rect.height * 5];
   const lines = new Set<number>();
   for (const { segments } of design.fingers.filter(f => f.id.includes('cut')))
    for (const { p0, p3 } of [segments[0], segments[segments.length - 1]]) {
     const [a, b] = [board(p0), board(p3)], axis = Math.abs(a[0] - b[0]) < 1e-6 ? 0 : 1;
     expect(Math.abs(a[axis] - b[axis]), name).toBeLessThan(1e-6);
     expect(Math.abs(a[axis] - Math.round(a[axis])), name).toBeLessThan(1e-6);
     lines.add(Math.round(a[axis]) + 10 * axis);
    }
   expect(lines.size, name).toBe(8);
  }
 }, 30000);
 slow('divides an animal whose legs fall in separate panels, so it grows past the touching circle', () => {
  const result = generate({ mode: 'figure', name: 'Deer', contours: deer.contours as Ring[], colors, style: 'board', scale: .85 });
  // Kept at the size asked for: no smaller circle stands in.
  expect(result.scale).toBeUndefined();
  expect(result.hardToCut).toBeUndefined();
 }, 20000);
 it('grows the circle past 85% over the corner squares, every square still equal', () => {
  const { design, hardToCut, scale } = generate({ mode: 'figure', name: 'Star', contours: star.contours as Ring[], colors, style: 'board', scale: .93 });
  expect(hardToCut).toBeUndefined();
  expect(scale).toBeUndefined();
  expect(design.gridSize).toEqual({ x: 5, y: 5 });
  // Every cut still leaves the paper edge along a line of the board.
  const rect = inferOverlapRect(design.fingers, design.gridSize);
  const board = ({ x, y }: { x: number; y: number }) => [(x - rect.left) / rect.width * 5, (y - rect.top) / rect.height * 5];
  const lines = new Set<number>();
  for (const { segments } of design.fingers.filter(f => f.id.includes('cut')))
   for (const { p0, p3 } of [segments[0], segments[segments.length - 1]]) {
    const [a, b] = [board(p0), board(p3)], axis = Math.abs(a[0] - b[0]) < 1e-6 ? 0 : 1;
    expect(Math.abs(a[axis] - b[axis])).toBeLessThan(1e-6);
    expect(Math.abs(a[axis] - Math.round(a[axis]))).toBeLessThan(1e-6);
    lines.add(Math.round(a[axis]) + 10 * axis);
   }
  expect(lines.size).toBe(8);
  // The circle covers the outer ring's corner junctions: the corners of the
  // squares beside them take its colour, their far ends keep the other.
  const n = 400, mask = rasterizeDesign(design, n).data;
  const colour = (x: number, y: number) => mask[Math.floor(y / 100 * n) * n + Math.floor(x / 100 * n)], ground = colour(50, 5);
  for (const [x, y] of [[21, 19], [19, 21], [79, 19], [81, 21], [19, 79], [21, 81], [79, 81], [81, 79]])
   expect(colour(x, y), `${x} ${y}`).toBe(ground);
  for (const [x, y] of [[30, 3], [3, 30], [70, 3], [97, 30], [3, 70], [30, 97], [70, 97], [97, 70]])
   expect(colour(x, y), `${x} ${y}`).not.toBe(ground);
 });
 it('sets a motif that cuts cleanly so on its smallest enclosing circle in the largest circles', () => {
  // A house's roof and walls then reach equally far; a star keeps its box's
  // centre, which leaves its tips further from the circle's connections.
  const house = generate({ mode: 'figure', name: 'House', contours: houseMotif.contours as Ring[], colors, style: 'board', scale: 1 });
  expect(house.enclosed).toBe(true);
  expect(house.hardToCut).toBeUndefined();
  expect(generate({ mode: 'figure', name: 'Star', contours: star.contours as Ring[], colors, style: 'board', scale: .9 }).enclosed).toBeUndefined();
 });
 it('meets the paper\'s edges at 100%, its middle lines inside it', () => {
  // The paper cuts the circle off: the red squares beside the edges' middles
  // end where it meets the edges, and their middle lines leave no cut there.
  const { design, hardToCut } = generate({ mode: 'figure', name: 'House', contours: houseMotif.contours as Ring[], colors, style: 'board', scale: 1 });
  expect(hardToCut).toBeUndefined();
  const rect = inferOverlapRect(design.fingers, design.gridSize);
  const sheet = ({ x, y }: { x: number; y: number }) => [(x - rect.left) / rect.width * 100, (y - rect.top) / rect.height * 100];
  const ends = design.fingers.filter(f => f.id.includes('cut')).flatMap(({ segments }) => [segments[0].p0, segments.at(-1)!.p3]).map(sheet)
   .filter(p => p.some(v => Math.abs(v) < 1e-6 || Math.abs(v - 100) < 1e-6));
  const along = ends.map(p => Math.abs(p[0]) < 1e-6 || Math.abs(p[0] - 100) < 1e-6 ? p[1] : p[0]);
  // On every edge: the outer lines at 20 and 80, the circle's ends between.
  for (const v of [20, 80]) expect(along.filter(a => Math.abs(a - v) < 1e-6).length, `${v}`).toBe(4);
  expect(along.some(a => Math.abs(a - 40) < 1e-6 || Math.abs(a - 60) < 1e-6)).toBe(false);
  const inner = along.filter(a => a > 30 && a < 70);
  expect(inner.length).toBe(8);
  for (const a of inner) expect(Math.abs(a - 50), `${a}`).toBeCloseTo(Math.sqrt(52 ** 2 - 50 ** 2), 1);
 });
 it('brings the squares to points where the circle meets the paper\'s edges, not to stubs of line', () => {
  // On three strips a line would meet the circle 0.7 short of the edge at
  // 86%, and lies inside it at 100%, where it meets the edges halfway along
  // the corner squares; on five, the middle lines 0.3 short at 98%.
  expect(Math.sqrt(boardRadius(1, 3).radius ** 2 - 50 ** 2)).toBeCloseTo(100 / 3, 6);
  for (const [board, scale, outer] of [[3, .86, []], [3, 1, []], [5, .98, [20, 80]]] as const) {
   const { design, hardToCut } = generate({ mode: 'figure', name: 'House', contours: houseMotif.contours as Ring[], colors, style: 'board', board, scale });
   expect(hardToCut, `${board} ${scale}`).toBeUndefined();
   const rect = inferOverlapRect(design.fingers, design.gridSize);
   const sheet = ({ x, y }: { x: number; y: number }) => [(x - rect.left) / rect.width * 100, (y - rect.top) / rect.height * 100];
   const ends = design.fingers.filter(f => f.id.includes('cut')).flatMap(({ segments }) => [segments[0].p0, segments.at(-1)!.p3]).map(sheet)
    .filter(p => p.some(v => Math.abs(v) < 1e-6 || Math.abs(v - 100) < 1e-6));
   const along = ends.map(p => Math.abs(p[0]) < 1e-6 || Math.abs(p[0] - 100) < 1e-6 ? p[1] : p[0]);
   // The outer lines on five leave the edges as before; every other line
   // ends where the circle meets the edge.
   for (const v of outer) expect(along.filter(a => Math.abs(a - v) < 1e-6).length, `${board} ${scale} ${v}`).toBe(4);
   const inner = along.filter(a => !outer.some(v => Math.abs(a - v) < 1e-6));
   expect(inner.length, `${board} ${scale}`).toBe(8);
   for (const a of inner) expect(Math.abs(a - 50), `${board} ${scale} ${a}`).toBeCloseTo(Math.sqrt(boardRadius(scale, board).radius ** 2 - 50 ** 2), 1);
  }
 });
 it('grows the circle without jumps, on every board', () => {
  // From the smallest to the largest, the circle and the motif in it never
  // shrink, and the circle steps by little more than the step over the
  // corner junctions at 85-86% (0.8); on seven and nine strips but where it
  // steps on to just past the junctions where the heart weaves the circle's
  // edge its own way or leaves the middle lines out (see `boardRanges`):
  // three units on seven strips, and on nine, where none is found yet for
  // the circle reaching the outer lines or near their junctions with the
  // second and third, at most four and two thirds. The motif does not step there
  // with the circle, but grows on evenly (see `boardFill`).
  // Each step takes a percent of the slider, so on nine strips, with the most
  // ranges, the circle grows a little faster from one percent to the next.
  for (const [board, largest, step, growth] of [[3, boardRanges(3)[0][1], 0, 1.25], [5, 52, 0, 1.25], [7, boardRanges(7).at(-1)![1], 3.1, 1.25], [9, boardRanges(9).at(-1)![1], 4.7, 1.45]]) {
   const ranges = boardRanges(board), past = ranges.filter((range, i) => ranges[i - 1]?.[1] < range[0]
    && (boardRangePattern(range) || boardRangeLines(range, board).length < boardLines(board).length));
   let last = boardRadius(.45, board).radius;
   for (let percent = 46; percent <= 100; percent++) {
    const { radius } = boardRadius(percent / 100, board);
    expect(radius - last, `${board} ${percent}`).toBeGreaterThanOrEqual(0);
    expect(boardFill(radius, board) - boardFill(last, board), `${board} ${percent}`).toBeGreaterThanOrEqual(0);
    const onto = past.find(range => radius === range[0]);
    if (onto) {
     expect(last, `${board}`).toBeCloseTo(ranges[ranges.indexOf(onto) - 1][1], 9);
     expect(radius - last, `${board}`).toBeLessThan(step);
     expect(boardFill(radius, board) - boardFill(last, board), `${board} ${percent}`).toBeLessThan(2.5);
    } else expect(radius - last, `${board} ${percent}`).toBeLessThanOrEqual(growth);
    last = radius;
   }
   expect(last, `${board}`).toBe(largest);
  }
 });
 it('grows the circle on finer boards past the third lines, which follow it', () => {
  // On seven and nine strips the largest circles reach the third line a
  // side, which follows the circle while the middle lines of the other sheet
  // cross it to their gates, the motif still divided in four: the circle
  // grows from 36 to 39 on seven strips, from 28 to 30 on nine, and stops
  // where each gate keeps room for a cut either side of it.
  for (const [board, from] of [[7, 36], [9, 27.9]]) {
   const ranges = boardRanges(board), top = ranges[3], setting = boardSteps(board)[2][1] / 100;
   expect(top[0], `${board}`).toBeGreaterThan(from);
   expect(boardRangeLines(top, board), `${board}`).toEqual(boardLines(board));
   expect(boardRadius(setting, board).radius, `${board}`).toBeCloseTo(top[1], 9);
   const { design, hardToCut, scale } = generate({ mode: 'figure', name: 'House', contours: houseMotif.contours as Ring[], colors, style: 'board', board, scale: setting });
   expect(design.gridSize, `${board}`).toEqual({ x: board, y: board });
   expect(hardToCut, `${board}`).toBeUndefined();
   expect(scale, `${board}`).toBeUndefined();
   // The third line from the middle runs in from the paper's edge to the
   // circle and round it, out beyond the line where the circle bulges past.
   const rect = inferOverlapRect(design.fingers, design.gridSize);
   const sheet = ({ x, y }: { x: number; y: number }) => [(x - rect.left) / rect.width * 100, (y - rect.top) / rect.height * 100];
   const third = 50 - 250 / board, cut = design.fingers.filter(f => f.id.includes('cut')).find(({ segments }) =>
    [segments[0].p0, segments.at(-1)!.p3].map(sheet).some(([x, y]) => Math.abs(x - third) < 1e-6 && Math.abs(y) < 1e-6))!;
   expect(cut, `${board}`).toBeDefined();
   expect(Math.min(...cut.segments.map(({ p3 }) => sheet(p3)[0])), `${board}`).toBeLessThan(third - 2);
  }
 });
 it('weaves every line past the third lines\' junctions on seven and nine strips, every square equal', () => {
  // Past the junction of the third line out with the second, the circle's
  // edge switches sheet at points of its own, joined in pairs by hidden cuts
  // across the circle or round the red squares beside it (see
  // `completionLegs`): the heart keeps all seven strips a side, equal, up to
  // 91%. Nine strips short of their outer lines take the same, up to 88%.
  for (const board of [7, 9]) {
   const range = boardRanges(board).find(r => boardRangePattern(r))!, lines = boardLines(board), setting = boardSetting((range[0] + range[1]) / 2, board);
   expect(range[0], `${board}`).toBeGreaterThan(Math.hypot(lines[2], lines[1]));
   expect(boardRangeLines(range, board), `${board}`).toEqual(lines);
   expect(boardRadius(setting, board).range, `${board}`).toBe(range);
   const { design, hardToCut, scale } = generate({ mode: 'figure', name: 'House', contours: houseMotif.contours as Ring[], colors, style: 'board', board, scale: setting });
   expect(design.gridSize, `${board}`).toEqual({ x: board, y: board });
   expect(hardToCut, `${board}`).toBeUndefined();
   expect(scale, `${board}`).toBeUndefined();
  }
 });
 it('weaves every line of nine strips past the outer lines\' junctions with the middle ones, every square equal', () => {
  // Past the junctions at 39.3, a completion whose cuts across the circle
  // reach past one chain to the next keeps all nine strips a side.
  const range = boardRanges(9).find(r => boardRangePattern(r) && r[0] > Math.hypot(boardLines(9)[3], boardLines(9)[0]))!;
  expect(range[1]).toBeLessThan(Math.hypot(boardLines(9)[3], boardLines(9)[1]));
  for (const setting of [boardSetting(range[0], 9), boardSetting(range[1], 9)]) {
   const { design, hardToCut, scale } = generate({ mode: 'figure', name: 'House', contours: houseMotif.contours as Ring[], colors, style: 'board', board: 9, scale: setting });
   expect(design.gridSize, `${setting}`).toEqual({ x: 9, y: 9 });
   expect(hardToCut, `${setting}`).toBeUndefined();
   expect(scale, `${setting}`).toBeUndefined();
  }
 });
 it('weaves every line of nine strips just short of the outer lines and past their junctions with the second', () => {
  // Completions with the fewest switch points the crossings allow carry the
  // circle on short of the outer lines and past their junctions with the
  // second lines, their cuts across the circle nested so deep that the
  // motif's gates sit just outside it.
  const lines = boardLines(9);
  for (const radius of [36.5, Math.hypot(lines[3], lines[1]) + .5]) {
   const range = boardRanges(9).find(r => r[0] <= radius && radius <= r[1])!;
   expect(boardRangePattern(range)?.gates, `${radius}`).toBeDefined();
   const { design, hardToCut, scale } = generate({ mode: 'figure', name: 'House', contours: houseMotif.contours as Ring[], colors, style: 'board', board: 9, scale: boardSetting(radius, 9) });
   expect(design.gridSize, `${radius}`).toEqual({ x: 9, y: 9 });
   expect(hardToCut, `${radius}`).toBeUndefined();
   expect(scale, `${radius}`).toBeUndefined();
  }
 });
 it('reaches past the paper\'s edges on finer boards, leaving out the middle lines it covers', () => {
  // Once the circle covers the middle lines from edge to edge they show
  // nothing: the heart leaves them out, and the circle reaches past the
  // paper's edges as on five strips, the outer two lines a side meeting it
  // there, the motif still divided in four. The page still shows the board
  // chosen.
  for (const board of [7, 9]) {
   const ranges = boardRanges(board), range = ranges.at(-1)!, lines = boardLines(board);
   expect(boardRangeLines(range, board), `${board}`).toEqual(lines.slice(-2));
   expect(range[0], `${board}`).toBeGreaterThan(Math.hypot(lines.at(-3)!, 50));
   expect(boardRadius(1, board).radius, `${board}`).toBeGreaterThan(54);
   const result = generate({ mode: 'figure', name: 'House', contours: houseMotif.contours as Ring[], colors, style: 'board', board, scale: 1 });
   expect(result.scale, `${board}`).toBeUndefined();
   expect(result.board, `${board}`).toBe(board);
   expect(result.design.gridSize, `${board}`).toEqual({ x: 5, y: 5 });
   // Every cut reaching the paper's edge does so on one of the outer two
   // lines a side, or where the circle meets that edge.
   const rect = inferOverlapRect(result.design.fingers, result.design.gridSize);
   const sheet = ({ x, y }: { x: number; y: number }) => [(x - rect.left) / rect.width * 100, (y - rect.top) / rect.height * 100];
   const meets = Math.sqrt(boardRadius(1, board).radius ** 2 - 50 ** 2);
   for (const { segments } of result.design.fingers.filter(f => f.id.includes('cut')))
    for (const [x, y] of [segments[0].p0, segments.at(-1)!.p3].map(sheet)) {
     const along = Math.abs(x) < 1e-6 || Math.abs(x - 100) < 1e-6 ? y : Math.abs(y) < 1e-6 || Math.abs(y - 100) < 1e-6 ? x : undefined;
     if (along === undefined) continue;
     const off = Math.abs(along - 50);
     expect(lines.slice(-2).some(d => Math.abs(off - d) < 1e-6) || Math.abs(off - meets) < .1, `${board} ${along}`).toBe(true);
    }
  }
 });
 it('lays the circle on the strips the visitor chooses, every square equal', () => {
  const state = { ...defaults, mode: 'figure' as const, style: 'board' as const };
  expect([3, 4, 7, 9, 11].map(board => stripCount({ ...state, board }))).toEqual([3, 3, 7, 9, 9]);
  expect(stripCount(state)).toBeUndefined();
  for (const board of [3, 7, 9]) {
   const { design, hardToCut, scale } = generate({ mode: 'figure', name: 'Star', contours: star.contours as Ring[], colors, style: 'board', board });
   expect(design.gridSize, `${board}`).toEqual({ x: board, y: board });
   expect(hardToCut, `${board}`).toBeUndefined();
   expect(scale, `${board}`).toBeUndefined();
   // Every cut leaves the paper edge along a line of the board.
   const rect = inferOverlapRect(design.fingers, design.gridSize);
   const square = ({ x, y }: { x: number; y: number }) => [(x - rect.left) / rect.width * board, (y - rect.top) / rect.height * board];
   const lines = new Set<number>();
   for (const { segments } of design.fingers.filter(f => f.id.includes('cut')))
    for (const { p0, p3 } of [segments[0], segments[segments.length - 1]]) {
     const [a, b] = [square(p0), square(p3)], axis = Math.abs(a[0] - b[0]) < 1e-6 ? 0 : 1;
     expect(Math.abs(a[axis] - b[axis]), `${board}`).toBeLessThan(1e-6);
     expect(Math.abs(a[axis] - Math.round(a[axis])), `${board}`).toBeLessThan(1e-6);
     lines.add(Math.round(a[axis]) + 10 * axis);
    }
   expect(lines.size, `${board}`).toBe(2 * (board - 1));
  }
 });
 slow('runs a spoke past the circle\'s switch point across to it rather than back round', () => {
  // On seven strips at 88% the star's upper right gate lies past the switch
  // point its spoke leads to; round to it, the spoke turned back on the
  // motif's own cut to the gate in a needle.
  const { hardToCut, scale } = generate({ mode: 'figure', name: 'Star', contours: star.contours as Ring[], colors, style: 'board', board: 7, scale: .88 });
  expect(hardToCut).toBeUndefined();
  expect(scale).toBeUndefined();
 });
 it('bends a figure\'s shared cuts where they meet the motif in a sharp tip of paper, in every frame', () => {
  // On the rays frame the star's spokes met one of its points under 30°.
  const { design, hardToCut } = generate({ mode: 'figure', name: 'Star', contours: star.contours as Ring[], colors, style: 'rays', scale: .7 });
  expect(hardToCut).toBeUndefined();
  expect(cutTipCounts(design)[0]).toBe(0);
 });
 it('bends a board heart\'s shared cuts where they meet the motif in a sharp tip of paper', () => {
  // Divided in four on seven strips, the heart's seams and spokes met its
  // outline in four tips under 30° and six more under 45°.
  const { design, hardToCut } = generate({ mode: 'figure', name: 'Heart', contours: heart.contours as Ring[], colors, style: 'board', board: 7, scale: .72 });
  expect(hardToCut).toBeUndefined();
  expect(cutTipCounts(design)).toEqual([0, 0]);
 });
 it('bends a figure\'s shared cuts tip by tip where bending them all at once would cut too near', () => {
  // The candy cane in the rays, built by a retry (a nested construction):
  // bent all at once its cuts came too near each other, so it kept seven
  // needles and eight sharp tips; bent tip by tip, five of each. Its stripes
  // entered where they come nearest, its first way, keep one sharp tip.
  const { design, hardToCut, recipe } = generate({ mode: 'figure', name: 'Candy cane', contours: candyCane.contours as Ring[], colors, style: 'rays', scale: .7, gap: 3 });
  expect(hardToCut).toBeUndefined();
  expect(recipe).toBe('nested');
  expect(cutTipCounts(design)).toEqual([0, 1]);
 });
 it('joins the candy cane\'s stripes where they come nearest, not along their sides', () => {
  // In the checked tips at 90% each stripe was entered and left at its
  // extremes along the chain: the cuts between them ran along the stripes'
  // slanted sides, six needles.
  const { design, hardToCut } = generate({ mode: 'figure', name: 'Candy cane', contours: candyCane.contours as Ring[], colors, style: 'corners', frame: 'circle', frameSize: 70, scale: .9, gap: 3 });
  expect(hardToCut).toBeUndefined();
  expect(cutTipCounts(design)).toEqual([0, 3]);
 });
 slow('narrows a sunburst\'s crown where its motif crowds the largest circle', () => {
  // At 82% the frame has reached the largest the outer strips have room for,
  // and the circle at four fifths of it met the candy: hard to cut. Its
  // crown narrowed, the circle a little more of the frame, it cuts cleanly.
  const { hardToCut, scale } = generate({ mode: 'figure', name: 'Candy', contours: candy.contours as Ring[], colors, style: 'sunburst', frame: 'circle', frameSize: 70, scale: .82, gap: 3 });
  expect(hardToCut).toBeUndefined();
  expect(scale).toBeUndefined();
 });
 it('keeps a panel\'s gate off a seam through the motif\'s point', () => {
  // On nine strips at 100% the seams cross beside the star's centre, one
  // through its top point, where the top panels' gates would meet it.
  const { hardToCut, scale } = generate({ mode: 'figure', name: 'Star', contours: star.contours as Ring[], colors, style: 'board', board: 9, scale: 1 });
  expect(hardToCut).toBeUndefined();
  expect(scale).toBeUndefined();
 });
 slow('bends the seams of a motif divided in four where they meet it in a narrow point, rather than calling it hard to cut', () => {
  // The dove's seams meet its outline at a narrow angle; straight, every
  // division leaves a sharp tip of paper there.
  const { hardToCut, scale } = generate({ mode: 'figure', name: 'Dove', contours: dove.contours as Ring[], colors, style: 'board', scale: .72 });
  expect(hardToCut).toBeUndefined();
  expect(scale).toBeUndefined();
 });
 slow('keeps the circle the size asks for with much space around the motif, the motif smaller', () => {
  // Space decides how much of the circle the motif fills, not whether it can
  // be divided in four, so the circle no longer falls back to 70%.
  const result = generate({ mode: 'figure', name: 'Deer', contours: deer.contours as Ring[], colors, style: 'board', scale: 1, gap: 14 });
  expect(result.scale).toBeUndefined();
  expect(result.hardToCut).toBeUndefined();
 }, 20000);
 slow('takes an animal over the corner squares to 100%', () => {
  const result = generate({ mode: 'figure', name: 'Deer', contours: deer.contours as Ring[], colors, style: 'board', scale: 1 });
  expect(result.scale).toBeUndefined();
  expect(result.hardToCut).toBeUndefined();
 }, 20000);
 slow('keeps the space asked for, so a circle only grows with it', () => {
  // A circle that could be cut cleanly further out stays where the space puts
  // it, hard to cut if need be, rather than jumping out as the slider moves.
  const radius = (gap: number) => {
   const { design } = generate({ mode: 'figure', name: 'Cookie', contours: cookie.contours as Ring[], colors, style: 'rays', scale: .7, gap });
   const rect = inferOverlapRect(design.fingers, design.gridSize);
   const sheet = ({ x, y }: { x: number; y: number }) => [(x - rect.left) / rect.width * 100, (y - rect.top) / rect.height * 100];
   // The rays run in from the paper's edges to the circle.
   return Math.min(...design.fingers.filter(f => f.id.includes('cut')).flatMap(({ segments }) => [segments[0], segments.at(-1)!])
    .map(({ p0, p3 }) => [sheet(p0), sheet(p3)]).filter(([a]) => a.some(v => Math.abs(v) < 1e-6 || Math.abs(v - 100) < 1e-6))
    .map(([, b]) => Math.hypot(b[0] - 50, b[1] - 50)));
  };
  const [none, some, more] = [0, 3, 6].map(radius);
  expect(none).toBeLessThanOrEqual(some + 1e-6);
  expect(some).toBeLessThan(more);
 }, 60000);
 slow('keeps a motif on equal squares on the board its default size chose', () => {
  const heart = (scale: number) => generate({ mode: 'figure', name: 'Gift', contours: gift.contours as Ring[], colors, style: 'squares', scale });
  const chosen = heart(.7);
  expect(chosen.design.gridSize).toEqual({ x: 3, y: 3 });
  for (const scale of [.75, .8]) {
   const { design, layout } = heart(scale);
   expect(layout, `${scale}`).toEqual(chosen.layout);
   expect(design.gridSize, `${scale}`).toEqual({ x: 3, y: 3 });
  }
 }, 60000);
 slow('grows the board\'s circle and its motif steadily with the size, never refusing', () => {
  // Through the touching circle at 70%, where the construction changes, and
  // over the corner squares past 85%, the circle and the motif only grow;
  // sizes that cannot be cut cleanly are hard.
  for (const [name, motif] of Object.entries({ star, cookie })) {
   let last = [0, 0];
   for (const scale of [.6, .66, .7, .71, .72, .73, .76, .8, .85, .86, .9, .95, 1]) {
    const { design } = generate({ mode: 'figure', name, contours: motif.contours as Ring[], colors, style: 'board', scale, gap: 3 });
    const rect = inferOverlapRect(design.fingers, design.gridSize);
    // Where the board's second line from the left leaves the top edge, it
    // runs down to the circle; once the circle meets the paper's edges, the
    // first line does.
    const leaving = (x: number) => design.fingers.find(f => f.id.includes('cut') && [f.segments[0].p0, f.segments.at(-1)!.p3].some(p =>
     Math.abs((p.x - rect.left) / rect.width - x) < 1e-6 && Math.abs(p.y - rect.top) < 1e-6));
    const second = leaving(.4), line = second ?? leaving(.2)!;
    const top = (p: { y: number }) => Math.abs(p.y - rect.top) < 1e-6;
    const segment = top(line.segments[0].p0) ? line.segments[0] : line.segments.at(-1)!;
    const radius = Math.hypot(second ? 10 : 30, 50 - ((top(segment.p0) ? segment.p3 : segment.p0).y - rect.top) / rect.height * 100);
    // The motif's colour within the circle's band of background.
    const n = 200, mask = rasterizeDesign(design, n).data, ground = mask[Math.round((51 - radius) / 100 * n) * n + n / 2];
    let area = 0;
    for (let y = 0; y < n; y++) for (let x = 0; x < n; x++)
     if (Math.hypot((x + .5) / n * 100 - 50, (y + .5) / n * 100 - 50) < radius - 1.5 && mask[y * n + x] !== ground) area++;
    expect(radius, `${name} ${scale}`).toBeGreaterThan(last[0] - .05);
    expect(area, `${name} ${scale}`).toBeGreaterThanOrEqual(last[1]);
    last = [radius, area];
   }
  }
 }, 120000);
 // The woven picture against the plain board: where the squares swapped colour.
 const swapped = (design: Parameters<typeof rasterizeDesign>[0], n = 200) => {
  const mask = rasterizeDesign(design, n).data, cell = n / design.gridSize.x;
  const plain = (x: number, y: number) => (Math.floor(x / cell) + Math.floor(y / cell)) % 2 ^ mask[2 * n + 2];
  let area = 0, x0 = n, x1 = 0, y0 = n, y1 = 0, point = 0;
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++)
   if (mask[y * n + x] !== plain(x, y)) {
    area++;
    [x0, x1, y0, y1] = [Math.min(x0, x), Math.max(x1, x), Math.min(y0, y), Math.max(y1, y)];
    point = Math.max(point, (x + y) / n * 100);
   }
  // `point`: how far towards the heart's point the motif reaches, as x + y in
  // the paper's square; the lowest check starts at 150, the point is 200.
  return { area: area / n / n, centre: [(x0 + x1) / 2 / n * 100, (y0 + y1) / 2 / n * 100], point, corners: [[2, 2], [n - 3, 2], [2, n - 3], [n - 3, n - 3]].every(([x, y]) => mask[y * n + x] === plain(x, y)) };
 };
 it('swaps the squares of a regular four-strip board inside the motif', () => {
  for (const [name, motif] of Object.entries({ star, tree })) {
   const { design, hardToCut } = generate({ mode: 'figure', name, contours: motif.contours as Ring[], colors, style: 'strips' });
   expect(design.gridSize, name).toEqual({ x: 4, y: 4 });
   expect(hardToCut, name).toBeUndefined();
   // The board's own checks away from the motif, the motif near the middle.
   const { area, centre, corners } = swapped(design);
   expect(corners, name).toBe(true);
   expect(area, name).toBeGreaterThan(.12);
   expect(area, name).toBeLessThan(.45);
   for (const v of centre) expect(Math.abs(v - 50), name).toBeLessThan(10);
   // Every cut leaves the paper edge along a line of the board.
   const rect = inferOverlapRect(design.fingers, design.gridSize);
   for (const { segments } of design.fingers.filter(f => f.id.includes('cut')))
    for (const { x, y } of [segments[0].p0, segments.at(-1)!.p3]) {
     const [u, v] = [(x - rect.left) / rect.width * 4, (y - rect.top) / rect.height * 4];
     expect(Math.min(Math.abs(u - Math.round(u)), Math.abs(v - Math.round(v))), name).toBeLessThan(1e-6);
    }
  }
 }, 30000);
 it('grows the motif in the checks in its place, and above the default size slides it along the middle', () => {
  // The default size's place on the board is kept below it, so the motif does
  // not jump; above it the motif slides on along the heart's middle, x = y.
  const figure = (scale: number) => swapped(generate({ mode: 'figure', name: 'Star', contours: star.contours as Ring[], colors, style: 'strips', scale }).design);
  const [small, middle, large] = [.6, .7, .8].map(figure);
  expect(small.area).toBeLessThan(middle.area);
  expect(middle.area).toBeLessThan(large.area);
  for (const axis of [0, 1]) expect(Math.abs(small.centre[axis] - middle.centre[axis])).toBeLessThan(2);
  expect(Math.abs(large.centre[0] - large.centre[1])).toBeLessThan(1);
  expect(Math.abs(large.centre[0] - middle.centre[0])).toBeLessThan(6);
 }, 30000);
 it('drops a heart\'s point into the lowest check at full size', () => {
  // Fitted to the paper's diamond as it is, the heart moves down to where it
  // fits largest, rather than staying as high as its widest part allows.
  const reach = (scale: number) => swapped(generate({ mode: 'figure', name: 'Heart', contours: heart.contours as Ring[], colors, style: 'strips', scale }).design);
  const [middle, full] = [.7, 1].map(reach);
  expect(middle.point).toBeLessThan(150);
  expect(full.point).toBeGreaterThan(180);
  expect(full.area).toBeGreaterThan(middle.area);
 }, 30000);
 it('reaches every piece of a motif kept whole that the usual spokes cannot', () => {
  // Three pieces in a row meet the gates at the middle one, not the largest
  // (`bases`); islands in a ring's hole are reached round either attachment
  // (`nested`); a back card hiding the front one from two gates is passed
  // round its end, and the polar star's needles, each as near two gates,
  // take one gate each going round (`around`). The board circle refused all
  // four.
  const cell = (motif: { contours: unknown }, layout: object) => () => generateTextGrid(MOTIF, { glyphs: { [MOTIF]: { advance: 1, contours: normalizeContours(motif.contours as Ring[]) } } },
   false, 'circle', { padding: .22, ...layout, board: 5, circle: 50, scale: 40 });
  for (const [motif, layout] of [[columnsPlus, { bases: true }], [peace, { nested: true }], [copyPlus, { around: true }], [polarStar, { around: true }]] as const) {
   expect(cell(motif, {}), JSON.stringify(layout)).toThrow(ConstructionError);
   expect(cell(motif, layout)().edges.length, JSON.stringify(layout)).toBeGreaterThan(0);
  }
 });
 it('moves a seam that would run through a corner of the motif beside it', () => {
  // The star's top tip lies nearly on the seam through its centre, which
  // then cannot be built, and the seam through its lower notch halves the
  // tip into slivers: moved a fiftieth of the motif beside the tip, the seam
  // cuts cleanly.
  for (const [board, scale] of [[9, .8], [5, 1]])
   expect(generate({ mode: 'figure', name: 'Star', contours: star.contours as Ring[], colors, style: 'board', board, scale }).hardToCut, `${board} ${scale}`).toBeUndefined();
 });
 it('keeps a motif that cannot be divided whole past the touching circle, and says how far it went', () => {
  // A solid motif has no background point for four panels to meet at: it
  // stays whole, the outer lines following the circle, until its gates near
  // the corner junctions; past them a completion about the whole motif
  // carries the circle on, every line kept (see `WHOLE_PATTERNS`), and above
  // that it keeps the largest circle; the star's points leave a point to
  // divide it at.
  const board = (motif: { contours: unknown }, scale: number) => generate({ mode: 'figure', name: 'Motif', contours: motif.contours as Ring[], colors, style: 'board', scale });
  const at80 = board(tree, .8), at90 = board(tree, .9), top = boardSetting(boardWholeRadius(60, 5), 5);
  expect(at80.scale).toBeUndefined();
  expect(at80.whole).toBe(true);
  expect(at80.hardToCut).toBeUndefined();
  expect(boardSetting(boardWholeTop(5), 5)).toBeLessThan(.9);
  expect(at90.scale).toBeUndefined();
  expect(at90.whole).toBe(true);
  expect(at90.hardToCut).toBeUndefined();
  expect(at90.design.gridSize).toEqual({ x: 5, y: 5 });
  expect(top).toBeGreaterThan(.9);
  expect(board(tree, 1).scale).toBe(top);
  // The largest circle's setting gives that circle back, also where it ends
  // in a step between two of the slider's ranges (seven strips).
  for (const strips of [5, 7, 9]) {
   const largest = boardWholeRadius(60, strips);
   expect(boardWholeRadius(boardRadius(boardSetting(largest, strips), strips).radius, strips), `${strips}`).toBeCloseTo(largest);
  }
  expect(board(star, .8).scale).toBeUndefined();
  expect(board(star, .8).whole).toBeUndefined();
  expect(board(tree, .6).scale).toBeUndefined();
 });
 it('lays the figure in the checks on boards of three to six strips', () => {
  for (const strips of [3, 5, 6]) {
   const { design } = generate({ mode: 'figure', name: 'Heart', contours: heart.contours as Ring[], colors, style: 'strips', board: strips });
   expect(design.gridSize, `${strips}`).toEqual({ x: strips, y: strips });
   expect(swapped(design).corners, `${strips}`).toBe(true);
  }
 }, 30000);
 slow('keeps the figure in the checks on the three strips asked, hard to cut', () => {
  // The polar star, quickly. The snowflake stays on three too since hidden cuts
  // that only come too close are kept as a last resort (78eb9654; it took four
  // before), but takes five seconds.
  const { design, hardToCut } = generate({ mode: 'figure', name: 'Polar star', contours: polarStar.contours as Ring[], colors, style: 'strips', board: 3 });
  expect(design.gridSize).toEqual({ x: 3, y: 3 });
  expect(hardToCut).toBeDefined();
 });
 it('reaches a counter alone in its square by its shortest hidden cuts', () => {
  // The cuts from their faces' sides leave islands of the bicycle fewer than
  // two; with the shortest ways to them too, it cuts cleanly, where it was
  // hard to cut.
  const { design, hardToCut } = generate({ mode: 'figure', name: 'Bicycle', contours: bicycle.contours as Ring[], colors, style: 'strips' });
  expect(design.gridSize).toEqual({ x: 4, y: 4 });
  expect(hardToCut).toBeUndefined();
 });
 slow('keeps a snowflake in the checks at a size its strips can have, rather than refusing', () => {
  // At 75% no sheets keep every strip whole at the snowflake's place; it
  // keeps a size a little below that it can have there.
  const area = (scale: number) => swapped(generate({ mode: 'figure', name: 'Snow', contours: snow.contours as Ring[], colors, style: 'strips', scale }).design).area;
  expect(area(.75)).toBeGreaterThanOrEqual(area(.7));
 }, 30000);
 slow('lets the figure in the checks grow to the paper\'s edge, like the frames with room for it', () => {
  const state = { ...defaults, mode: 'figure' as const, style: 'strips' as const, scale: 100 };
  const link = (s: typeof state | (Omit<typeof state, 'style'> & { style: 'rays' | 'silhouette' })) => '#make=' + encodeURIComponent(JSON.stringify(s));
  expect(readGeneratorState(link(state)).scale).toBe(100);
  expect(readGeneratorState(link({ ...state, style: 'rays' })).scale).toBe(100);
  // The silhouette fills the square at 85% already.
  expect(readGeneratorState(link({ ...state, style: 'silhouette' })).scale).toBe(85);
  const area = (scale: number) => swapped(generate({ mode: 'figure', name: 'Star', contours: star.contours as Ring[], colors, style: 'strips', scale }).design).area;
  expect(area(1)).toBeGreaterThan(area(.85));
 }, 30000);
 slow('keeps a fitted fish a little smaller at 100% rather than refusing it, and says so', () => {
  // Nothing can be built at 100%; 97% can.
  const { design, scale } = generate({ mode: 'figure', name: 'Fish', contours: fish.contours as Ring[], colors, style: 'fitted', scale: 1 });
  expect(design.gridSize.x).toBeGreaterThanOrEqual(4);
  expect(scale).toBe(.97);
 }, 30000);
 slow('shows one small motif alone where no pattern of copies connects, rather than refusing', () => {
  const { design, layout } = generate({ mode: 'figure', name: 'Butterfly', contours: butterflyMotif.contours as Ring[], colors, style: 'motifs' });
  expect(design.gridSize).toEqual({ x: 3, y: 3 });
  expect(motifChoices()[layout!.alternative].alone).toBe(true);
 }, 30000);
 it('enters islands too close for hidden chains along visible spokes, as a last resort', () => {
  // The paw's toes route in a woven square only along visible spokes.
  const font = { glyphs: { [MOTIF]: { advance: 1, contours: paw.contours as Ring[] } } };
  const cell = () => generateTextGrid(MOTIF, font, false, undefined, { board: 3 });
  expect(cell).toThrow(ConstructionError);
  expect(withVisibleIslands(cell).edges.length).toBeGreaterThan(0);
 });
 slow('weaves islands too close for hidden chains along visible spokes, hard to cut rather than refused', () => {
  // The sun's rays route only along visible spokes; nothing else does.
  const { design, hardToCut } = generate({ mode: 'figure', name: 'Sun', contours: sun.contours as Ring[], colors, style: 'board' });
  expect(design.gridSize).toEqual({ x: 5, y: 5 });
  expect(hardToCut).toBeDefined();
 });
 slow('keeps equal squares, hard to cut, rather than fitting cells to the sun', () => {
  // Its rays route only along visible spokes; fitted cells cut cleanly but
  // leave the squares unequal.
  const { design, hardToCut, layout } = generate({ mode: 'figure', name: 'Sun', contours: sun.contours as Ring[], colors, style: 'squares' });
  expect(design.gridSize).toEqual({ x: 3, y: 3 });
  expect(hardToCut).toBeDefined();
  expect(squareChoices()[layout!.alternative].fitted).toBeFalsy();
 });
 slow('lays the paw on equal squares, its toes entered along visible spokes', () => {
  const { design, hardToCut } = generate({ mode: 'figure', name: 'Paw', contours: paw.contours as Ring[], colors, style: 'squares' });
  expect(design.gridSize).toEqual({ x: 3, y: 3 });
  expect(hardToCut).toBeDefined();
 }, 30000);
 slow('weaves outlines that touch into the checks', () => {
  // The bicycle's wheels touch its frame at single points.
  const { design } = generate({ mode: 'figure', name: 'Bicycle', contours: bicycle.contours as Ring[], colors, style: 'strips' });
  expect(design.gridSize).toEqual({ x: 4, y: 4 });
  expect(swapped(design).corners).toBe(true);
 }, 30000);
 for (const style of ['wedges', 'silhouette', 'motifs', 'squares', 'board', 'strips'] as const)
  it(`shares ${style} as one complete frame selection`, () => {
   const state = { ...defaults, mode: 'figure' as const, style };
   expect(readGeneratorState('#make=' + encodeURIComponent(JSON.stringify(state)))).toEqual(state);
   expect(templateVariants(state).find(v => v.state.style === style)?.state).toEqual(state);
  });
 it('recomputes the new frames only for the settings they use', () => {
  const state = { ...defaults, mode: 'figure' as const };
  // Every frame takes the motif's size, and all but the board frames the space
  // around it. The hidden frame size remains the motif size's base in links.
  for (const [style, size, scale, spacing] of [['motifs', false, true, false], ['squares', false, true, false], ['board', true, true, true],
   ['silhouette', false, true, true], ['wedges', true, true, true], ['fitted', true, true, true], ['corners', true, true, true],
   ['rays', true, true, true], ['sunburst', true, true, true], ['strips', false, true, false]] as const) {
   const key = geometryKey({ ...state, style });
   expect(geometryKey({ ...state, style, frameSize: 55 }) !== key).toBe(size);
   expect(geometryKey({ ...state, style, scale: 50 }) !== key).toBe(scale);
   expect(geometryKey({ ...state, style, spacing: 9 }) !== key, style).toBe(spacing);
   expect(frameGap({ ...state, style, spacing: 9 }), style).toBe(spacing ? 9 : undefined);
   // The frames on a board have a number of strips to choose: the figure in
   // the checks its own, the small motifs, equal squares and the circle on
   // them the visitor's.
   const field = style === 'strips' ? 'strips' : 'board', board = ['strips', 'motifs', 'squares', 'board'].includes(style);
   expect(geometryKey({ ...state, style, [field]: 5 }) !== key, style).toBe(board);
   expect(stripCount({ ...state, style, [field]: 5 }), style).toBe(board ? 5 : undefined);
  }
  expect(readGeneratorState('#make=' + JSON.stringify({ ...state, spacing: 40 })).spacing).toBe(15);
  // Each takes the strips it offers, the nearest below: the equal squares an
  // odd number.
  const strips = (style: 'strips' | 'motifs' | 'squares', n: number) =>
   stripCount(readGeneratorState('#make=' + JSON.stringify({ ...state, style, [style === 'strips' ? 'strips' : 'board']: n })));
  expect([strips('strips', 9), strips('strips', 2), strips('motifs', 1), strips('motifs', 12), strips('squares', 4), strips('squares', 8)])
   .toEqual([6, 3, 2, 8, 3, 7]);
  // Until the visitor chooses, the small motifs and equal squares choose
  // their own; the strips in every older link are the figure in the checks'.
  expect(stripCount({ ...state, style: 'motifs', strips: 6 })).toBeUndefined();
  expect(geometryKey({ ...state, style: 'squares', strips: 6 })).toBe(geometryKey({ ...state, style: 'squares' }));
  // Where the visitor dragged the figure in the checks: kept in links, in
  // eighths, on the paper, and only in that frame's key.
  const placed = { ...state, style: 'strips' as const, place: 7.6 };
  expect(readGeneratorState('#make=' + JSON.stringify(placed)).place).toBe(7.625);
  expect(readGeneratorState('#make=' + JSON.stringify({ ...placed, place: -99 })).place).toBe(-66);
  expect(readGeneratorState('#make=' + JSON.stringify({ ...state, style: 'strips' })).place).toBeUndefined();
  expect(geometryKey(placed) !== geometryKey({ ...placed, place: undefined })).toBe(true);
  expect(geometryKey({ ...placed, style: 'rays' }) === geometryKey({ ...placed, style: 'rays', place: undefined })).toBe(true);
  expect(stripPlace({ ...placed, style: 'rays' })).toBeUndefined();
  // And across the heart's middle, with a place to move across from.
  const aside = { ...placed, side: -4.1 };
  expect(readGeneratorState('#make=' + JSON.stringify(aside)).side).toBe(-4.125);
  expect(readGeneratorState('#make=' + JSON.stringify({ ...aside, place: undefined })).side).toBeUndefined();
  expect(geometryKey(aside) !== geometryKey(placed)).toBe(true);
  expect(stripSide(aside)).toBe(-4.1);
  expect(stripSide({ ...aside, style: 'rays' })).toBeUndefined();
 });
 it('draws the circle the space the visitor sets outside the motif, which keeps its size', () => {
  const request = { mode: 'figure' as const, name: 'Star', contours: star.contours as Ring[], colors, style: 'rays' as const };
  const circle = (gap: number, scale = .7) => fitCircle({ ...request, scale, gap });
  const reach = Math.max(...(star.contours as Ring[]).flat().map(([x, y]) => Math.hypot(x, y)));
  // Within the frame sizes the outer strips have room for (50–80).
  for (const [gap, scale] of [[3, .7], [10, .7], [6, .6]]) {
   const { frameSize, scale: inside } = circle(gap, scale);
   expect(frameSize! * inside!).toBeCloseTo(70 * scale);
   expect(frameSize! / 2 - 70 * scale * reach).toBeCloseTo(gap);
  }
  // The sunburst's circle is four fifths of its frame.
  const burst = fitCircle({ ...request, style: 'sunburst', gap: 3 });
  expect(burst.frameSize! * .8 / 2 - 70 * .7 * reach).toBeCloseTo(3);
  // Without a space the circle keeps the frame's own size.
  expect(fitCircle(request)).toBe(request);
  const { design, hardToCut } = generate({ ...request, gap: 10 });
  expect(hardToCut).toBeUndefined();
  expect(design.gridSize).toEqual({ x: 3, y: 3 });
 }, 20000);
 it('grows a motif the medallion cannot hold at 100% to the largest it holds, smoothly', () => {
  // The gift's corners reach past the largest circle (80) long before 100%.
  const request = { mode: 'figure' as const, name: 'Gift', contours: gift.contours as Ring[], colors, style: 'layers' as const, gap: 3 };
  const reach = Math.max(...(gift.contours as Ring[]).flat().map(([x, y]) => Math.hypot(x, y)));
  const size = (scale: number) => { const fitted = fitCircle({ ...request, scale }); return fitted.frameSize! * fitted.scale!; };
  expect(size(.7)).toBeCloseTo(49);
  expect(80 / 2 - size(1) * reach).toBeCloseTo(1.5);
  for (const scale of [.75, .8, .85, .9, .95, 1]) expect(size(scale)).toBeGreaterThan(size(scale - .05));
  const { scale, design } = generate({ ...request, scale: 1 });
  expect(scale).toBeUndefined();
  expect(design.gridSize).toEqual({ x: 7, y: 7 });
 });
 it('sizes the motif on a board frame by the visitor\'s size', () => {
  for (const style of ['squares', 'motifs', 'board'] as const) {
   const ink = (scale: number) => {
    const { design } = generate({ mode: 'figure', name: 'Star', contours: star.contours as Ring[], colors, style, scale });
    return rasterizeDesign(design, 120).data.reduce((sum, v) => sum + v, 0);
   };
   // The motif's colour covers less of the heart when it is smaller.
   expect(Math.abs(ink(.55) - ink(.85)), style).toBeGreaterThan(50);
  }
 }, 60000);
 it('leaves the space around the motif that the visitor sets, in the wedges and the silhouette', () => {
  // The legs move toward the paper's corners: the wedges get shorter and the
  // silhouette's corner checks smaller, as in the gallery's simple five-point star.
  for (const [style, scale] of [['silhouette', .65], ['wedges', .7], ['corners', .7], ['fitted', .6]] as const) {
   const reach = (gap: number) => {
    const { design, hardToCut } = generate({ mode: 'figure', name: 'Star', contours: star.contours as Ring[], colors, style, scale, gap });
    expect(hardToCut).toBeUndefined();
    const rect = inferOverlapRect(design.fingers, design.gridSize);
    // Where the cuts leave the paper edges, as a fraction of the side from the
    // nearest corner, on average: outer bands that do not move stay put.
    const along = design.fingers.filter(f => f.id.includes('cut')).map(({ segments: [{ p0 }] }) =>
     Math.min(Math.abs(p0.x - rect.left), Math.abs(rect.right - p0.x)) < 1e-6
      ? Math.min(p0.y - rect.top, rect.bottom - p0.y) / rect.height : Math.min(p0.x - rect.left, rect.right - p0.x) / rect.width);
    return along.reduce((sum, value) => sum + value, 0) / along.length;
   };
   // The wedges' legs taper toward the corner, so they move about half as far.
   expect(reach(9), style).toBeLessThan(reach(0) - .01);
  }
 }, 20000);
});
