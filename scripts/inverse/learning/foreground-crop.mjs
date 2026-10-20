/** Research adapter for optional material fields; saliency uses the shared API. */
import {detectForegroundCrop as detect} from '../../../static/inverse/neural/foreground-crop.js';
import {materialFields} from './material-fields.mjs';
export {foregroundFields} from '../../../static/inverse/neural/foreground-fields.js';
export async function detectForegroundCrop(input,options={}){
 const {material,...args}=options;
 if(material&&options.paletteMode&&options.paletteMode!=='threshold')throw new TypeError('Invalid foreground palette mode for material fields.');
 return detect(input,{...args,...(material?{fieldProvider:work=>materialFields(work,options.probability,material,options.resolution??256,options.window)}:{})});
}
