import { describe, it, expect } from 'vitest';
import { repeatedText } from './repeatedText';
import { generateRepeatedGrid } from './repeatedGrid';
import { generate } from './generate';
import { defaults, readGeneratorState } from './state';
import { geometryKey } from './cache';
import { templateVariants } from './templates';
import type { Font } from './geometry';
import nunito from '../../../static/generator/fonts/nunito.json';
import { normalizeHeartDesign, serializeHeartDesign, serializeHeartToSVG, parseHeartFromSVG } from '$lib/utils/heartDesign';
import { rasterizeDesign } from '$lib/paint/rasterize';
import { intersectionMarginPx, findFingersWithIssues } from '$lib/editor/curveIssues';
import { gridClearanceScale } from '$lib/geometry/clearance';
import { inferOverlapRect } from '$lib/utils/overlapRect';
const font = nunito as unknown as Font;
const colors = { left: '#fff', right: '#b91313' };
const make = (text: string) => generate({ mode: 'text', name: text, text, font, colors, textFrame: 'repeat' });

describe('repeated text frame', () => {
 it('uses exactly the requested four cyclic rows', () => {
  expect(repeatedText('ANNA')).toBe('ANNA\nNNAA\nNAAN\nAANN');
  expect(repeatedText('LOVE')).toBe('LOVE\nOVEL\nVELO\nELOV');
  expect(repeatedText('JUL')).toBe('JUL\nULJ\nLJU');
 });
 it('joins multiline input without blank squares and normalizes Danish letters', () => {
  expect(repeatedText('JULE\nMAND')).toBe(repeatedText('JULEMAND'));
  expect(repeatedText('A N N A')).toBe(repeatedText('ANNA'));
  expect(repeatedText('ABCDEFGHIJ').split('\n')).toHaveLength(10);
  expect(repeatedText('A\u030A')).toBe('Å');
 });
 it('fills the paper grid with letters, keeping all visible connectors at the rim', () => {
  const r = generateRepeatedGrid('ANNA',font);
  expect(r.geometry.A_overlap_paths).toHaveLength(7);
  expect(r.geometry.B_overlap_paths).toHaveLength(7);
  // A row of four letters has four diagonals in each direction, sharing the
  // middle one. The outer weave must not grow a second grid around them.
  for(const e of r.edges.filter(e => e.kind === 'frame')) {
   expect([0,1].some(axis =>
    (e.from[axis] < 12.5 && e.to[axis] < 12.5) ||
    (e.from[axis] > 87.5 && e.to[axis] > 87.5)
   )).toBe(true);
  }
  const mask = rasterizeDesign(make('ANNA').design,400).data;
  const sample = (x:number,y:number) => mask[Math.floor(y*4)*400+Math.floor(x*4)];
  // Probe the crossbars and counters against the explicit 4×4 specification.
  // In upright glyph space, A is blank at its centre while N has its diagonal;
  // the crossbar below the A counter belongs to the letter, never a cutout.
  for(const [row,line] of ['ANNA','NNAA','NAAN','AANN'].entries())
   for(const [col,char] of [...line].entries()) {
    const x=(col+.5)*25,y=(row+.5)*25;
    expect(sample(x,y)).toBe(char==='N'?1:0);
    if(char==='A') expect(sample(x+2,y+2)).toBe(1);
    expect(sample(col*25+5,row*25+5)).toBe(0);
    expect(sample(col*25+20,row*25+20)).toBe(0);
   }
 });
 it('is a shareable, cached frame and appears in the actual template previews', () => {
  const state = { ...defaults, mode: 'text' as const, text: 'LOVE', textFrame: 'repeat' as const };
  expect(readGeneratorState('#make='+encodeURIComponent(JSON.stringify(state)))).toEqual(state);
  expect(templateVariants(state).find(v => v.id === 'repeat')?.state).toEqual(state);
  expect(geometryKey(state)).not.toBe(geometryKey({...state, textFrame: 'woven'}));
 });
 for (const text of ['LOVE','JUL','ANNA','JULE\nMAND'])
  it(`constructs ${JSON.stringify(text)} using open, spaced cuts`, () => {
   const { design } = make(text);
   const n = [...text.replace(/\s+/g,'')].length;
   expect(design.gridSize).toEqual({x:2*n,y:2*n});
   expect(design).not.toHaveProperty('rightCutouts');
   const margin=intersectionMarginPx(inferOverlapRect(design.fingers,design.gridSize),gridClearanceScale(design.gridSize.x,design.gridSize.y));
   expect(findFingersWithIssues(design.fingers,margin).size).toBe(0);
  },15000);
 it('preserves the full repeated weave through JSON and SVG handoff', () => {
  const { design } = make('LOVE');
  const original = rasterizeDesign(design,200).data;
  for (const restored of [normalizeHeartDesign(serializeHeartDesign(design)),parseHeartFromSVG(serializeHeartToSVG(design))]) {
   expect(restored?.gridSize).toEqual(design.gridSize);
   expect(restored?.fingers.length).toBe(design.fingers.length);
   const actual=rasterizeDesign(restored!,200).data;
   expect(actual.reduce((n,v,i)=>n+Number(v!==original[i]),0)/actual.length).toBeLessThan(0.002);
  }
 },15000);
 it('keeps invalid or missing letters explicit', () => {
  expect(()=>make('   ')).toThrow(/Empty text/);
  expect(()=>make('♥')).toThrow();
  expect(()=>make('GLÆDELIG\nJUL')).toThrow(/Too many letters/);
 });
});
