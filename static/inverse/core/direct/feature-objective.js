/** Feature emphasis scales the observed objective, never creates supervision.
 * The caller owns the emphasis array; keep the unweighted path byte-identical.
 */
import {sourceWeights} from '../image-reference.js';

export function observedFeatureImportance(source,emphasis){
  if(emphasis.length!==source.mask.length)throw new Error('Feature importance must match the source image.');
  const observed=sourceWeights(source);
  return observed?Float64Array.from(emphasis,(weight,i)=>weight*observed[i]):emphasis;
}
