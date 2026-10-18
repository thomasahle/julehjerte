/** Offline affine overlap proposal from a physical-paper silhouette.
 * The notch and exposed lower edges determine a parallelogram, without fitting
 * semicircular caps. This is a proposal, not verified cutting geometry. All
 * coordinates are working-image pixel centres; callers handle source mapping.
 */
import {close, fillSmallMaskHoles, foregroundBox, signedDistance} from '../../../static/inverse/locator/fields.js';
import {hullMask} from '../../../static/inverse/locator/anchored.js';
import {lowerEdgeLines} from '../../../static/inverse/locator/locator.js';
import {bilinear, convexQuad, homography, project} from '../../../static/inverse/locator/math.js';

function largestComponent(mask, w, h) {
  const seen = new Uint8Array(mask.length), components = [];
  for (let start = 0; start < mask.length; start++) if (mask[start] && !seen[start]) {
    const queue = [start]; seen[start] = 1;
    for (let j = 0; j < queue.length; j++) {
      const i = queue[j], x = i % w, y = Math.floor(i / w);
      for (const k of [x ? i-1 : -1, x+1 < w ? i+1 : -1, y ? i-w : -1, y+1 < h ? i+w : -1]) {
        if (k >= 0 && mask[k] && !seen[k]) { seen[k] = 1; queue.push(k); }
      }
    }
    components.push(queue);
  }
  components.sort((a, b) => b.length-a.length);
  if (!components.length || components[0].length < 100 || components[1]?.length > .35*components[0].length) return null;
  return components[0];
}

export function affineNotchQuad(notch, lines) {
  const B = lines.tip, vR = [-lines.right.a, -1], vL = [-lines.left.a, -1];
  const dx = notch[0]-B[0], dy = notch[1]-B[1], det = vR[0]*vL[1]-vL[0]*vR[1];
  if (!Number.isFinite(det) || Math.abs(det) < 1e-6) return null;
  const s = (dx*vL[1]-vL[0]*dy)/det, t = (vR[0]*dy-dx*vR[1])/det;
  if (!(s > 0 && t > 0)) return null;
  const q = [notch.slice(), B.map((v, i) => v+s*vR[i]), B.slice(), B.map((v, i) => v+t*vL[i])];
  return convexQuad(q) ? q : null;
}

/** Full predicted paper support outside/inside the proposed overlap. This
 * deliberately uses the photographed foreground rather than idealized caps.
 * It does not measure accuracy against an independent material annotation.
 */
export function overlapEvidence(f, quad, component) {
  const H = homography(quad, [[0, 0], [1, 0], [1, 1], [0, 1]]);
  let outside = 0, total = 0;
  const mass = [0, 0], colour = [0, 0];
  for (const i of component) {
    if (f.paper[i] < .8) continue;
    const [u, v] = project(H, [i % f.w, Math.floor(i/f.w)]);
    const insideEnvelope = u >= -.025 && u <= 1.025 && v <= 1.025 || v >= -.025 && v <= 1.025 && u <= 1.025;
    outside += !insideEnvelope; total++;
    const cap = u > .025 && u < .975 && v < -.025 ? 0 : v > .025 && v < .975 && u < -.025 ? 1 : -1;
    if (cap >= 0) { mass[cap]++; colour[cap] += f.chroma[i]; }
  }
  const mean = colour.map((v, i) => mass[i] ? v/mass[i] : .5);
  const losses = [[mean[0], 1-mean[1]], [1-mean[0], mean[1]]];
  const phase = Number(losses[1][0]+losses[1][1] < losses[0][0]+losses[0][1]);
  const inverse = homography([[0, 0], [1, 0], [1, 1], [0, 1]], quad);
  let covered = 0;
  for (let y = 0; y < 64; y++) for (let x = 0; x < 64; x++) {
    const p = project(inverse, [(x+.5)/64, (y+.5)/64]);
    covered += bilinear(f.paper, f.w, f.h, ...p, 0);
  }
  return {bodyOutsideEnvelope: total ? outside/total : 1, overlapBodyCoverage: covered/4096,
    capSampleCounts: mass, capForeignProbability: losses[phase], phase};
}

