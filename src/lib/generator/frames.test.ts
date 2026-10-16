import { describe, it, expect } from 'vitest';
import { generate } from './generate';
import { cutTipCounts } from './cutQuality';
import { generateFittedFigure } from './fitted';
import { generateLayeredFigure } from './layers';
import { generateCornerChecks, hasThreeCounterLanes } from './cornerChecks';
import { defaults, readGeneratorState } from './state';
import { templateVariants } from './templates';
import { inside, uprightToSheet, type Point, type Ring } from './geometry';
import { normalizeContours } from './contours';
import { rasterizeDesign } from '$lib/paint/rasterize';
import { serializeHeartDesign, normalizeHeartDesign, serializeHeartToSVG, parseHeartFromSVG } from '$lib/utils/heartDesign';
import { inferOverlapRect } from '$lib/utils/overlapRect';
import { findFingersWithIssues, intersectionMarginPx } from '$lib/editor/curveIssues';
import { gridClearanceScale } from '$lib/geometry/clearance';
import tree from '../../../static/generator/motifs/tree.json';
import horse from '../../../static/generator/motifs/ph-horse.json';
import bird from '../../../static/generator/motifs/ph-bird.json';
import star from '../../../static/generator/motifs/star.json';
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
  expect(findFingersWithIssues(design.fingers, margin * 1.1).size).toBe(0);
  const before = rasterizeDesign(design, 240).data;
  for (const restored of [normalizeHeartDesign(serializeHeartDesign(design)), parseHeartFromSVG(serializeHeartToSVG(design))]) {
   expect(restored).not.toBeNull();
   expect(restored!.fingers).toHaveLength(design.fingers.length);
   expect(restored).not.toHaveProperty('leftCutouts');
   expect(restored).not.toHaveProperty('rightCutouts');
   const rect = inferOverlapRect(restored!.fingers, restored!.gridSize);
   expect(findFingersWithIssues(restored!.fingers, intersectionMarginPx(rect, gridClearanceScale(6))).size).toBe(0);
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
  for (const t of [7, 11, 89, 93]) {
   expect(result.edges).toContainEqual({ from: [t, 0], to: [t, 100], family: 'A', kind: 'frame' });
   expect(result.edges).toContainEqual({ from: [0, t], to: [100, t], family: 'B', kind: 'frame' });
  }
 });
 it('rounds the layered paw connections and keeps its open cuts through both exports', () => {
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
   expect(findFingersWithIssues(restored!.fingers, margin).size).toBe(0);
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
 for (const style of ['plain', 'rays', 'check'] as const) {
  it(`divides the oval snowflake vertically in ${style}`, () => {
   const { design } = generate({ mode: 'figure', name: 'Snowflake', contours: snow.contours as Ring[], colors, frame: 'oval', style });
   expect(design.gridSize).toEqual({ x: 4, y: 4 });
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
  for (const t of [7, 11, 89, 93]) {
   expect(result.edges).toContainEqual({ from: [t, 0], to: [t, 100], family: 'A', kind: 'frame' });
   expect(result.edges).toContainEqual({ from: [0, t], to: [100, t], family: 'B', kind: 'frame' });
  }
 });
 for (const [name, motif] of Object.entries({ cookie, cat, bicycle, tablerGift })) {
  it(`opens the nested ${name} counters in the layered frame with seven strips`, () => {
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
