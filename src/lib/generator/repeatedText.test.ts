import { describe, it, expect } from 'vitest';
import { repeatedText } from './repeatedText';
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
 it('shifts repeated words one letter per row like the reference', () => {
  expect(repeatedText('LOVE').split('\n')).toEqual([
   'LOVELOVE', 'OVELOVEL', 'VELOVELO', 'ELOVELOV', 'LOVELOVE', 'OVELOVEL'
  ]);
 });
 it('preserves whole input lines and Danish characters', () => {
  const rows = repeatedText('GLÆDELIG\nJUL').split('\n');
  expect(rows.slice(0,4)).toEqual(['GLÆDELIG', 'JULJULJU', 'LÆDELIGG', 'ULJULJUL']);
  expect(repeatedText('ABCDEFGHIJ').split('\n')[0]).toBe('ABCDEFGHIJ');
  expect(repeatedText('A\u030A').split('\n')[0]).toBe('ÅÅÅÅÅÅÅÅ');
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
   expect(design.gridSize).toEqual({x:15,y:15});
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
 });
});
