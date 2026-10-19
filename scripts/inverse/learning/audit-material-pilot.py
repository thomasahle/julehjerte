"""Independently audit grouped material weights, predictions and observed errors."""
import argparse, copy, hashlib, html, json, sys
from pathlib import Path
import numpy as np
from PIL import Image, ImageDraw
import torch

ROOT = Path(__file__).resolve().parents[3]
sys.path[:0] = [str(ROOT/'scripts/inverse/learning'), str(ROOT/'scripts/inverse/datasets')]
from foreground import load_foreground_run
from material_transfer import material_from_foreground
from real_materials_learning import load_material_labels
from material_pilot import material_replay
from material_prints import load_printed_replay
from real_finetune import grouped_folds


def sha(data): return hashlib.sha256(data).hexdigest()
def read(file): return json.loads(Path(file).read_text())
def write(file, value): Path(file).write_text(json.dumps(value, indent=2)+'\n')


def align(file, identities):
    with np.load(file) as archive:
        ids = archive['ids'].tolist(); values = archive['probabilities']
        assert len(set(ids)) == len(ids) and set(ids) == set(identities)
        assert values.shape == (len(ids), 2, 256, 256)
        assert np.isfinite(values).all() and ((values >= 0) & (values <= 1)).all()
        return np.stack([values[ids.index(i)] for i in identities])


def independent_metrics(probabilities, items):
    """Direct confusion/weighted-mass accounting; do not call training metrics."""
    rows = []
    for p, item in zip(probabilities, items):
        body, materials = item['body'], item['materials']
        known = body != 255; actual = body == 1; bg = body == 0; observed = materials != 255
        pb, pm = p >= .5
        union = np.count_nonzero((pb | actual) & known)
        target = materials[observed].astype(float); predicted = pm[observed]
        direct_wrong = np.abs(predicted.astype(float)-target)
        exchanged = bool(direct_wrong.sum() > (1-direct_wrong).sum())
        if exchanged: predicted = ~predicted
        wrong = np.abs(predicted.astype(float)-target)
        joint = 1 - pb[observed]*(1-wrong)
        per_material = {}
        for label, weight, error in [('A', 1-target, predicted), ('B', target, ~predicted)]:
            mass = float(weight.sum())
            per_material[label] = {'observedMass': mass,
                'materialError': float(np.dot(weight, error)/mass) if mass else None,
                'jointError': float(np.dot(weight, 1-pb[observed]*(1-error.astype(float)))/mass) if mass else None}
        rows.append({'id': item['id'], 'bodyIoU': float(np.count_nonzero(pb & actual)/union) if union else 1.,
            'bodyPixelError': float(np.count_nonzero((pb != actual) & known)/known.sum()),
            'bodyFalseNegative': float(np.count_nonzero(~pb & actual)/actual.sum()) if actual.any() else None,
            'backgroundFalsePositive': float(np.count_nonzero(pb & bg)/bg.sum()) if bg.any() else None,
            'materialPhaseExchanged': exchanged, 'materialPixelError': float(wrong.mean()),
            'materialJointError': float(joint.mean()),
            'jointRegionPixelError': float((np.count_nonzero(pb & bg)+joint.sum())/(bg.sum()+observed.sum())),
            'perMaterial': per_material,
            'balancedMaterialJointError': float(np.mean([r['jointError'] for r in per_material.values() if r['jointError'] is not None]))})
    keys = ['bodyIoU','bodyPixelError','bodyFalseNegative','backgroundFalsePositive','materialPixelError',
            'materialJointError','jointRegionPixelError','balancedMaterialJointError']
    return {'rows': rows, 'macroMean': {k: float(np.mean([r[k] for r in rows if r[k] is not None])) for k in keys}}


