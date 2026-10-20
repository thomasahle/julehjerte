/** One lazily loaded, single-thread CPU model per image worker. */
import {u2netpInput} from './input.js';

export const BODY_MODEL_SHA256='1033a25b9105ac1386e21f99271d3f9edaa5a6727ba6b3aa94f7add2e7668a9d';
const modelURL=new URL('./body-1033a25b.onnx',import.meta.url);
const runtimeURL=new URL('../vendor/onnxruntime-1.19.2/',import.meta.url);
async function fetchModel(){
 const abort=new AbortController(),timer=setTimeout(()=>abort.abort(),15000);
 try{
  const response=await fetch(modelURL,{signal:abort.signal});
  if(!response.ok)throw new Error('Paper model could not load.');
  const bytes=await response.arrayBuffer();
  const digest=await crypto.subtle.digest('SHA-256',bytes);
  if(Array.from(new Uint8Array(digest),v=>v.toString(16).padStart(2,'0')).join('')!==BODY_MODEL_SHA256)throw new Error('Paper model checksum mismatch.');
  return bytes;
 }finally{clearTimeout(timer);}
}

export function createBodyPredictor({loadRuntime=()=>import('../vendor/onnxruntime-1.19.2/ort.module.mjs'),loadModel=fetchModel}={}){
 let pending=null;
 const load=()=>pending??=Promise.resolve().then(async()=>{
   const [{ort},bytes]=await Promise.all([loadRuntime(),loadModel()]);
   ort.env.wasm.numThreads=1;ort.env.wasm.proxy=false;ort.env.wasm.wasmPaths=runtimeURL.href;
   const session=await ort.InferenceSession.create(bytes,{executionProviders:['wasm']});
   return{ort,session};
 }).catch(error=>{pending=null;throw error;});
 return async input=>{
  const {imageWidth:width,imageHeight:height,rgba}=input;
  if(input.type!=='pixels'||![width,height].every(v=>Number.isInteger(v)&&v>0)||width*height>24e6||rgba?.length!==width*height*4)throw new TypeError('Expected a bounded RGBA photograph.');
  const rgb=new Uint8Array(width*height*3);
  for(let i=0;i<width*height;i++)for(let c=0;c<3;c++)rgb[i*3+c]=rgba[i*4+c];
  const converted=u2netpInput(rgb,width,height);
  if(converted.status!=='ready')return null;
  const model=await load(),tensor=new model.ort.Tensor('float32',converted.tensor,[1,3,320,320]);
  let output;
  try{
   output=await model.session.run({rgb:tensor});
   const values=output.saliency?.data;
   if(values?.length!==320**2||!values.every(p=>Number.isFinite(p)&&p>=0&&p<=1))throw new Error('Invalid paper probability output.');
   return{probability:Float32Array.from(values),resolution:320,window:converted.window,modelSha256:BODY_MODEL_SHA256};
  }catch(error){
   pending=null;await model.session.release?.();throw error;
  }finally{tensor.dispose();for(const value of Object.values(output??{}))value.dispose?.();}
 };
}

export const predictPaperBody=createBodyPredictor();
