/** Paired fixed-crop material-resolution experiment. Never seed from saved cuts.
 * Usage: --run=<one-method saved pipeline> --palettes=<calibration report>
 *        --output=<new directory>
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {createCanvas,loadImage} from 'canvas';
import {prepare,design} from '../../../static/inverse/core/engine.js';
import {referenceError} from '../../../static/inverse/core/image-reference.js';
import {AUTOMATIC_PRESET} from '../../../static/inverse/core/presets.js';
import {auditFeatureFidelity} from '../../../static/inverse/core/feature-shapes.js';
import {renderExportedWeave} from '../export-renderer.mjs';
import {classifyPaperMixture} from './paper-mixture.mjs';

const args=Object.fromEntries(process.argv.slice(2).map(s=>s.replace(/^--/,'').split('=')));
assert.ok(args.run&&args.palettes&&args.output&&Object.keys(args).every(k=>['run','palettes','output'].includes(k)),'Supply --run, --palettes and --output.');
const run=path.resolve(args.run),output=path.resolve(args.output),hash=b=>createHash('sha256').update(b).digest('hex');
const inputBytes=await fs.readFile(path.join(run,'report.json')),input=JSON.parse(inputBytes),paletteBytes=await fs.readFile(args.palettes),palettes=JSON.parse(paletteBytes);
assert.equal(input.status,'complete');assert.equal(palettes.status,'complete');
assert.equal(new Set(input.rows.map(r=>r.id)).size,input.rows.length,'Use a single-method input pipeline.');
const configuration={...AUTOMATIC_PRESET,timeLimit:10,trials:0};assert.deepEqual(input.configuration,configuration,'Keep fitting settings fixed.');
const colors=new Map(palettes.calibrationEvidence.filter(r=>r.arm==='rgb-illumination').map(r=>[r.id,r]));
await fs.mkdir(output,{recursive:false});
const report={schema:'material-resolution-pipeline-1',status:'running',configuration,methods:['coarse','crop-rgb'],rows:[],sourceHashes:{},inputReportSha256:hash(inputBytes),paletteReportSha256:hash(paletteBytes),
  scope:'Fresh paired fits on frozen crop RGB, coarse masks, source observations and paper palettes. No saved template, annotation or target score enters initialization or crop selection. Both renders scored against both targets. No deployment or model inference.',
  methodOrder:'Rotate arm order by source index. Same ten-second fitting allowance and geometry, paper, feature and 3% observed-mask checks.'};
for(const file of [new URL(import.meta.url).pathname,new URL('./paper-mixture.mjs',import.meta.url).pathname,path.join(run,'report.json'),path.resolve(args.palettes),'scripts/inverse/export-renderer.mjs',
  ...(await fs.readdir('static/inverse',{recursive:true})).filter(p=>/^(core|locator|vendor)\/.+\.(js|mjs|wasm)$/.test(p)).map(p=>'static/inverse/'+p)])report.sourceHashes[file]=hash(await fs.readFile(file));
const save=()=>fs.writeFile(path.join(output,'report.json'),JSON.stringify(report,null,2)+'\n');
async function checked(asset){
  assert.ok(asset);const file=path.resolve(run,asset.path);assert.ok(file.startsWith(run+path.sep));
  const bytes=await fs.readFile(file);assert.equal(hash(bytes),asset.sha256);report.sourceHashes[file]=asset.sha256;return bytes;
}
async function pixels(bytes){const im=await loadImage(bytes),c=createCanvas(im.width,im.height),ctx=c.getContext('2d');ctx.drawImage(im,0,0);return{width:im.width,height:im.height,rgba:ctx.getImageData(0,0,im.width,im.height).data};}
function png(values,n){const c=createCanvas(n,n),ctx=c.getContext('2d'),im=ctx.createImageData(n,n);assert.equal(values.length,n*n);for(let i=0;i<values.length;i++)im.data.set([255*values[i],255*values[i],255*values[i],255],4*i);ctx.putImageData(im,0,0);return c.toBuffer('image/png');}
await save();
try{
  for(const [index,entry] of input.rows.entries()){
    const sourcePNG=await checked(entry.assets['source.png']),detection=await checked(entry.assets['detection.json']);
    let targets,rgbPNG,sharp,validMask=null,n;
    if(entry.status!=='crop-unresolved'){
      n=entry.resolution;assert.equal(n,configuration.resolution);
      rgbPNG=await checked(entry.assets['crop.png']);const crop=await pixels(rgbPNG),coarse=await pixels(await checked(entry.assets['mask.png']));
      assert.deepEqual([crop.width,crop.height,coarse.width,coarse.height],[n,n,n,n]);
      const rgb=Uint8Array.from({length:3*n*n},(_,i)=>crop.rgba[4*Math.floor(i/3)+i%3]);
      const mask=Uint8Array.from({length:n*n},(_,i)=>Number(coarse.rgba[4*i]>=128));assert.equal(hash(mask),entry.targetMaskSha256);
      if(entry.observation?.file){
        validMask=Uint8Array.from(await checked(entry.assets[entry.observation.file]));
        assert.equal(hash(validMask),entry.observation.sha256);assert.equal(validMask.length,n*n);assert.ok(validMask.every(v=>v===0||v===1));
        assert.equal(validMask.reduce((s,v)=>s+v,0),entry.observation.observedPixels);
      }else assert.equal(entry.observation.observedPixels,n*n);
      const palette=colors.get(entry.id);assert.ok(palette?.applied,'Require a frozen RGB palette for every input.');
      sharp=classifyPaperMixture(rgb,palette.colors,{validMask});
      targets={coarse:{mask,resolution:n},'crop-rgb':{mask:sharp.mask,resolution:n}};
      if(validMask)for(const target of Object.values(targets))Object.assign(target,{validMask,weights:Float64Array.from(validMask)});
    }
    const methods=report.methods,order=[...methods.slice(index%2),...methods.slice(0,index%2)];
    for(const method of order){
      const folder=path.join(output,entry.id+'-'+method);await fs.mkdir(folder);
      const row={id:entry.id,method,assets:{},frozenCrop:true,cropStatus:entry.cropStatus};report.rows.push(row);
      const store=async(name,bytes)=>{await fs.writeFile(path.join(folder,name),bytes);row.assets[name]={path:path.relative(output,path.join(folder,name)),sha256:hash(bytes)};};
      try{
        await store('source.png',sourcePNG);await store('detection.json',detection);
        if(!targets){row.status='crop-unresolved';continue;}
        row.selectedCrop=entry.selectedCrop;row.resolution=n;row.observation=entry.observation;row.palette=colors.get(entry.id);row.classification=method==='crop-rgb'?sharp.metadata:{model:'interpolated-coarse-full-photo-probability'};
        const mask=targets[method].mask;row.targetMaskSha256=hash(mask);row.targetDifference=referenceError(targets.coarse,targets['crop-rgb'].mask);
        await store('crop.png',rgbPNG);await store('mask.png',png(mask,n));
        if(validMask)await store('observed.bin',validMask);
        if(method==='crop-rgb')await store('probability.png',png(sharp.probability,n));
        else if(entry.assets['probability.png'])await store('probability.png',await checked(entry.assets['probability.png']));
        const target=prepare({type:'mask',resolution:n,mask:mask.slice(),validMask},{...configuration,invert:false,removeSpecks:0,fillHoles:0}).target;
        assert.deepEqual(target.sourceImage.mask,mask);
        const started=performance.now(),result=await design(target,configuration);row.solveSeconds=(performance.now()-started)/1000;row.report=result.report;
        for(const name of ['cut_geometry.json','template_left.svg','template_right.svg','weave_preview.svg']){assert.ok(result.files[name]);await store(name,result.files[name]);}
        const render=await renderExportedWeave(result.files['cut_geometry.json'],n);await store('woven.png',render.png);
        row.crossScores={};for(const [name,source] of Object.entries(targets))row.crossScores[name]={image:referenceError(source,render.mask),features:auditFeatureFidelity(source,render.mask,result.report.settings)};
        row.independentImageComparison=row.crossScores[method].image;row.independentImageError=row.independentImageComparison.mismatchFraction;row.independentFeatures=row.crossScores[method].features;
        row.checkedPair=result.report.templateChecksPassed&&row.independentFeatures.passed&&row.independentImageError<=.03;
        row.status=row.checkedPair?'checked-derived-mask':'review-required';
      }catch(error){row.status='failed';row.error=error.message;if(error.report)row.report=error.report;}
      finally{await save();console.log(row.id,method,row.status,row.independentImageError);}
    }
  }
  for(const [file,digest] of Object.entries(report.sourceHashes))assert.equal(hash(await fs.readFile(file)),digest,'Replay input/source changed: '+file);
  report.status='complete';await save();
}catch(error){report.status='failed';report.error=error.message;await save();throw error;}
