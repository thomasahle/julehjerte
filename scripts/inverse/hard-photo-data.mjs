/** Frozen photographic evidence. Hashes cover both the file and decoded pixels. */
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {createCanvas,loadImage} from 'canvas';

const hash=bytes=>createHash('sha256').update(bytes).digest('hex');

/** A separate source catalogue keeps controlled photo variants out of the
 * frozen benchmark. Paths are relative to the repository, like the defaults. */
export function hardPhotoCatalogCases(catalog){
  assert.ok(catalog?.source?.file&&/^[a-f0-9]{64}$/.test(catalog.source.sha256),'A source catalogue requires a photograph file and SHA-256');
  assert.ok(Array.isArray(catalog.cases)&&catalog.cases.length,'A source catalogue requires cases');
  const ids=new Set();
  return catalog.cases.map(entry=>{
    assert.ok(typeof entry.id==='string'&&/^[a-z0-9][a-z0-9-]*$/.test(entry.id)&&!ids.has(entry.id),'Source case IDs must be unique safe path components');ids.add(entry.id);
    assert.ok(Array.isArray(entry.roi)&&entry.roi.length===4&&entry.roi.every(Number.isFinite)&&entry.roi[2]>entry.roi[0]&&entry.roi[3]>entry.roi[1],`Invalid rough ROI for ${entry.id}`);
    return{...entry,...catalog.source,group:'source-catalog',label:entry.label||entry.id,cropStatus:entry.cropStatus||'needs_review'};
  });
}

export async function readHardPhoto(spec){
  const bytes=await fs.readFile(spec.file),fileSha256=hash(bytes);
  if(spec.sha256)assert.equal(fileSha256,spec.sha256,`Source photograph changed: ${spec.file}`);
  const im=await loadImage(bytes),canvas=createCanvas(im.width,im.height),ctx=canvas.getContext('2d');ctx.drawImage(im,0,0);
  if(spec.width!==undefined)assert.equal(im.width,spec.width);
  if(spec.height!==undefined)assert.equal(im.height,spec.height);
  const rgba=spec.rgbaFile?new Uint8ClampedArray(await fs.readFile(spec.rgbaFile)):ctx.getImageData(0,0,im.width,im.height).data,rgbaSha256=hash(rgba);
  assert.equal(rgba.length,im.width*im.height*4,'Decoded pixel dimensions must agree');
  if(spec.decodedPixelsSha256)assert.equal(rgbaSha256,spec.decodedPixelsSha256,`Decoded source pixels changed: ${spec.file}`);
  return{type:'pixels',imageWidth:im.width,imageHeight:im.height,rgba,fileSha256,rgbaSha256,canvas};
}
