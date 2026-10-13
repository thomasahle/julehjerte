import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {reviewMaterialSamples,validateMaterialSamples} from './photo-material-samples.mjs';
import {readHardPhoto} from './hard-photo-data.mjs';
import {rectify,quantize} from '../../static/inverse/core/input.js';

const source={file:'analytical.png',sha256:'0'.repeat(64),width:8,height:8,paperNames:['dark','light']};
const annotation={id:'analytical',source,groups:[{id:'dark',paper:0,points:[[0,1],[2,3]]},{id:'light',paper:1,points:[[5,2],[7,6]]}]};
const quad=[[0,0],[8,0],[8,8],[0,8]],mask=Uint8Array.from({length:64},(_,i)=>Number(i%8<4));

test('photo samples use source pixel centres and one global paper phase',()=>{
 const before=structuredClone(annotation),pixels=mask.slice(),r=reviewMaterialSamples(annotation,{quad,mask,resolution:8});
 assert.equal(r.phase,1);assert.equal(r.correct,4);assert.equal(r.coverage,1);assert.equal(r.allReviewedSamplesMatch,true);
 assert.deepEqual(r.rows[0].cropPoint,[.5,1.5]);assert.deepEqual(annotation,before);assert.deepEqual(mask,pixels);
 const inverted=reviewMaterialSamples(annotation,{quad,mask:mask.map(v=>v^1),resolution:8});
 assert.equal(inverted.phase,0);assert.equal(inverted.correct,4);
 // Freeze the classification phase: export cannot conceal a global inversion.
 const wrongExport=reviewMaterialSamples(annotation,{quad,mask:mask.map(v=>v^1),resolution:8,phase:r.phase});
 assert.equal(wrongExport.correct,0);assert.equal(wrongExport.mismatched,4);
 const constant=reviewMaterialSamples(annotation,{quad,mask:new Uint8Array(64),resolution:8});
 assert.equal(constant.correct,2);assert.equal(constant.phaseAmbiguous,true);assert.equal(constant.allReviewedSamplesMatch,false);
});

test('cropping away an incorrect feature cannot improve all-sample agreement',()=>{
 const r=reviewMaterialSamples(annotation,{quad:[[0,0],[4,0],[4,8],[0,8]],mask:new Uint8Array(64).fill(1),resolution:8});
 assert.equal(r.covered,2);assert.equal(r.outsideCrop,2);assert.equal(r.agreementCovered,1);assert.equal(r.agreementAllSamples,.5);assert.equal(r.allReviewedSamplesMatch,false);
 const absent=reviewMaterialSamples(annotation);assert.equal(absent.outsideCrop,4);assert.equal(absent.agreementAllSamples,0);assert.equal(absent.phase,null);
 const noFit=reviewMaterialSamples(annotation,{quad});assert.equal(noFit.covered,4);assert.equal(noFit.unavailable,4);assert.equal(noFit.agreementAllSamples,0);
});

test('reflections and perspective map samples without changing their identities',()=>{
 const reflected=reviewMaterialSamples(annotation,{quad:[[8,0],[0,0],[0,8],[8,8]],mask:mask.map(v=>v^1),resolution:8,phase:1});
 assert.equal(reflected.correct,4);
 // x'=x/(1+y/8), y'=y/(1+y/8), with source samples chosen analytically.
 const a={...annotation,groups:[{id:'dark',paper:0,points:[[0,0],[1,1]]},{id:'light',paper:1,points:[[3,0],[3,1]]}]};
 const perspective=reviewMaterialSamples(a,{quad:[[0,0],[8,0],[4,4],[0,4]],mask,resolution:8,phase:1});
 const r=perspective.rows[1];assert.ok(Math.abs(r.cropPoint[0]-1.5/(1-1.5/8))<1e-12);assert.ok(Math.abs(r.cropPoint[1]-1.5/(1-1.5/8))<1e-12);
});

