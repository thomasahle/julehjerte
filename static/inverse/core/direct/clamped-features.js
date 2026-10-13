/** Recover source regions blocked by the optimizer's extra side clearance.
 * Only the optional fitting cushion is searched. Every returned correction
 * must earn the ordinary source, symmetry, geometry and paper checks.
 */
import {CurveGraph} from './curves.js';
import {FITTING_CLEARANCE_CUSHION,fittingMargin} from './refine.js';
import {curvesOf} from '../graph.js';
import {sampleWeave,sampleRings,closedRings,validate} from '../validate.js';
import {materialAudit} from '../material.js';
import {imageFeatures,auditImageFeatures} from '../image-features.js';
import {auditFeatureFidelity,auditFeatureFidelityChange} from '../feature-shapes.js';
import {referenceError,sourceWeights} from '../image-reference.js';
import {symmetryTies,applyTies,symmetryReport} from './symmetry.js';
import {matchingGroups,projectMatching,matchingSummary} from './matching.js';
import {emitCandidate} from '../progress.js';

export function recoverClampedFeatures(solution,cfg,{deadline=Infinity,onProgress=()=>{}}={}){
  const input=solution.graph.target,source=input.sourceImage;
  if(!source?.mask||input.metadata?.originalCubicsPreserved||performance.now()>=deadline)return solution;
  const start=performance.now(),features=imageFeatures(source,cfg.width),originalMask=sampleWeave(solution,source.resolution);
  const originalFidelity=auditFeatureFidelity(source,originalMask,cfg,features);
  if(originalFidelity.passed)return solution;
  const originalError=referenceError(source,originalMask).mismatchFraction;
  if(originalError>cfg.maxImageError||performance.now()>=deadline)return solution;
  const graph=new CurveGraph(solution.paths.map((family,f)=>family.map((_,i)=>curvesOf(solution,f,i).map(c=>c.p))),cfg.width);
  const initial=graph.points,margin=fittingMargin(cfg,cfg.width),groups=[];
  for(const [index,feature]of features.entries()){
    const audit=originalFidelity.regions[index];
    if(audit.retainedFraction>=originalFidelity.minimumRetention&&!audit.enclosureLost)continue;
    const bounds=[[Infinity,-Infinity],[Infinity,-Infinity]],scale=cfg.width/source.resolution;
    for(const i of feature.pixels){
      const p=[(i%source.resolution+.5)*scale,(Math.floor(i/source.resolution)+.5)*scale];
      for(let axis=0;axis<2;axis++){bounds[axis][0]=Math.min(bounds[axis][0],p[axis]);bounds[axis][1]=Math.max(bounds[axis][1],p[axis]);}
    }
    for(const axis of [0,1])for(const side of [0,1]){
      if(side?bounds[axis][1]<cfg.width-margin-cfg.nominalWidth:bounds[axis][0]>margin+cfg.nominalWidth)continue;
      const limit=side?cfg.width-margin:margin,indices=new Set();
      for(const pi of graph.families[axis])for(const [e]of graph.paths[pi]){
        const ids=graph.edges[e],tangent=ids.map(id=>initial[2*id+1-axis]);
        // Handles outside the feature's box still influence its nearby span.
        // Move the active controls of an intersecting hull together.
        if(Math.max(...tangent)<bounds[1-axis][0]||Math.min(...tangent)>bounds[1-axis][1])continue;
        for(const id of ids){
          const normal=2*id+axis;
          if(!graph.fixed[normal]&&Math.abs(initial[normal]-limit)<=1e-7)indices.add(normal);
        }
      }
      if(indices.size)groups.push({feature:index,axis,side,sign:side?1:-1,indices:[...indices]});
    }
  }
  if(!groups.length||performance.now()>=deadline)return solution;
  const beforeMatching=matchingSummary(solution),ties=symmetryTies(graph,cfg.symmetry),matching=beforeMatching.identical&&!ties?matchingGroups(graph):null;
  const phase=input.phase?-1:1,report={applied:false,maximumDisplacementMm:FITTING_CLEARANCE_CUSHION,samplingGuardMm:cfg.geometryTolerance,sourceErrorBefore:originalError,missingBefore:originalFidelity.missing.length,groups:groups.length,attempts:[]};
  const fineN=2*source.resolution,weights=source.weights?sourceWeights(source):null;
  const fineRetention=(woven,feature)=>feature.pixels.reduce((sum,i)=>{
    const j=2*Math.floor(i/source.resolution)*fineN+2*(i%source.resolution);
    return sum+(weights?weights[i]:1)*([j,j+1,j+fineN,j+fineN+1].reduce((s,k)=>s+Number(woven[k]===feature.value),0)/4);
  },0)/(feature.weightMass??feature.pixels.length);
  report.areaSamplingResolution=fineN;
  let points=initial,mask=originalMask,error=originalError,fidelity=originalFidelity,result=solution;
  onProgress({stage:'directPolishing',detail:'clamped-source-feature'});
  for(const group of groups){
    if(performance.now()>=deadline||fidelity.passed)break;
    const current=fidelity.regions[group.feature];
    if(current.retainedFraction>=fidelity.minimumRetention&&!current.enclosureLost)continue;
    const previews=new Map();
    const preview=displacement=>{
      if(previews.has(displacement))return previews.get(displacement);
      if(performance.now()>=deadline)return{status:'deadline'};
      const proposalPoints=points.slice();
      for(const i of group.indices)proposalPoints[i]+=group.sign*displacement;
      const rec={feature:group.feature,axis:group.axis,side:group.side,displacementMm:displacement,coordinates:group.indices.length};report.attempts.push(rec);
      const reject=status=>{rec.status=status;return{status,recovered:rec.recovered};};
      if(ties&&!applyTies(ties,proposalPoints,proposalPoints,{fixed:graph.fixed,original:points}))return reject('symmetry');
      if(matching)projectMatching(proposalPoints,matching,graph.fixed,points);
      for(let i=0;i<proposalPoints.length;i+=2)if(Math.hypot(proposalPoints[i]-initial[i],proposalPoints[i+1]-initial[i+1])>FITTING_CLEARANCE_CUSHION+1e-8)return reject('motion_limit');
      const proposal=graph.solution(proposalPoints,phase,input),woven=sampleWeave(proposal,source.resolution);
      const region=auditImageFeatures(source,woven,cfg.width,[features[group.feature]]).regions[0];
      rec.retention=region.retainedFraction;rec.minimumSampledRetention=region.retainedFraction;
      if(region.retainedFraction>=fidelity.minimumRetention){
        // Stopping exactly as a cut crosses a pixel centre makes antialiasing
        // and curve flattening decide whether the feature survives. Require
        // its colours at both sides of the existing geometric tolerance too.
        const rings=closedRings(proposal).flat(),rasterPhase=input.phase^(proposal.paths[0].length%2)^(proposal.paths[1].length%2);
        // Source pixel centres can overstate the area of a narrow region.
        // Also sample all four quarters of its original pixels, retaining
        // their original colours and weights rather than reclassifying them.
        rec.minimumAreaRetention=fineRetention(sampleRings(rings,cfg.width,rasterPhase,fineN),features[group.feature]);
        for(const delta of [-cfg.geometryTolerance,cfg.geometryTolerance]){
          const shiftedRings=rings.map(r=>r.map(p=>p.map((v,i)=>v+(i===group.axis?delta:0))));
          const shifted=sampleRings(shiftedRings,cfg.width,rasterPhase,source.resolution);
          const retention=auditImageFeatures(source,shifted,cfg.width,[features[group.feature]]).regions[0].retainedFraction;
          rec.minimumSampledRetention=Math.min(rec.minimumSampledRetention,retention);
          rec.minimumAreaRetention=Math.min(rec.minimumAreaRetention,fineRetention(sampleRings(shiftedRings,cfg.width,rasterPhase,fineN),features[group.feature]));
        }
      }
      rec.recovered=rec.minimumSampledRetention>=fidelity.minimumRetention&&rec.minimumAreaRetention>=fidelity.minimumRetention;
      rec.status=rec.recovered?'proposed':'feature';
      const value={proposalPoints,proposal,woven,rec,recovered:rec.recovered,status:rec.status};previews.set(displacement,value);return value;
    };
    const verify=value=>{
      if(!value.recovered)return value;
      const {proposalPoints,proposal,woven,rec}=value;
      const reject=status=>{rec.status=status;return{status,recovered:rec.recovered};};
      if(performance.now()>=deadline)return reject('deadline');
      const after=auditFeatureFidelity(source,woven,cfg,features);
      if(after.regions[group.feature].enclosureLost)return reject('feature_shape');
      const nextError=referenceError(source,woven).mismatchFraction;rec.sourceError=nextError;
      if(nextError>error||nextError>cfg.maxImageError)return reject('image');
      if(!auditFeatureFidelityChange(source,mask,woven,cfg,features).passed)return reject('other_features');
      if(performance.now()>=deadline)return reject('deadline');
      const symmetry=symmetryReport(proposal,cfg.symmetry);
      if(symmetry.honoured.length!==symmetry.requested.length||beforeMatching.identical&&!matchingSummary(proposal).identical)return reject('symmetry');
      const geometry=validate(proposal,cfg,{checkImage:false});
      if(!geometry.passed){rec.issues=geometry.issues.slice(0,4);return reject('geometry');}
      if(performance.now()>=deadline)return reject('deadline');
      const paper=materialAudit(proposal,cfg);rec.paper=paper.status;
      if(!paper.passed)return reject('paper');
      // Intermediate corrections may repair one of several missing regions.
      // They stay local until every original source feature has recovered.
      points=proposalPoints;mask=woven;error=nextError;fidelity=after;result=proposal;rec.status='accepted';rec.allFeaturesPassed=after.passed;
      return{status:'accepted',recovered:true};
    };
    let previous=0,previousRecovered=false;
    for(let step=1;step<=4&&performance.now()<deadline;step++){
      const amount=FITTING_CLEARANCE_CUSHION*step/4,attempt=preview(amount);
      if(attempt.status==='deadline')break;
      if(attempt.recovered&&!previousRecovered){
        // Locate the first colour-restoring motion before the expensive paper
        // check. Overshooting can lose a narrow but valid clearance interval.
        // This is a proposal search only: full fidelity and physics follow.
        let lo=previous,hi=amount;
        for(let i=0;i<6&&performance.now()<deadline;i++){
          const middle=(lo+hi)/2,value=preview(middle);
          if(value.status==='deadline')break;
          if(value.recovered)hi=middle;else lo=middle;
        }
        const checked=verify(preview(hi));
        if(checked.status==='accepted'||checked.status==='deadline')break;
      }
      const checked=verify(attempt);
      if(checked.status==='accepted'||checked.status==='deadline')break;
      previous=amount;previousRecovered=attempt.recovered;
    }
  }
  report.applied=fidelity.passed;report.proposedSourceError=error;report.proposedMissing=fidelity.missing.length;
  report.sourceErrorAfter=report.applied?error:originalError;report.missingAfter=report.applied?0:originalFidelity.missing.length;report.seconds=(performance.now()-start)/1000;
  if(!report.applied)return{...solution,report:{...solution.report,clampedFeatureRecovery:report}};
  const preference=solution.report.matchingPreference;
  result.report={...solution.report,clampedFeatureRecovery:report,sourceFeaturesPassed:true,estimatedMaskMismatch:error,
    stages:[...(solution.report.stages||[]),{stage:'directPolishing',detail:'clamped-source-feature',seconds:report.seconds}],
    ...(preference?{matchingPreference:{...preference,...matchingSummary(result),selectedImageError:error,
      ...(Number.isFinite(preference.baselineImageError)?{additionalImageError:error-preference.baselineImageError}:{})}}:{})};
  emitCandidate(onProgress,{stage:'directPolishing',error,geometry:true,paper:'pass'},result);
  return result;
}
