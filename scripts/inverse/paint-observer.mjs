/** Browser-only QA hooks. Both functions are serialized by Playwright, so
 * their bodies deliberately have no dependencies on the surrounding module.
 */
export function installPaintObservation(){
  const qa=window.__paintQA={result:null,error:null,prepared:null,marks:null,solveSettings:null};
  window.addEventListener('error',event=>{qa.error={type:'pageerror',message:event.message};if(qa.marks)qa.marks.failed=performance.now();});
  const NativeWorker=window.Worker;let pending=new WeakMap(),observer=null;
  const enabled=button=>button&&!button.matches(':disabled')&&button.getAttribute('aria-disabled')!=='true';
  const checkReady=()=>{
    if(!qa.result||qa.marks?.ready!==null)return;
    const button=[...document.querySelectorAll('button')].find(b=>b.textContent.trim()==='Open in Draw');
    if(!enabled(button)||!button.getClientRects().length)return;
    const style=getComputedStyle(button);
    if(style.visibility==='hidden'||style.visibility==='collapse'||style.opacity==='0')return;
    qa.marks.ready=performance.now();observer?.disconnect();observer=null;
  };
  document.addEventListener('click',event=>{
    const button=event.target?.closest?.('button');
    if(!enabled(button)||!['Find the cuts','Try again'].includes(button.textContent.trim()))return;
    observer?.disconnect();observer=null;pending=new WeakMap();
    qa.result=null;qa.error=null;qa.prepared=null;qa.solveSettings=null;
    qa.marks={click:performance.now(),prepareSent:null,prepared:null,solveSent:null,result:null,ready:null,failed:null};
  },true);
  window.Worker=class extends NativeWorker{
    constructor(...args){
      super(...args);
      this.addEventListener('message',({data})=>{
        const requests=pending.get(this),action=requests?.get(data.id);
        if(!action||!qa.marks)return;
        if(data.type==='error'){
          requests.delete(data.id);qa.marks.failed=performance.now();qa.error=data;return;
        }
        if(action==='prepare'&&data.type==='prepared'){
          requests.delete(data.id);qa.marks.prepared=performance.now();qa.prepared=data.preview;
        }else if(action==='solve'&&data.type==='result'){
          requests.delete(data.id);qa.marks.result=performance.now();qa.result=data.result;
          // Observe only after the worker replies. Progress text updates need
          // no DOM scans, and typed masks are copied only after readiness.
          observer=new MutationObserver(checkReady);
          observer.observe(document.documentElement,{subtree:true,childList:true,characterData:true,attributes:true});
          checkReady();
        }
      });
    }
    postMessage(data,...rest){
      if(qa.marks&&qa.marks.ready===null&&(data.action==='prepare'||data.action==='solve')){
        let requests=pending.get(this);if(!requests){requests=new Map();pending.set(this,requests);}
        if(data.action==='solve')qa.solveSettings={...data.settings};
        requests.set(data.id,data.action);qa.marks[data.action==='prepare'?'prepareSent':'solveSent']=performance.now();
      }
      return super.postMessage(data,...rest);
    }
  };
}

/** Collect only after readiness (or an error). Serialization, screenshots and
 * Node file writes cannot extend the browser timestamps already recorded.
 */
export function collectPaintObservation(){
  const {result,error,prepared,marks,solveSettings}=window.__paintQA;
  const seconds=(start,end)=>marks?.[start]===null||marks?.[end]===null||!marks?null:(marks[end]-marks[start])/1000;
  return{result,error,solveSettings,prepared:prepared?{mask:Array.from(prepared.mask),resolution:prepared.resolution,weights:prepared.weights?Array.from(prepared.weights):null}:null,
    marks:marks&&{...marks},timings:{
      clickToPrepareRequestSeconds:seconds('click','prepareSent'),
      prepareRoundTripSeconds:seconds('prepareSent','prepared'),
      preparedToSolveRequestSeconds:seconds('prepared','solveSent'),
      solveRoundTripSeconds:seconds('solveSent','result'),
      resultToReadySeconds:seconds('result','ready'),
      clickToReadySeconds:seconds('click','ready')
    }};
}
