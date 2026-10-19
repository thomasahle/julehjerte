"""Export audited, matched material pilots without copying source photographs."""
import argparse
import hashlib
import json
import os
from pathlib import Path

import numpy as np

def sha(file):return hashlib.sha256(file.read_bytes()).hexdigest()
def read(file):return json.loads(file.read_bytes())


def export_preserved_body(plan_file,output):
    plan=read(plan_file);assert plan['schema']=='material-body-preservation-ablation-plan-1'
    for name in ['candidateReport','candidateAudit','body','materials','probe']:
        asset=plan[name];assert sha(Path(asset['path']))==asset['sha256'],name
    report=read(Path(plan['candidateReport']['path']));audit=read(Path(plan['candidateAudit']['path']))
    assert report['status']==audit['status']=='complete'
    assert audit['trainingReportSha256']==plan['candidateReport']['sha256']
    manifest=read(Path(plan['probe']['path']));assert manifest['status']=='complete'
    assert [r['id'] for r in manifest['rows']]==plan['ids']
    ids=plan['ids'];fields={}
    for key in ['body','materials']:
        with np.load(plan[key]['path']) as arrays:
            keys=arrays['ids'].tolist();values=arrays['probabilities']
            assert len(keys)==len(set(keys)) and set(keys)==set(ids)
            assert values.shape==(len(ids),2,256,256) and np.isfinite(values).all()
            fields[key]=dict(zip(keys,values[:,plan[key]['channel']]))
    output.mkdir(parents=True,exist_ok=False)
    source=Path(plan['probe']['path']).parent
    for row in manifest['rows']:
        identity=row['id'];assert sha(Path(row['file']))==row['photoSha256']
        # Reuse the exact candidate material field, independently checked against NPZ.
        material=row['assets']['candidate']['material'];file=source/material['path']
        expected=fields['materials'][identity].astype('<f4').tobytes()
        assert sha(file)==material['sha256'] and file.read_bytes()==expected
        material_file=output/(identity+'-material.f32');os.link(file,material_file)
        body_file=output/(identity+'-body.f32');body_file.write_bytes(fields['body'][identity].astype('<f4').tobytes())
        row['assets']={'preserved-body':{'body':{'path':body_file.name,'sha256':sha(body_file)},
            'material':{'path':material_file.name,'sha256':material['sha256']}}}
    manifest.update(methods=['preserved-body'],ablationPlan={'path':str(plan_file),'sha256':sha(plan_file)},
        scope='One globally fixed ablation on all sixteen eligible development photos. Original synthetic foreground fields plus unchanged held-out candidate material fields. No per-photo selection, ROI, annotation or template enters cropping.')
    (output/'manifest.json').write_text(json.dumps(manifest,indent=2)+'\n')
    print('Exported',len(ids),'preserved-body fields; material files hard-linked and photos reused.')


def main():
    parser=argparse.ArgumentParser(description=__doc__)
    for name in ['baseline','candidate','baseline-audit','candidate-audit','source-probe']:
        parser.add_argument('--'+name,type=Path)
    parser.add_argument('--preserve-body-plan',type=Path)
    parser.add_argument('--output',type=Path,required=True)
    args=parser.parse_args()
    if args.preserve_body_plan:
        assert not any(getattr(args,key) for key in ['baseline','candidate','baseline_audit','candidate_audit','source_probe'])
        return export_preserved_body(args.preserve_body_plan,args.output)
    assert all(getattr(args,key) for key in ['baseline','candidate','baseline_audit','candidate_audit','source_probe'])
    studies={'baseline':args.baseline,'candidate':args.candidate}
    reports={name:read(root/'report.json') for name,root in studies.items()}
    for name,root in studies.items():
        report=reports[name];assert report['status']=='complete'
        audit_path=getattr(args,name+'_audit')/'audit.json';audit=read(audit_path)
        assert audit['status']=='complete' and audit['trainingReportSha256']==sha(root/'report.json')
        for file,digest in report['artifacts'].items():assert sha(root/file)==digest,file
    for key in ['inputs','folds','drawsSha256','syntheticInputHashes','initialization','printedReplay']:
        assert reports['baseline'][key]==reports['candidate'][key],key
    ids=[r['id'] for r in reports['baseline']['inputs']]
    assert len(ids)==len(set(ids))
    probe=read(args.source_probe/'manifest.json');assert probe['status']=='complete'
    by_id={r['id']:r for r in probe['rows']};assert set(ids)<=set(by_id)
    fields={}
    for name,root in studies.items():
        with np.load(root/'mixed-out-of-fold.npz') as arrays:
            keys=arrays['ids'].tolist();values=arrays['probabilities']
            assert len(keys)==len(set(keys)) and set(keys)==set(ids)
            assert values.shape==(len(ids),2,256,256) and np.isfinite(values).all()
            fields[name]=dict(zip(keys,values))
    args.output.mkdir(parents=True,exist_ok=False)
    manifest={'schema':'woven-heart-material-probe-1','status':'running','resolution':256,'rows':[],
        'methods':['baseline','candidate'],'trainingReports':{name:{'path':str(root/'report.json'),'sha256':sha(root/'report.json')} for name,root in studies.items()},
        'sourceProbeSha256':sha(args.source_probe/'manifest.json'),
        'scope':'Matched current training-eligible photos, original complete-source/motif-held-out predictions. No annotations, supplied corners or templates enter cropping. Existing decoded RGB sources reused in place.'}
    for identity in ids:
        row={k:v for k,v in by_id[identity].items() if k!='assets'}
        assert sha(Path(row['file']))==row['photoSha256']
        row['assets']={}
        for method,mapping in fields.items():
            row['assets'][method]={}
            for channel,name in enumerate(['body','material']):
                file=args.output/(identity+'-'+method+'-'+name+'.f32');file.write_bytes(mapping[identity][channel].astype('<f4').tobytes())
                row['assets'][method][name]={'path':file.name,'sha256':sha(file)}
        manifest['rows'].append(row)
    manifest['status']='complete'
    (args.output/'manifest.json').write_text(json.dumps(manifest,indent=2)+'\n')
    print('Exported',len(ids),'paired held-out fields; no source photos copied.')


if __name__=='__main__':main()
