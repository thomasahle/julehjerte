/** Node adapter for the shared polygon-offset check. The separate Python/GEOS
 * study remains an independent implementation used for cross-validation. */
import fs from 'node:fs/promises';
import factory from '../../../static/inverse/vendor/clipper2/clipper2z.mjs';
import {createOffsetPaperAudit as createAudit} from '../../../static/inverse/core/paper-offset.js';
export {exportedPaperPaths} from '../../../static/inverse/core/paper-offset.js';
export async function createOffsetPaperAudit(){
  return createAudit(await factory({wasmBinary:await fs.readFile(new URL('../../../static/inverse/vendor/clipper2/clipper2z.wasm',import.meta.url))}));
}
