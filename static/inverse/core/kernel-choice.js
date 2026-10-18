/** Select an optional kernel using paired measurements of the same input.
 * Calibration can be batched on one request or spread across two requests.
 * Every measured native result must agree; retain only bounded timing records.
 */
export function measuredKernel(equal,{now=()=>performance.now(),key=size=>Math.floor(Math.log2(size)),describe=size=>({size}),repetitions=1,minimumBatchMilliseconds=0,quickDecision=false,calibrateAcrossCalls=false}={}){
  if(!Number.isInteger(repetitions)||repetitions<1||repetitions>64)throw new RangeError('Kernel timing requires 1–64 repetitions.');
  if(!Number.isFinite(minimumBatchMilliseconds)||minimumBatchMilliseconds<0||minimumBatchMilliseconds>100)throw new RangeError('Kernel timing requires a batch target between 0 and 100 milliseconds.');
  if(typeof calibrateAcrossCalls!=='boolean'||calibrateAcrossCalls&&(repetitions!==1||minimumBatchMilliseconds!==0||quickDecision))throw new RangeError('Cross-call calibration requires single-call timing without batching.');
  const choices=new Map();
  const remember=(bucket,value)=>{choices.set(bucket,value);if(choices.size>8)choices.delete(choices.keys().next().value);};
  return{
    run(size,javascript,native){
      const bucket=key(size);let selected=choices.get(bucket),retried=!!selected?.retriedAfterClockAdvance;
      // A suspended/coarse clock provides no performance evidence. Retry once
      // when it advances instead of permanently disabling a useful kernel.
      // Numerical disagreements and actual speed measurements remain final.
      if(selected?.retryAfterClock!==undefined&&now()>selected.retryAfterClock){selected=null;retried=true;}
      if(selected&&!selected.calibrating)return selected.backend==='wasm'?native():javascript();
      const rememberChoice=value=>remember(bucket,{...value,...(retried?{retriedAfterClockAdvance:true}:{}),
        ...(!retried&&value.reason==='no_consistent_gain'&&value.timings.every(t=>t.javascript===0&&t.wasm===0)?{retryAfterClock:now()}:{})});
      const quick=quickDecision&&minimumBatchMilliseconds>0&&repetitions>1;
      const details={...describe(size),...(minimumBatchMilliseconds?{maximumTimingRepetitions:repetitions,minimumBatchMilliseconds}:repetitions>1?{timingRepetitions:repetitions}:{}),...(quick?{quickDecision:true}:{})};
      if(calibrateAcrossCalls){
        // Each actual request supplies one paired observation. Reverse order
        // on the next request; retain timings only, never inputs or results.
        const values={},timing={};
        for(const name of selected?['wasm','javascript']:['javascript','wasm']){
          const start=now();values[name]=(name==='wasm'?native:javascript)();timing[name]=now()-start;
        }
        const timings=[...(selected?.timings||[]),timing],details={...describe(size),calibrationCalls:2};
        if(!equal(values.javascript,values.wasm))rememberChoice({...details,backend:'javascript',reason:'different_results',timings});
        else if(timings.length<2)rememberChoice({...details,backend:'javascript',reason:'awaiting_second_input',calibrating:true,timings});
        else{
          const faster=timings.every(t=>t.wasm<t.javascript*.9);
          rememberChoice({...details,backend:faster?'wasm':'javascript',reason:faster?'measured_faster':'no_consistent_gain',timings});
        }
        return values.javascript;
      }
      const warm=javascript(),candidate=native();
      if(!equal(warm,candidate)){rememberChoice({...details,backend:'javascript',reason:'different_results'});return warm;}
      const measure=(limit,minimum)=>{
        const timings=[];let result=warm;
        for(let round=0;round<2;round++){
          const values={},times={},counts={};
          for(const name of round?['wasm','javascript']:['javascript','wasm']){
            const batch=[],run=name==='wasm'?native:javascript,start=now();
            let elapsed=0;
            for(let i=0;i<limit;i++){
              batch.push(run());
              if(minimum){elapsed=now()-start;if(elapsed>=minimum)break;}
            }
            times[name]=(minimum?elapsed:now()-start)/batch.length;values[name]=batch;counts[name]=batch.length;
          }
          result=values.javascript.at(-1);
          // Adaptive batches may contain different numbers of calls. Every
          // result must agree with the same reference, not just the last pair.
          if(!Object.values(values).every(batch=>batch.every(value=>equal(value,warm))))return{result,valid:false};
          if(minimum)times.repetitions=counts;
          timings.push(times);
        }
        return{result,timings,valid:true};
      };
      let measured=measure(quick?1:repetitions,quick?0:minimumBatchMilliseconds),initialTimings;
      if(quick&&measured.valid){
        // Preserve cheap, decisive measurements. Resolve zero/tied clocks or
        // a gain that appeared in only one order with a longer, bounded batch.
        const t=measured.timings,gains=t.map(t=>t.wasm<t.javascript*.9);
        if(t.some(t=>t.javascript===0||t.wasm===0||t.javascript===t.wasm)||gains[0]!==gains[1]){
          initialTimings=t;measured=measure(repetitions,minimumBatchMilliseconds);
        }
      }
      const {result,timings,valid}=measured;
      const refinement=initialTimings?{initialTimings}:{};
      if(!valid){rememberChoice({...details,...refinement,backend:'javascript',reason:'different_results'});return result;}
      // Require a repeated gain. Tied/coarse clocks and inconsistent timings
      // retain the reference implementation; there is no browser-name policy.
      const faster=timings.every(t=>t.wasm<t.javascript*.9);
      rememberChoice({...details,...refinement,backend:faster?'wasm':'javascript',reason:faster?'measured_faster':'no_consistent_gain',timings});
      return result;
    },
    report(){return[...choices.values()].map(v=>({...v,...(v.initialTimings?{initialTimings:v.initialTimings.map(t=>({...t}))}:{}),timings:v.timings?.map(t=>({...t,...(t.repetitions?{repetitions:{...t.repetitions}}:{})}))}));}
  };
}
export function sameArray(a,b){
  if(!a||!b||a.length!==b.length)return false;
  // Calibration compares large dense numeric fields repeatedly. Avoid a
  // callback per element, retaining Object.is for NaN and signed zero.
  if(a.length&&ArrayBuffer.isView(a)){
    for(let i=0;i<a.length;i++)if(!Object.is(a[i],b[i]))return false;
    return true;
  }
  // Keep Array.every's sparse-array and empty typed-array semantics.
  return a.every((v,i)=>Object.is(v,b[i]));
}
