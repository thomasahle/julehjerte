/** Experimental review-required fallback for slightly clipped photographs.
 * Coverage is measured in the rectified overlap square, without image colors,
 * fitted paths or interpolation padding entering the decision.
 */
import {overlapCoverage} from '../../../static/inverse/core/crop-coverage.js';
export {overlapCoverage} from '../../../static/inverse/core/crop-coverage.js';
import {detectHeartCrops,supportedCropOutline} from '../../../static/inverse/core/crop.js';

export async function selectReviewedPhotoCrop(source,{learnedCrop,productionCrop=detectHeartCrops}={}) {
  if(typeof learnedCrop!=='function')throw new TypeError('A learned crop provider is required.');
  const production=await productionCrop(source),decision={policy:'retain-production-reviewed-partial-fallback-v1',
    selected:'production',neuralAttempted:false,minimumObservedFraction:.99,maximumExtrapolation:.05};
  // Preserve every existing editable proposal, including weak ones; the model
  // only adds a suggestion when the production detector returned none.
  if(production.candidates?.length)return {production,detection:production,decision};
  decision.neuralAttempted=true;
  try {
    const learned=await learnedCrop(source),candidate=learned?.candidates?.[0];
    decision.learnedSupported=!!candidate&&supportedCropOutline(candidate.locator??learned.proposal);
    decision.coverage=overlapCoverage(candidate?.quad,source.imageWidth,source.imageHeight);
    if(decision.learnedSupported&&decision.coverage&&decision.coverage.observedFraction>=decision.minimumObservedFraction&&
      decision.coverage.maximumExtrapolation<=decision.maximumExtrapolation) {
      decision.selected='learned';decision.requiresReview=true;
      return {production,detection:learned,decision};
    }
  }catch(error){decision.neuralError=error.message;}
  return {production,detection:production,decision};
}
