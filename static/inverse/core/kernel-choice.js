/** Select an optional kernel from repeated measurements of the current input.
 * Keep only bounded timing records. Comparisons happen outside the timers;
 * every result in a timed batch must agree before the native kernel is used.
 */
export function measuredKernel(equal,{now=()=>performance.now(),key=size=>Math.floor(Math.log2(size)),describe=size=>({size}),repetitions=1}={}){
  if(!Number.isInteger(repetitions)||repetitions<1||repetitions>64)throw new RangeError('Kernel timing requires 1–64 repetitions.');
  const choices=new Map();
  const remember=(bucket,value)=>{choices.set(bucket,value);if(choices.size>8)choices.delete(choices.keys().next().value);};
  return{
    run(size,javascript,native){
      const bucket=key(size),selected=choices.get(bucket);
      if(selected)return selected.backend==='wasm'?native():javascript();
      const details={...describe(size),...(repetitions>1?{timingRepetitions:repetitions}:{})};
      const warm=javascript(),candidate=native();
      if(!equal(warm,candidate)){remember(bucket,{...details,backend:'javascript',reason:'different_results'});return warm;}
      const timings=[];let result=warm;
      for(let round=0;round<2;round++){
        const values={},times={};
        for(const name of round?['wasm','javascript']:['javascript','wasm']){
          const batch=[],run=name==='wasm'?native:javascript,start=now();
          for(let i=0;i<repetitions;i++)batch.push(run());
          times[name]=(now()-start)/repetitions;values[name]=batch;
        }
        result=values.javascript.at(-1);
        if(!values.javascript.every((value,i)=>equal(value,values.wasm[i]))){remember(bucket,{...details,backend:'javascript',reason:'different_results'});return result;}
        timings.push(times);
      }
      // Require a repeated gain. Tied/coarse clocks and inconsistent timings
      // retain the reference implementation; there is no browser-name policy.
      const faster=timings.every(t=>t.wasm<t.javascript*.9);
      remember(bucket,{...details,backend:faster?'wasm':'javascript',reason:faster?'measured_faster':'no_consistent_gain',timings});
      return result;
    },
    report(){return[...choices.values()].map(v=>({...v,timings:v.timings?.map(t=>({...t}))}));}
  };
}
export const sameArray=(a,b)=>!!a&&!!b&&a.length===b.length&&a.every((v,i)=>Object.is(v,b[i]));
