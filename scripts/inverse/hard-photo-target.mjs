/** The photo engine and Mal can fit different objectives after the same import.
 * Mal stores the classified mask, then prepares that binary drawing afresh.
 * Keep both tracks explicit without changing any classified pixels.
 */
import assert from 'node:assert/strict';
import {prepare} from '../../static/inverse/core/engine.js';

export function hardPhotoTarget(imported,mode,cfg){
  if(mode==='photo')return imported.target;
  if(mode!=='mask')throw new Error('Use --target=photo|mask');
  if(!['auto','direct'].includes(cfg.algorithm))throw new Error('The mask track requires automatic or direct fitting.');
  const {mask,resolution}=imported.preview;
  const target=prepare({type:'mask',mask:mask.slice(),resolution},{...cfg,invert:false,removeSpecks:0,fillHoles:0}).target;
  assert.deepEqual(target.sourceImage.mask,mask,'Import-to-mask must retain every classified pixel');
  return target;
}
