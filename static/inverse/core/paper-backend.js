/** Paper-specific report fields for the common measured-kernel selector. */
import {measuredKernel,sameArray} from './kernel-choice.js';
export {sameArray};
export const paperBackend=(equal,options={})=>measuredKernel(equal,{...options,describe:cells=>({cells})});
export const sameCore=(a,b)=>!!a&&!!b&&sameArray(a.labels,b.labels)&&a.parts.length===b.parts.length&&a.parts.every((p,i)=>{
  const q=b.parts[i];return p.id===q.id&&p.anchored===q.anchored&&p.area===q.area&&p.significant===q.significant;
})&&a.anchors.size===b.anchors.size&&[...a.anchors].every(id=>b.anchors.has(id))&&a.floating.length===b.floating.length&&a.floating.every((p,i)=>p.id===b.floating[i].id);
