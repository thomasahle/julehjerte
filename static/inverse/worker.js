import { prepare, design, inspectSaved } from './core/engine.js';
import { zipFiles } from './core/zip.js';
import { detectHeartCrops, refineHeartCrop } from './core/crop.js';

let prepared = null;
let result = null;

self.onmessage = async ({ data }) => {
  const { id, action, input, settings } = data;
  const progress = event => self.postMessage({ id, type: 'progress', event });
  try {
    if (action === 'archive') {
      if (!result) throw new Error('Generate or check templates first.');
      const archive = zipFiles(result.files);
      self.postMessage({ id, type: 'archive', archive }, [archive.buffer]);
      return;
    }
    result = null;
    if (action === 'detect-crops' || action === 'refine-crop') {
      prepared = null;
      const crops = action === 'detect-crops'
        ? detectHeartCrops(input, { onProgress: progress })
        : refineHeartCrop(input, input.quad);
      self.postMessage({ id, type: 'crops', crops });
    } else if (action === 'prepare') {
      // A failed preparation must never leave the previous artwork available.
      prepared = null;
      const value = prepare(input, settings, progress);
      prepared = value.target;
      self.postMessage({ id, type: 'prepared', preview: value.preview });
    } else if (action === 'solve') {
      if (!prepared) throw new Error('Prepare and inspect the artwork first.');
      result = await design(prepared, settings, progress);
      self.postMessage({ id, type: 'result', result });
    } else if (action === 'saved') {
      prepared = null;
      result = inspectSaved(input.text, settings, progress);
      self.postMessage({ id, type: 'result', result });
    } else throw new Error('Unknown worker action.');
  } catch (error) {
    self.postMessage({ id, type: 'error', message: error.message || String(error), code: error.code, report: error.report || null });
  }
};
