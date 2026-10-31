/** The cut-proposal network (as runtime.js loads the photo model, on the same
 * ONNX Runtime): a picture's mask in, the maps the exact search's ladder ranks
 * hidden-segment candidates by out (exact/candidates.js rankScores). Trained on
 * exact templates of the gallery and of generated pictures, with the square's
 * symmetries; docs/inverse/HYBRID-NN-SOLVER.md. A search never waits for it:
 * without its maps in time the exact search runs as before. */
export const CUTS_MODEL_SHA256='bbd773abee54b7a1f2dd97a40537f844608b66afdf1fb7dc845325ac5f2a48d9';
const modelURL=new URL('./cuts-bbd773ab.onnx',import.meta.url);
const runtimeURL=new URL('../vendor/onnxruntime-1.19.2/',import.meta.url);
const N=128;

async function fetchChecked(){
 const response=await fetch(modelURL);
 if(!response.ok)throw new Error('Cut model could not load.');
 const bytes=await response.arrayBuffer(),digest=await crypto.subtle.digest('SHA-256',bytes);
 if(Array.from(new Uint8Array(digest),v=>v.toString(16).padStart(2,'0')).join('')!==CUTS_MODEL_SHA256)throw new Error('Cut model checksum mismatch.');
 return bytes;
}

export function createCutPredictor({loadRuntime=()=>import('../vendor/onnxruntime-1.19.2/ort.module.mjs'),loadModel=fetchChecked}={}){
 let pending=null,ready=false;
 const load=()=>pending??=Promise.resolve().then(async()=>{
   const [{ort},model]=await Promise.all([loadRuntime(),loadModel()]);
   ort.env.wasm.numThreads=1;ort.env.wasm.proxy=false;ort.env.wasm.wasmPaths=runtimeURL.href;
   const session=await ort.InferenceSession.create(model,{executionProviders:['wasm']});
   ready=true;
   return{ort,session};
 }).catch(error=>{pending=null;throw error;});
 const coords=new Float32Array(2*N*N);
 for(let y=0;y<N;y++)for(let x=0;x<N;x++){coords[y*N+x]=x/(N-1);coords[N*N+y*N+x]=y/(N-1);}
 /** `source`: {mask, resolution} (a target's sourceImage, rows from the top);
  * `wait`: the most milliseconds to wait for the model's first load, after
  * which there are no maps (null). */
 const predict=async(source,{wait=Infinity}={})=>{
  const M=source?.resolution,mask=source?.mask;
  if(!Number.isInteger(M)||mask?.length!==M*M)return null;
  const model=ready||!Number.isFinite(wait)?await load():await Promise.race([load(),new Promise(resolve=>setTimeout(()=>resolve(null),wait))]);
  if(!model)return null;
  // The mask averaged onto N x N, as the network was trained, and x, y.
  const input=new Float32Array(3*N*N),edges=Array.from({length:N+1},(_,i)=>Math.floor(i*M/N));
  for(let y=0;y<N;y++)for(let x=0;x<N;x++){
   let sum=0,count=0;
   for(let v=edges[y];v<edges[y+1];v++)for(let u=edges[x];u<edges[x+1];u++){sum+=mask[v*M+u]>.5?1:0;count++;}
   input[y*N+x]=count?sum/count:0;
  }
  input.set(coords,N*N);
  const tensor=new model.ort.Tensor('float32',input,[1,3,N,N]);
  let output;
  try{
   output=await model.session.run({picture:tensor});
   const out=output.maps.data,at=c=>out.subarray(c*N*N,(c+1)*N*N),sigmoid=v=>1/(1+Math.exp(-v));
   const [vis,,pa,pb,,sw,hid,d0,d1]=Array.from({length:9},(_,c)=>at(c));
   const maps={size:N,hidden:new Float32Array(N*N),switch:new Float32Array(N*N),dir:[new Float32Array(N*N),new Float32Array(N*N)],paperA:new Float32Array(N*N),visible:new Float32Array(N*N)};
   for(let i=0;i<N*N;i++){
    maps.visible[i]=sigmoid(vis[i]);maps.switch[i]=sigmoid(sw[i]);maps.hidden[i]=sigmoid(hid[i]);
    maps.dir[0][i]=Math.tanh(d0[i]);maps.dir[1][i]=Math.tanh(d1[i]);maps.paperA[i]=1/(1+Math.exp(pb[i]-pa[i]));
   }
   return maps;
  }finally{tensor.dispose();for(const value of Object.values(output??{}))value.dispose?.();}
 };
 predict.warm=()=>{load().catch(()=>{});};
 return predict;
}

export const predictCutMaps=createCutPredictor();
