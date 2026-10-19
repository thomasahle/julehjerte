/** Recover exact observed masks for saved foreground replays and editable QA.
 * Older foreground reports scored padding as well as observed pixels and saved
 * grayscale previews. Recreate preparation, require identical mask hashes, and
 * preserve the old scores beside the observed-area measurements. Never refit.
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {createCanvas,loadImage} from 'canvas';
import {prepare} from '../../../static/inverse/core/engine.js';
import {referenceError} from '../../../static/inverse/core/image-reference.js';
import {auditFeatureFidelity} from '../../../static/inverse/core/feature-shapes.js';
import {hardPhotoTarget} from '../hard-photo-target.mjs';
import {renderExportedWeave} from '../export-renderer.mjs';

const args=Object.fromEntries(process.argv.slice(2).map(s=>s.replace(/^--/,'').split('=')));
assert.deepEqual(Object.keys(args).sort(),['output','run']);
const hash=b=>createHash('sha256').update(b).digest('hex');
const reportBytes=await fs.readFile(path.join(args.run,'report.json')),report=JSON.parse(reportBytes);
assert.equal(report.status,'complete');assert.equal(report.schema,'woven-heart-foreground-replay-1');
for(const [file,sha] of Object.entries(report.sourceHashes))assert.equal(hash(await fs.readFile(file)),sha,file);
const probeBytes=await fs.readFile(path.join(report.probe,'manifest.json'));assert.equal(hash(probeBytes),report.probeManifestSha256);
const probe=JSON.parse(probeBytes);assert.equal(probe.status,'complete');
await fs.mkdir(args.output,{recursive:false});const results=[],coverage=[];
for(const row of report.rows){
 if(!row.selectedCrop)continue;
 const input=probe.rows.find(r=>r.id===row.id);assert.ok(input);
 const raw=await fs.readFile(input.file);assert.equal(hash(raw),input.photoSha256);
 const photo=await loadImage(raw);assert.deepEqual([photo.width,photo.height],input.dimensions);
 const canvas=createCanvas(photo.width,photo.height),ctx=canvas.getContext('2d');ctx.drawImage(photo,0,0);
 const source={type:'pixels',rgba:ctx.getImageData(0,0,photo.width,photo.height).data,imageWidth:photo.width,imageHeight:photo.height};
 const crop=row.selectedCrop,prepared=prepare({...source,quad:crop.quad,cropProvenance:crop.provenance},report.configuration);
 const target=hardPhotoTarget(prepared,report.targetMode,report.configuration),n=prepared.preview.resolution;
 assert.equal(hash(prepared.preview.mask),row.preparedMaskSha256);assert.equal(hash(target.sourceImage.mask),row.targetMaskSha256);
 const valid=target.sourceImage.validMask??new Uint8Array(n*n).fill(1),observed=valid.reduce((sum,v)=>sum+v,0);
 const detail={id:row.id,method:row.method,cropEvidence:row.cropEvidence,quad:crop.quad,observedPixels:observed,totalPixels:n*n,observedFraction:observed/(n*n)};
 coverage.push(detail);
 const asset=row.assets['cut_geometry.json'];if(!asset)continue;
 const file=path.resolve(args.run,asset.path);assert.ok(file.startsWith(path.resolve(args.run)+path.sep));
 const geometry=await fs.readFile(file);assert.equal(hash(geometry),asset.sha256);
 const render=await renderExportedWeave(geometry.toString(),n),image=referenceError(target.sourceImage,render.mask);
 const features=auditFeatureFidelity(target.sourceImage,render.mask,row.report.settings);
 const id=row.id+'-'+row.method,folder=path.join(args.output,id,'automatic');await fs.mkdir(folder,{recursive:true});
 await fs.link(file,path.join(folder,'cut_geometry.json'));
 const maskCanvas=createCanvas(n,n),maskCtx=maskCanvas.getContext('2d'),pixels=maskCtx.createImageData(n,n);
 for(let i=0;i<n*n;i++)pixels.data.set(target.sourceImage.mask[i]?[185,19,19,255]:[255,255,255,255],i*4);
 maskCtx.putImageData(pixels,0,0);await fs.writeFile(path.join(folder,'mask.png'),maskCanvas.toBuffer('image/png'));
 await fs.writeFile(path.join(folder,'observed.bin'),valid);
 const passed=row.report.templateChecksPassed&&features.passed&&image.mismatchFraction<=.03;
 results.push({id,method:row.method,sourceCase:row.id,runs:[{preset:'automatic',independentImageError:image.mismatchFraction,
  originalIncludingPaddingError:row.independentImageError,maskSha256:row.targetMaskSha256,passed,report:row.report,
  observation:{file:'observed.bin',sha256:hash(valid),observedPixels:observed,totalPixels:n*n}}]});
 Object.assign(detail,{originalIncludingPaddingError:row.independentImageError,observedImage:image,features,passed});
}
assert.ok(results.length,'No exported pairs to audit');
await fs.writeFile(path.join(args.output,'results.json'),JSON.stringify({cropMode:'frozen-foreground',targetMode:report.targetMode,
 replayReportSha256:hash(reportBytes),results},null,2)+'\n');
await fs.writeFile(path.join(args.output,'coverage.json'),JSON.stringify({schema:'foreground-observed-replay-1',replayReportSha256:hash(reportBytes),
 implementationSha256:hash(await fs.readFile(new URL(import.meta.url))),scope:'Observed-area diagnostic and exact saved-geometry replay. Original including-padding scores are retained; no fitting, changed target or corner correction.',coverage},null,2)+'\n');
console.log(JSON.stringify(coverage.map(r=>({id:r.id,observed:r.observedFraction,error:r.observedImage?.mismatchFraction,passed:r.passed}))));
