/* Classic worker bootstrap, with ES modules loaded inside the worker.
 * Queue early messages so module initialization cannot lose the first job. */
let pending=[];
self.onmessage=event=>pending.push(event);
import(new URL('./worker.js',self.location.href).href).then(()=>{
  const handle=self.onmessage,queued=pending;pending=[];
  for(const event of queued)handle(event);
}).catch(error=>{
  for(const event of pending)self.postMessage({id:event.data.id,type:'error',message:'Worker initialization failed: '+(error.message||String(error))});
  pending=[];
  self.onmessage=event=>self.postMessage({id:event.data.id,type:'error',message:'Worker initialization failed. Reload the page and check local assets.'});
});
