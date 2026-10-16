/** Local physical-paper evidence for an overlap proposal, independent of cap
 * colour, cap outline shape and downstream template fit. Offline experiment.
 */
import {bilinear, homography, project} from '../../../static/inverse/locator/math.js';

export function localOverlapSupport(fields, quad) {
  const {w,h,paper} = fields;
  if (!Number.isInteger(w) || !Number.isInteger(h) || w < 1 || h < 1 || paper?.length !== w*h ||
      !paper.every(v => Number.isFinite(v) && v >= 0 && v <= 1) || quad?.length !== 4 ||
      quad.some(p => p?.length !== 2 || !p.every(Number.isFinite))) throw new TypeError('Expected a finite paper field and four corners');
  const H=homography([[0,0],[1,0],[1,1],[0,1]],quad);
  const sample=(u,v)=>bilinear(paper,w,h,...project(H,[u,v]),0);
  const quadrants=[];
  for(const [sx,sy] of [[1,1],[1,-1],[-1,1],[-1,-1]]) {
    let mass=0;
    for(const u of [.02,.04,.06,.08]) for(const v of [.02,.04,.06,.08]) mass+=sample(sx*u,sy*v);
    quadrants.push(mass/16);
  }
  const edgeInside=[],edgeOutside=[];
  for(let edge=0;edge<2;edge++) {
    let inside=0,outside=0;
    for(let i=0;i<64;i++) {
      const t=.08+.84*(i+.5)/64;
      inside+=edge?sample(t,.975):sample(.975,t);
      outside+=edge?sample(t,1.025):sample(1.025,t);
    }
    edgeInside.push(inside/64);edgeOutside.push(outside/64);
  }
  return {notchInside:quadrants.slice(0,3),notchOutside:quadrants[3],edgeInside,edgeOutside};
}

export function supportedLocalOverlap(evidence) {
  return evidence.notchInside.every(v=>v>=.8) && evidence.notchOutside<=.2 &&
    evidence.edgeInside.every(v=>v>=.85) && evidence.edgeOutside.every(v=>v<=.15);
}
