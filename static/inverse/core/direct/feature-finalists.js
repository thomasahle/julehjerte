/** Prefer an existing grid that improves an imperfect image without losing
 * any region the incumbent already represents. This schedules refinement;
 * it does not certify curves, paper support or complete image fidelity.
 */
import {gridMask} from './grid.js';
import {auditFeatureFidelity,auditFeatureFidelityChange} from '../feature-shapes.js';

export function featureImprovingFinalist(source,finalists,cfg,features){
  const first=finalists[0],before=gridMask(first.model,source.resolution,first.phase,first.floor);
  const audit=auditFeatureFidelity(source,before,cfg,features),attempts=[];
  let selected=null;
  for(const candidate of finalists.slice(1).filter(r=>r.error<first.error).sort((a,b)=>a.error-b.error)){
    const after=gridMask(candidate.model,source.resolution,candidate.phase,candidate.floor);
    const next=auditFeatureFidelity(source,after,cfg,features),change=auditFeatureFidelityChange(source,before,after,cfg,features);
    const preferred=next.missing.length<audit.missing.length&&change.passed;
    attempts.push({counts:candidate.model.counts,error:candidate.error,missing:next.missing.length,change,preferred});
    if(preferred){selected=candidate;break;}
  }
  return{selected,report:{beforeCounts:first.model.counts,beforeError:first.error,beforeMissing:audit.missing.length,attempts,
    selectedCounts:selected?.model.counts??null}};
}
