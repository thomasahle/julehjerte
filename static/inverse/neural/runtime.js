/** One lazily loaded, single-thread CPU model per image worker. The first
 * load fetches the model and the runtime's WebAssembly (about 16 MB); it can
 * start early (`predict.warm()`), and whoever waits for it hears its bytes. */
import {u2netpInput} from './input.js';

export const BODY_MODEL_SHA256='1033a25b9105ac1386e21f99271d3f9edaa5a6727ba6b3aa94f7add2e7668a9d';
const modelURL=new URL('./body-1033a25b.onnx',import.meta.url);
const runtimeURL=new URL('../vendor/onnxruntime-1.19.2/',import.meta.url);
// What the two files hold, for the progress total: a server compressing them
// reports compressed lengths, while the bytes counted are decompressed.
const MODEL_BYTES=4615895,WASM_BYTES=11018731;

/** `url`'s bytes, telling `onBytes(loaded)` as they arrive; aborted after
 * `idle` ms with none, so a slow connection is waited for and a dead one not. */
async function fetchBytes(url,onBytes,{idle=15000,what}){
 const abort=new AbortController();
 let timer=setTimeout(()=>abort.abort(),idle);
 try{
  const response=await fetch(url,{signal:abort.signal});
  if(!response.ok)throw new Error(`${what} could not load.`);
  if(!response.body?.getReader){const bytes=await response.arrayBuffer();onBytes(bytes.byteLength);return bytes;}
  const reader=response.body.getReader(),chunks=[];
  let loaded=0;
  for(;;){
   const {done,value}=await reader.read();
   if(done)break;
   chunks.push(value);loaded+=value.byteLength;onBytes(loaded);
   clearTimeout(timer);timer=setTimeout(()=>abort.abort(),idle);
  }
  const bytes=new Uint8Array(loaded);
  let at=0;
  for(const chunk of chunks){bytes.set(chunk,at);at+=chunk.byteLength;}
  return bytes.buffer;
 }finally{clearTimeout(timer);}
}
async function fetchModel(onBytes=()=>{}){
 const bytes=await fetchBytes(modelURL,onBytes,{what:'Paper model'});
 const digest=await crypto.subtle.digest('SHA-256',bytes);
 if(Array.from(new Uint8Array(digest),v=>v.toString(16).padStart(2,'0')).join('')!==BODY_MODEL_SHA256)throw new Error('Paper model checksum mismatch.');
 return bytes;
}
/** The runtime's WebAssembly, fetched here so its bytes can be counted (the
 * runtime takes it as `env.wasm.wasmBinary` instead of fetching it itself). */
function fetchWasm(onBytes=()=>{}){
 return fetchBytes(new URL('ort-wasm-simd-threaded.wasm',runtimeURL),onBytes,{what:'Paper runtime'});
}
const ortModule=()=>import('../vendor/onnxruntime-1.19.2/ort.module.mjs');

export function createBodyPredictor({loadRuntime=ortModule,loadModel=fetchModel,loadWasm=loadRuntime===ortModule?fetchWasm:null}={}){
 let pending=null,ready=false;
 const listeners=new Set(),bytes={model:0,wasm:0},total=MODEL_BYTES+(loadWasm?WASM_BYTES:0);
 const tell=()=>{for(const listen of listeners)listen({stage:'paper-model',loaded:Math.min(total,bytes.model+bytes.wasm),total});};
 const load=()=>pending??=Promise.resolve().then(async()=>{
   const [{ort},model,wasm]=await Promise.all([loadRuntime(),loadModel(n=>{bytes.model=n;tell();}),loadWasm?.(n=>{bytes.wasm=n;tell();})]);
   ort.env.wasm.numThreads=1;ort.env.wasm.proxy=false;ort.env.wasm.wasmPaths=runtimeURL.href;
   if(wasm)ort.env.wasm.wasmBinary=wasm;
   const session=await ort.InferenceSession.create(model,{executionProviders:['wasm']});
   ready=true;
   return{ort,session};
 }).catch(error=>{pending=null;bytes.model=bytes.wasm=0;throw error;});
 // The load, with its bytes told to `onProgress` while it is waited for, and
 // `done` once it is over (also when it was over before anyone asked).
 const loading=async onProgress=>{
  if(ready||!onProgress)return load();
  listeners.add(onProgress);tell();
  try{return await load();}
  finally{listeners.delete(onProgress);onProgress({stage:'paper-model',loaded:total,total,done:true});}
 };
 const predict=async(input,{onProgress}={})=>{
  const {imageWidth:width,imageHeight:height,rgba}=input;
  if(input.type!=='pixels'||![width,height].every(v=>Number.isInteger(v)&&v>0)||width*height>24e6||rgba?.length!==width*height*4)throw new TypeError('Expected a bounded RGBA photograph.');
  const rgb=new Uint8Array(width*height*3);
  for(let i=0;i<width*height;i++)for(let c=0;c<3;c++)rgb[i*3+c]=rgba[i*4+c];
  const converted=u2netpInput(rgb,width,height);
  if(converted.status!=='ready')return null;
  const model=await loading(onProgress),tensor=new model.ort.Tensor('float32',converted.tensor,[1,3,320,320]);
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
 /** Start loading now, while the visitor still chooses a picture. */
 predict.warm=()=>{load().catch(()=>{});};
 return predict;
}

export const predictPaperBody=createBodyPredictor();
