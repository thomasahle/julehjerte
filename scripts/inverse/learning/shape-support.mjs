/** Offline crop evidence keeps complete shape distinct from visible paper.
 * A shape prior can constrain the notch without painting an occluder into the
 * material target. Neither field establishes an independently verified corner.
 */
import {localOverlapSupport} from './notch-support.mjs';

export function separateOverlapSupport(visible, shape, quad) {
  if (visible.w !== shape.w || visible.h !== shape.h) throw new TypeError('Shape and visibility must share one coordinate frame');
  const observation = localOverlapSupport(visible, quad), complete = localOverlapSupport(shape, quad);
  let visiblePixels=0, supportedPixels=0;
  for(let i=0;i<visible.paper.length;i++)if(visible.paper[i]>.5){visiblePixels++;supportedPixels+=shape.paper[i]>.5;}
  const visibleInsideCompleteFraction=visiblePixels?supportedPixels/visiblePixels:0;
  return {visible: observation, complete, visibleInsideCompleteFraction,
    supported: visibleInsideCompleteFraction>=.8 && complete.notchInside.every(v => v >= .8) && complete.notchOutside <= .2 &&
      observation.edgeInside.every(v => v >= .85) && observation.edgeOutside.every(v => v <= .15),
    score: complete.notchInside.reduce((sum, v) => sum+1-v, 0)/3 + complete.notchOutside +
      observation.edgeInside.reduce((sum, v) => sum+1-v, 0)/2 + observation.edgeOutside.reduce((sum, v) => sum+v, 0)/2};
}
