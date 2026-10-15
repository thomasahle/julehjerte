import { describe, it, expect } from 'vitest';
import { generate } from './generate';
import { generateFittedFigure } from './fitted';
import { generateLayeredFigure } from './layers';
import { generateCornerChecks } from './cornerChecks';
import { defaults, readGeneratorState } from './state';
import { templateVariants } from './templates';
import { inside, type Ring } from './geometry';
import { rasterizeDesign } from '$lib/paint/rasterize';
import { serializeHeartDesign, normalizeHeartDesign } from '$lib/utils/heartDesign';
import tree from '../../../static/generator/motifs/tree.json';
import horse from '../../../static/generator/motifs/ph-horse.json';
import bird from '../../../static/generator/motifs/ph-bird.json';
import star from '../../../static/generator/motifs/star.json';
import snowflake from '../../../static/generator/motifs/ph-snowflake.json';
import gift from '../../../static/generator/motifs/gift.json';
import female from '../../../static/generator/motifs/ph-gender-female.json';
import sun from '../../../static/generator/motifs/ph-sun.json';
const colors = { left: '#fff', right: '#b91313' };
const examples = { tree, horse, bird, star, snowflake };

describe('complete motif frames', () => {
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
 it('distributes separate stars and a snowflake over the three central lanes', () => {
  const contours: Ring[] = (snowflake.contours as Ring[]).map(r => r.map(([x,y]) => [x*.6,y*.6]));
  for (const x of [-.36,.36]) for (const y of [-.3,.3])
   contours.push(...(star.contours as Ring[]).map(r => r.map(([u,v]) => [x+u*.18,y+v*.18] as [number,number])));
  const { design } = generate({ mode: 'figure', name: 'Snowflake and stars', contours, colors, style: 'corners' });
  expect(design.gridSize).toEqual({ x: 6, y: 6 });
 });

});