def confirm_metrics(actual, expected):
    for key, value in actual['macroMean'].items():
        np.testing.assert_allclose(value, expected['macroMean'][key], rtol=0, atol=1e-12, err_msg=key)
    by_id = {r['id']: r for r in expected['rows']}
    for row in actual['rows']:
        reference = by_id[row['id']]
        for key, value in row.items():
            if key == 'id': continue
            if key == 'perMaterial':
                for paper, details in value.items():
                    for metric, number in details.items():
                        if number is None: assert reference[key][paper][metric] is None
                        else: np.testing.assert_allclose(number, reference[key][paper][metric], rtol=0, atol=1e-12)
            elif value is None: assert reference[key] is None
            else: np.testing.assert_allclose(value, reference[key], rtol=0, atol=1e-12, err_msg=key)


def infer(model, items):
    result=[]; model.eval()
    with torch.no_grad():
        for start in range(0,len(items),4):
            batch=np.stack([i['rgb'].transpose(2,0,1) for i in items[start:start+4]])
            result.extend(model(torch.from_numpy(batch.copy()).float()/255).sigmoid().numpy())
    return np.stack(result)


def classes(body, material, known=None):
    colors=np.array([[55,55,55],[25,125,210],[245,180,40]],np.uint8)
    labels=np.where(body, np.where(material,2,1),0)
    rgb=colors[labels]
    if known is not None: rgb[~known]=[210,210,210]
    return Image.fromarray(rgb)


def gallery(out, items, probabilities, metrics):
    sections=[]
    for index,item in enumerate(items):
        identity=item['id']; board=Image.new('RGB',(4*256,3*292),(255,255,255)); draw=ImageDraw.Draw(board)
        contexts=[(Image.fromarray(item['rgb']),'Photograph'),
            (classes(item['body']==1,np.zeros((256,256),bool),item['body']!=255),'Known body; gray = unknown'),
            (classes(item['body']==1,item['materials']>=.5,item['materials']!=255),'Partial paper labels'),
            (Image.fromarray(np.uint8(np.repeat((item['materials']!=255)[:,:,None],3,2)*255)),'Material scoring region')]
        for col,(picture,label) in enumerate(contexts):
            board.paste(picture,(col*256,24));draw.text((col*256+5,5),label,fill='black')
        for row,method in enumerate(['synthetic-control','mixed-out-of-fold'],1):
            p=probabilities[method][index]; score=metrics[method]['rows'][index]
            paper=p[1] if not score['materialPhaseExchanged'] else 1-p[1]
            panels=[(Image.fromarray(np.uint8(np.clip(p[0]*255,0,255))).convert('RGB'),'Body probability'),
                (Image.fromarray(np.uint8(np.clip(paper*255,0,255))).convert('RGB'),'Paper B probability (phase aligned)'),
                (classes(p[0]>=.5,paper>=.5),'Body + materials at 0.5'),
                (classes(p[0]>=.5,paper>=.5,item['materials']!=255),'Predictions in observed regions')]
            for col,(picture,label) in enumerate(panels):
                board.paste(picture,(col*256,row*292+24));draw.text((col*256+5,row*292+5),label,fill='black')
            draw.text((5,row*292+282),f'{method}: body IoU {score["bodyIoU"]:.3f}; material error {score["materialPixelError"]:.3f}; joint error {score["materialJointError"]:.3f}',fill='black')
        filename=identity+'.png';board.save(out/filename)
        sections.append('<section><h2>'+html.escape(identity+' '+str(item['motif']))+'</h2><img src="'+filename+'" alt="Photo, partial labels, and material predictions"></section>')
    (out/'index.html').write_text('<!doctype html><meta charset="utf-8"><title>Material pilot review</title><style>body{font:16px system-ui;margin:24px}img{max-width:100%}section{margin:30px 0}</style><h1>Material pilot: grouped development comparison</h1><p>Blue/gold represent exchangeable papers. Dark gray is predicted background; light gray is unlabelled. The paper phase is aligned once over all observed material pixels, independently of predicted body. Predictions are not cutting templates.</p>'+''.join(sections))


