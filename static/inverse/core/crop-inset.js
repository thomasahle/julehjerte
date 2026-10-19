import {convexQuad,homography,project} from '../locator/math.js';

/** Photographic edge blur belongs outside the pattern used for fitting.
 * One percent on each side retains the central 98% of the overlap width.
 * Apply this once to an automatic proposal, never during pixel preparation:
 * the editable handles, live preview and solver must describe the same crop.
 */
export const AUTOMATIC_CROP_INSET = .01;

export function insetCropQuad(quad,fraction=AUTOMATIC_CROP_INSET){
  if(!Number.isFinite(fraction)||fraction<0||fraction>=.5)throw new RangeError('Crop inset must be at least zero and less than one half.');
  if(!convexQuad(quad,0))throw new TypeError('Crop requires a convex quadrilateral in perimeter order.');
  if(fraction===0)return quad.map(p=>p.slice());
  const square=[[0,0],[1,0],[1,1],[0,1]],H=homography(square,quad);
  // Work in rectified coordinates, so a tilted or perspective photograph
  // loses the same fraction of each side. A centroid shrink is not equivalent.
  return square.map(([u,v])=>project(H,[fraction+(1-2*fraction)*u,fraction+(1-2*fraction)*v]));
}