export function notchOverlapProposal(fields, {shapePaper = fields.paper} = {}) {
  const {w, h} = fields, n = w*h;
  if (!Number.isInteger(w) || !Number.isInteger(h) || w < 24 || h < 24 ||
      ['paper', 'chroma', 'r', 'g', 'b'].some(k => fields[k]?.length !== n || !fields[k].every(v => Number.isFinite(v) && v >= 0 && v <= 1)) ||
      shapePaper?.length !== n || !shapePaper.every(v => Number.isFinite(v) && v >= 0 && v <= 1)) {
    throw new TypeError('Expected finite physical-paper, colour and RGB fields in [0,1]');
  }
  const initial = close(fields.paper, w, h, 1), component = largestComponent(initial, w, h);
  if (!component) return {status: 'unresolved', reason: 'No single dominant paper component'};
  const selected = new Uint8Array(n); for (const i of component) selected[i] = 1;
  const mask = fillSmallMaskHoles(selected, w, h, {maxArea: n}).mask;
  const f = {...fields, mask}, foreground = foregroundBox(f);
  if (foreground.status !== 'ok') return {status: 'unresolved', reason: foreground.reason};
  const box = foreground.box, [x0, y0, x1, y1] = box, width = x1-x0, height = y1-y0;
  const lines = lowerEdgeLines(f, box);
  if (!lines) return {status: 'unresolved', reason: 'No exposed lower edge pair', box};
  const trimmed = [];
  for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) if (mask[y*w+x]) trimmed.push(y*w+x);
  // Complete-shape evidence may retain paper behind a foreground object. Use
  // it only for the notch hypothesis: visible paper still determines exposed
  // lower edges and supplies the body/material evidence below. No union edits
  // the visible-paper field or the target artwork.
  let notchMask = mask, notchComponent = trimmed;
  if (shapePaper !== fields.paper) {
    const shapeMask = close(shapePaper, w, h, 1), shapeComponent = largestComponent(shapeMask, w, h);
    if (!shapeComponent) return {status: 'unresolved', reason: 'No dominant complete-shape component', box, lines};
    notchMask = new Uint8Array(n); for (const i of shapeComponent) notchMask[i] = 1;
    const supported = trimmed.reduce((sum, i) => sum+notchMask[i], 0)/trimmed.length;
    if (supported < .8) return {status: 'unresolved', reason: 'Visible and complete shapes select different objects', box, lines};
    notchMask = fillSmallMaskHoles(notchMask, w, h, {maxArea: n}).mask;
    notchComponent = shapeComponent;
  }
  const hullDistance = signedDistance(hullMask(notchComponent, w, h), w, h);
  let notch = null, depth = -Infinity;
  for (let y = Math.ceil(y0+2); y < y0+.55*height; y++) for (let x = Math.ceil(x0+.15*width); x < x0+.85*width; x++) {
    if (!notchMask[y*w+x] || notchMask[(y-1)*w+x]) continue;
    const p = [x, y-.5], d = bilinear(hullDistance, w, h, ...p);
    if (d > depth) { depth = d; notch = p; }
  }
  if (!notch) return {status: 'unresolved', reason: 'No visible notch', box, lines};
  const quad = affineNotchQuad(notch, lines);
  if (!quad) return {status: 'unresolved', reason: 'Notch and lower edges do not define a convex overlap', box, lines, notch};
  const evidence = {...overlapEvidence(fields, quad, trimmed), notchDepthFraction: depth/Math.max(width, height),
    lowerEdgeSupport: [lines.left.support, lines.right.support],
    lowerEdgeSpanFraction: [lines.left.span/height, lines.right.span/height]};
  const supported = evidence.notchDepthFraction >= .025 && evidence.lowerEdgeSupport.every(v => v >= .8) &&
    evidence.lowerEdgeSpanFraction.every(v => v >= .15) && evidence.overlapBodyCoverage >= .94 &&
    evidence.bodyOutsideEnvelope <= .03 && evidence.capSampleCounts.every(v => v >= 20) &&
    evidence.capForeignProbability.every(v => v <= .15) &&
    quad.every(([x,y]) => x >= 0 && y >= 0 && x < w && y < h);
  return {status: supported ? 'proposal' : 'unresolved', reason: supported ? undefined : 'Notch/edge/paper evidence incomplete',
    quad, box, lines, notch, evidence, notchSource: shapePaper === fields.paper ? 'visible-paper' : 'complete-shape-hypothesis',
    score: evidence.bodyOutsideEnvelope + 1-evidence.overlapBodyCoverage + evidence.capForeignProbability.reduce((a,b) => a+b)/2,
    limitations: ['Affine overlap assumption; perspective and nonplanar folding can move the true corners.',
      'Predicted body and paper identities are evidence, not independent ground truth.', 'No semicircular cap fit or downstream mask-fit score is used.']};
}