test('invalid observations and degenerate crops fail explicitly',()=>{
 for(const bad of [null,{...annotation,source:{...source,sha256:'bad'}},{...annotation,groups:[annotation.groups[0]]},{...annotation,groups:[...annotation.groups,annotation.groups[0]]}])assert.throws(()=>validateMaterialSamples(bad));
 for(const point of [[8,1],[-1,1],[.5,1],[NaN,2],[1]])assert.throws(()=>validateMaterialSamples({...annotation,groups:[{...annotation.groups[0],points:[point]},annotation.groups[1]]}));
 for(const q of [[[0,0],[8,8],[8,0],[0,8]],[[0,0],[0,0],[8,8],[0,8]],[[0,0],[8,0],[8,NaN],[0,8]]])assert.throws(()=>reviewMaterialSamples(annotation,{quad:q}));
 assert.throws(()=>reviewMaterialSamples(annotation,{quad,mask:new Uint8Array(4),resolution:8}));
 assert.throws(()=>reviewMaterialSamples(annotation,{quad,mask:new Float32Array(64).fill(.5),resolution:8}));
 assert.throws(()=>reviewMaterialSamples(annotation,{quad,phase:2}));
});

test('reviewed photographic samples retain pinned bytes, dimensions and separate groups',async()=>{
 const catalog=JSON.parse(await fs.readFile(new URL('./fixtures/photo-material-samples.json',import.meta.url)));
 assert.equal(catalog.schema,'woven-heart-photo-material-samples-1');const ids=new Set(),sources=new Map();
 for(const entry of catalog.cases){validateMaterialSamples(entry);assert.ok(!ids.has(entry.id));ids.add(entry.id);
  if(!sources.has(entry.source.sha256))sources.set(entry.source.sha256,await readHardPhoto(entry.source));
  const image=sources.get(entry.source.sha256);assert.equal(image.imageWidth,entry.source.width);assert.equal(image.imageHeight,entry.source.height);
 }
 assert.deepEqual([...ids],['bauble','dense-checker','bibel-star-outline']);
});

test('the blue-star observations retain the frozen original-photo review and expose a clipped border',async()=>{
 const catalog=JSON.parse(await fs.readFile(new URL('./fixtures/photo-material-samples.json',import.meta.url))),a=catalog.cases.find(r=>r.id==='bibel-star-outline');
 const bytes=await fs.readFile(new URL('../../docs/inverse/datasets/blue-star-material-observations.json',import.meta.url));
 assert.equal(createHash('sha256').update(bytes).digest('hex'),a.review.frozenSha256);
 const {review,...observations}=a;assert.deepEqual(observations,JSON.parse(bytes).cases[0]);
 // Frozen predictions from two offline models, not asserted physical corners.
 const full=[[509.0754771093246,139.90881205644737],[734.0535093713297,382.1892973114441],[501.0947867786813,612.3317319644113],[269.0034779973999,366.68254794957005]];
 const clipped=[[513.3545428148515,146.27395317629365],[727.2435237755178,382.2806819789985],[485.55361224150624,596.6805118169444],[273.4449956033525,371.1741352002313]];
 assert.equal(reviewMaterialSamples(a,{quad:full}).covered,28);
 const r=reviewMaterialSamples(a,{quad:clipped});assert.equal(r.total,28);assert.equal(r.covered,27);assert.equal(r.outsideCrop,1);
 assert.deepEqual(r.rows.filter(p=>!p.covered).map(p=>p.point),[[512,573]]);
});

test('the bauble review separates cropped-out frame from classification loss',async()=>{
 const catalog=JSON.parse(await fs.readFile(new URL('./fixtures/photo-material-samples.json',import.meta.url))),a=catalog.cases.find(r=>r.id==='bauble'),source=await readHardPhoto(a.source);
 // Frozen scene-model proposal from the completed foreground-scene-v1 replay.
 // These are the erroneous proposal's coordinates, not asserted true corners.
 const crop=[[585.6941380955465,911.9828978081465],[671.9584046404291,996.4468244680473],[580.9993657081336,1107.9107396291047],[478.75396023995785,1003.2210601668503]];
 const q=quantize(rectify(source.rgba,source.imageWidth,source.imageHeight,400,crop));
 const review=reviewMaterialSamples(a,{mask:q.mask,resolution:400,quad:crop});
 assert.equal(review.total,26);assert.equal(review.outsideCrop,4);assert.equal(review.mismatched,2);assert.equal(review.correct,20);
 const lower=review.groups.find(g=>g.id==='lower-frame'),upper=review.groups.find(g=>g.id==='upper-frame');
 assert.equal(lower.outsideCrop,4);assert.equal(upper.mismatched,2);
 assert.equal(review.groups.find(g=>g.id==='white-gaps').correct,10);
});