def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--study',type=Path,required=True);parser.add_argument('--output',type=Path,required=True);parser.add_argument('--plan',type=Path,required=True)
    args=parser.parse_args();torch.set_num_interop_threads(1)
    raw=(args.study/'report.json').read_bytes();report=json.loads(raw)
    assert report['schema']=='woven-heart-material-pilot-1' and report['status']=='complete'
    torch.set_num_threads(report['plan']['protocol']['threads'])
    for file,digest in {**report['sourceHashes'],**report['inputPins']}.items(): assert sha(Path(file).read_bytes())==digest,file
    for file,digest in report['artifacts'].items(): assert sha((args.study/file).read_bytes())==digest,file
    assert sha(args.plan.read_bytes())==report['planSha256']
    items=[]
    for entry in report['labelAudits']:
        selected,audit=load_material_labels(entry['directory'],ROOT/report['plan']['sourceManifest'],ROOT/entry['annotations'],ROOT)
        for key,value in audit.items(): assert entry[key]==value,key
        items.extend(selected)
    inputs=[{k:i[k] for k in ['id','splitGroupId','nearDuplicateGroup','motif']} |
            {k+'Sha256':sha(i[k].tobytes()) for k in ['rgb','body','materials']} for i in items]
    assert inputs==report['inputs']
    combined={'manifestSha256':sha(json.dumps([a['manifestSha256'] for a in report['labelAudits']]).encode()),
              'annotationsSha256':sha(json.dumps([r['sha256'] for r in report['plan']['labelSources']]).encode())}
    assert report['resolvedFoldPlan']['groups']==report['plan']['groups']
    assert grouped_folds(items,combined,report['resolvedFoldPlan'])==report['folds']
    by_id={i['id']:i for i in items};identities=list(by_id);protocol=report['plan']['protocol']
    original,training=load_foreground_run(ROOT/report['plan']['initialRun']);original.initialization=copy.deepcopy(training['initialization'])
    initial=material_from_foreground(original)
    initial_state=copy.deepcopy(initial.state_dict())
    synthetic,replay=material_replay(training,protocol['syntheticReplayGeometries'])
    assert replay==report['syntheticReplay']
    assert {i['id']:{k:sha(i[k].tobytes()) for k in ['rgb','body','materials']} for i in synthetic}==report['syntheticInputHashes']
    printed={}
    print_draws=None
    if protocol.get('printedReplay'):
        printed,record=load_printed_replay(synthetic,protocol['printedReplay'])
        assert record==report['printedReplay']['inputs']
        choices=np.random.default_rng(protocol['seed'] ^ 0x510e527f).integers(6,size=(protocol['updates'],4))
        print_draws=np.where(choices<3,choices,-1).tolist()
        assert print_draws==report['printedReplay']['draws']
    draws_raw=(args.study/'draws.json').read_bytes();assert sha(draws_raw)==report['drawsSha256'];draws=json.loads(draws_raw)
    rng=np.random.default_rng(protocol['seed'])
    expected=[{'synthetic':rng.integers(len(synthetic),size=4).tolist(),'realQuantiles':rng.random(2).tolist(),'flips':(rng.random(2)<.5).tolist()} for _ in range(protocol['updates'])]
    assert draws==expected
    probabilities={'neutral':align(args.study/'neutral-predictions.npz',identities)}
    np.testing.assert_allclose(infer(initial,items),probabilities['neutral'],rtol=0,atol=1e-7)
    checked=[];mixed={}
    runs=[{'id':'synthetic-control','train':[],'heldOut':identities}]+report['folds']
    assert set(report['runs'])=={r['id'] for r in runs}
    for definition in runs:
        name=definition['id'];entry=report['runs'][name];train=definition['train'];held=definition['heldOut']
        assert entry['status']=='complete' and entry['updates']==protocol['updates']
        assert entry['trainIds']==train and entry['heldOutIds']==held and not(set(train)&set(held))
        batches=[]
        for step,d in enumerate(draws):
            chosen=[synthetic[j]['id'] for j in d['synthetic'][:2 if train else 4]]
            if print_draws is not None:
                chosen=[printed[identity][choice]['id'] if choice>=0 and identity in printed else identity for identity,choice in zip(chosen,print_draws[step])]
            if train: chosen += [train[min(len(train)-1,int(q*len(train)))] for q in d['realQuantiles']]
            assert not(set(chosen)&set(held));batches.append(chosen)
        assert batches==entry['sampledIds']
        checkpoint=args.study/name/'model.pt';assert sha(checkpoint.read_bytes())==entry['checkpointSha256']
        state=torch.load(checkpoint,map_location='cpu',weights_only=True)
        tail=protocol.get('encoderTailBlocks',0)
        assert type(tail) is int and 0<=tail<len(initial.encoder)
        parameter_names=set(dict(initial.named_parameters()))
        allowed={key for key in parameter_names if not key.startswith('encoder.') or int(key.split('.')[1])>=len(initial.encoder)-tail}
        if 'trainingPolicy' in entry:
            assert set(entry['trainingPolicy']['trainableNames'])==allowed
            assert entry['trainingPolicy']['tailBlocks']==tail
            assert entry['initialFrozenStateSha256']==entry['finalFrozenStateSha256']
        for key,value in initial_state.items():
            if key not in allowed: assert torch.equal(value,state[key]),key
        encoder_same=all(torch.equal(value,state[key]) for key,value in initial_state.items() if key.startswith('encoder.'))
        if not tail: assert encoder_same
        model=copy.deepcopy(initial);model.load_state_dict(state,strict=True)
        subset=[by_id[i] for i in held];archived=align(args.study/name/'predictions.npz',held)
        actual=infer(model,subset);np.testing.assert_allclose(actual,archived,rtol=0,atol=1e-7)
        score=independent_metrics(archived,subset);confirm_metrics(score,entry['metrics'])
        checked.append({'run':name,'updates':len(draws),'heldOutIds':held,'sourceSeparationPassed':True,
            'encoderTensorsIdentical':encoder_same,'frozenParametersAndAllBuffersIdentical':True,
            'trainableEncoderTailBlocks':tail,'checkpointPredictionsMaxAbsoluteDifference':float(np.max(abs(actual-archived)))})
        if train: mixed.update(dict(zip(held,archived)))
        else: probabilities[name]=archived
    assert set(mixed)==set(identities)
    probabilities['mixed-out-of-fold']=align(args.study/'mixed-out-of-fold.npz',identities)
    np.testing.assert_array_equal(probabilities['mixed-out-of-fold'],np.stack([mixed[i] for i in identities]))
    metrics={method:independent_metrics(p,items) for method,p in probabilities.items()}
    confirm_metrics(metrics['neutral'],report['neutralMetrics']);confirm_metrics(metrics['mixed-out-of-fold'],report['mixedOutOfFoldMetrics'])
    args.output.mkdir(parents=True,exist_ok=False)
    gallery(args.output,items,probabilities,metrics)
    result={'schema':'woven-heart-material-pilot-audit-1','status':'complete','trainingReportSha256':sha(raw),
        'auditImplementationSha256':sha(Path(__file__).read_bytes()),'checkedRuns':checked,'metrics':metrics,
        'scope':'Independent checkpoint inference and observed-region accounting. Grouped development pilot only; no full-mask, crop or template success claim.',
        'artifacts':{str(p.relative_to(args.output)):sha(p.read_bytes()) for p in args.output.glob('*') if p.is_file()}}
    write(args.output/'audit.json',result)
    print(json.dumps({m:r['macroMean'] for m,r in metrics.items()},indent=2))

if __name__=='__main__':main()
