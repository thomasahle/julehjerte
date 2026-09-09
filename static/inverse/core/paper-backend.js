/** Choose an optional accelerator from its measured cost, without browser
 * detection. Reference and native outputs must agree before native is used.
 * Retain small timing records by lattice-size bucket, never input/result data.
 */
export function paperBackend(equal,{now=()=>performance.now()}={}){
  const choices=new Map();
  const remember=(bucket,value)=>{choices.set(bucket,value);if(choices.size>8)choices.delete(choices.keys().next().value);};
  return{
    run(cells,javascript,native){
      const bucket=Math.floor(Math.log2(cells)),selected=choices.get(bucket);
      if(selected)return selected.backend==='wasm'?native():javascript();
      const warm=javascript(),candidate=native();
      if(!equal(warm,candidate)){remember(bucket,{cells,backend:'javascript',reason:'different_results'});return warm;}
      const timings=[];let result=warm;
      for(let round=0;round<2;round++){
        const values={},times={};
        for(const name of round?['wasm','javascript']:['javascript','wasm']){
          const start=now();values[name]=(name==='wasm'?native:javascript)();times[name]=now()-start;
        }
        result=values.javascript;
        if(!equal(result,values.wasm)){remember(bucket,{cells,backend:'javascript',reason:'different_results'});return result;}
        timings.push(times);
      }
      // Require a clear, repeated gain; coarse clocks and a noisy first call
      // should not lock a worker into a slower implementation.
      const faster=timings.every(t=>t.wasm<t.javascript*.9);
      remember(bucket,{cells,backend:faster?'wasm':'javascript',reason:faster?'measured_faster':'no_consistent_gain',timings});
      return result;
    },
    report(){return[...choices.values()].map(v=>({...v,timings:v.timings?.map(t=>({...t}))}));}
  };
}
export const sameArray=(a,b)=>!!a&&!!b&&a.length===b.length&&a.every((v,i)=>Object.is(v,b[i]));
export const sameCore=(a,b)=>!!a&&!!b&&sameArray(a.labels,b.labels)&&a.parts.length===b.parts.length&&a.parts.every((p,i)=>{
  const q=b.parts[i];return p.id===q.id&&p.anchored===q.anchored&&p.area===q.area&&p.significant===q.significant;
})&&a.anchors.size===b.anchors.size&&[...a.anchors].every(id=>b.anchors.has(id))&&a.floating.length===b.floating.length&&a.floating.every((p,i)=>p.id===b.floating[i].id);
