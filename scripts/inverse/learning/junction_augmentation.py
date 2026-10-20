"""Matched, bounded continuation of the existing offline corner proposal model."""
import argparse
from collections import OrderedDict
import hashlib
import json
from pathlib import Path
import shutil
import time

import numpy as np
from PIL import Image, ImageDraw
import torch

from data import Corpus, checked_asset, training_supplements
from losses import LOSSES
from model import ProposalNet
from train import tensors


def digest(raw):
    return hashlib.sha256(raw).hexdigest()


def reference(file):
    file = Path(file)
    return {'path': str(file), 'sha256': digest(file.read_bytes())}


def pinned(ref):
    file = Path(ref['path'])
    assert digest(file.read_bytes()) == ref['sha256'], str(file)
    return file


def load_inputs(row, root):
    with Image.open(checked_asset(root, row['assets']['rgb.png'])) as image:
        rgb = np.asarray(image.convert('RGB')).copy()
    with Image.open(checked_asset(root, row['assets']['mask.png'])) as image:
        raw = np.asarray(image.convert('L')).copy()
    assert rgb.shape == (384, 384, 3) and raw.shape == (384, 384)
    assert np.isin(raw, [0, 255]).all()
    mask = raw//255
    assert digest(rgb.tobytes()) == row['rgbSha256']
    assert digest(mask.tobytes()) == row['maskSha256']
    return rgb, mask.astype(np.float32)


def schedule(original_ids, printed_ids, updates, seed):
    """Consume augmentation coins identically in all four experimental arms."""
    rng = np.random.default_rng(seed)
    pools = [[], []]
    result = []
    for _ in range(updates):
        for index, ids in enumerate([original_ids, printed_ids]):
            if not pools[index]:
                pools[index] = [ids[i] for i in rng.permutation(len(ids))]
        result.append({
            'original': pools[0].pop(), 'focus': pools[1].pop(),
            'flipX': bool(rng.integers(2)), 'flipY': bool(rng.integers(2)),
            'complement': [bool(rng.integers(2)), bool(rng.integers(2))],
        })
    return result


class Inputs:
    """Reuse the original supervision; retain only a small bounded view cache."""
    def __init__(self, plan, training):
        self.corpora = [Corpus(pinned(ref).parent) for ref in plan['preparedParents']]
        base = self.corpora[0]
        supplements = training_supplements(base, self.corpora[1:])
        sources = [(base, [r for r in base.rows if base.split[base.views[r['id']]['designId']] == 'train'])]
        sources += [(s['corpus'], s['rows']) for s in supplements]
        self.original = {r['id']: (c, r) for c, rows in sources for r in rows}
        assert len(self.original) == 408
        assert {c.views[r['id']]['designId'] for c, r in self.original.values()} == set(training['splits']['train']['designs'])
        self.print_file = pinned(plan['printed'])
        self.printed = json.loads(self.print_file.read_text())
        assert self.printed['status'] == 'complete' and self.printed['trainingEligible']
        assert len(self.printed['rows']) == 75 and len(self.printed['controls']) == 25
        assert all(c['exact'] and c['decodedRgbScalarDifferences'] == c['maskPixelDifferences'] == 0 for c in self.printed['controls'])
        self.variants = {r['id']: r for r in self.printed['rows']}
        assert len(self.variants) == 75
        self.cache = OrderedDict()
        self.maximum = plan['resources']['maximumCachedViews']

    def original_item(self, identity):
        if identity in self.cache:
            self.cache.move_to_end(identity)
        else:
            corpus, row = self.original[identity]
            item = corpus.load(row)
            assert item['split'] == 'train'
            self.cache[identity] = item
            while len(self.cache) > self.maximum:
                self.cache.popitem(last=False)
        return self.cache[identity]

    def focus(self, identity, printed):
        row = self.variants[identity]
        item = self.original_item(row['sourceViewId'])
        if not printed:
            return item
        rgb, mask = load_inputs(row, self.print_file.parent)
        # The old trace is not a printed-paper baseline. It must never enter
        # training or be reported as a new printed classifier measurement.
        return {**{k: v for k, v in item.items() if not k.startswith('baseline')},
                'id': identity, 'rgb': rgb, 'mask': mask}

    def validate(self):
        result = []
        controls = {r['sourceViewId']: r for r in self.printed['controls']}
        for row in self.printed['rows']:
            identity = row['sourceViewId']
            corpus, _ = self.original[identity]
            view = corpus.views[identity]
            design = corpus.designs[view['designId']]
            assert design['geometrySha256'] == row['geometrySha256']
            assert view['designId'] == row['designId']
            for key, ref in [('originalLabels', view['assets']['labels.json']),
                             ('graph', design['assets']['graph.json']),
                             ('validity', view['assets']['crop-overlap-valid.png'])]:
                original = checked_asset(corpus.dataset, ref)
                assert pinned(row[key]).resolve() == original.resolve()
            original = self.original_item(identity)
            control = controls[identity]
            assert digest(original['rgb'].tobytes()) == control['rgbSha256']
            assert digest(original['mask'].astype(np.uint8).tobytes()) == control['maskSha256']
            variant = self.focus(row['id'], True)
            target_hashes = {}
            for key in ['target', 'valid', 'boundary', 'nodes']:
                assert np.array_equal(original[key], variant[key])
                target_hashes[key] = digest(variant[key].tobytes())
            result.append({'id': row['id'], 'sourceViewId': identity, 'designId': row['designId'],
                           'targetHashes': target_hashes,
                           'changedRgbScalars': int(np.count_nonzero(original['rgb'] != variant['rgb'])),
                           'changedMaskPixels': int(np.count_nonzero(original['mask'] != variant['mask']))})
        assert all(r['changedRgbScalars'] > 0 for r in result)
        return result

    def gallery(self, output):
        # Fixed manifest positions, before model training or score inspection.
        selected = [self.printed['rows'][i] for i in [0, 3, 6, 45, 48, 51]]
        files = []
        for start in [0, 3]:
            page = Image.new('RGB', (4*240, 3*280), 'white')
            pen = ImageDraw.Draw(page)
            for j, row in enumerate(selected[start:start+3]):
                original = self.original_item(row['sourceViewId'])
                variant = self.focus(row['id'], True)
                truth = variant['rgb'].copy()
                truth[variant['boundary'] & variant['valid']] = [0, 230, 100]
                truth = Image.fromarray(truth)
                draw = ImageDraw.Draw(truth)
                for x, y in variant['nodes']:
                    draw.ellipse([x-3, y-3, x+3, y+3], outline=(0, 120, 255), width=2)
                panels = [Image.fromarray(original['rgb']), Image.fromarray(variant['rgb']),
                          Image.fromarray((variant['mask']*255).astype(np.uint8)).convert('RGB'), truth]
                for k, (image, label) in enumerate(zip(panels, ['Original', 'Printed', 'Classifier mask', 'Unchanged graph target'])):
                    page.paste(image.resize((240, 240)), (k*240, j*280+18))
                    pen.text((k*240+2, j*280+2), label, fill='black')
                pen.text((2, j*280+261), row['id'], fill='black')
            file = output/('inputs-%d.jpg' % (start//3+1))
            page.save(file, quality=92)
            files.append(reference(file))
        return files


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--plan', required=True, type=Path)
    parser.add_argument('--output', required=True, type=Path)
    args = parser.parse_args()
    started = time.perf_counter()
    plan = json.loads(args.plan.read_text())
    assert plan['schema'] == 'junction-augmentation-training-plan-1'
    protocol = plan['protocol']
    assert protocol['batchSize'] == 2 and protocol['updatesPerArm'] == 128
    assert [a['id'] for a in plan['arms']] == ['plain', 'phase', 'printed', 'combined']
    training = json.loads(pinned(plan['training']).read_text())
    checkpoint = pinned(plan['checkpoint'])
    assert training['status'] == 'complete' and training['checkpointSha256'] == plan['checkpoint']['sha256']
    code = Path(__file__).parent
    for name in ['model.py', 'train.py', 'data.py', 'losses.py']:
        assert digest((code/name).read_bytes()) == training['sourceHashes'][name], name
    pinned(plan['evaluationPlan'])
    args.output.mkdir(parents=True, exist_ok=False)
    report = {'schema': 'junction-augmentation-training-1', 'status': 'validating',
              'plan': reference(args.plan), 'protocol': protocol, 'arms': [],
              'sources': [reference(code/name) for name in [Path(__file__).name, 'model.py', 'train.py', 'data.py', 'losses.py']],
              'limitations': plan['limitations']}

    def save():
        (args.output/'report.json').write_text(json.dumps(report, indent=2)+'\n')

    def resources():
        assert time.perf_counter()-started < plan['resources']['maximumWallSeconds'], 'Wall-time cap'
        assert shutil.disk_usage(args.output).free >= plan['resources']['minimumFreeGiB']*2**30
        size = sum(p.stat().st_size for p in args.output.rglob('*') if p.is_file())
        assert size < plan['resources']['maximumArtifactMiB']*2**20, 'Artifact cap'
        return size

    save()
    try:
        torch.set_num_threads(1)
        torch.set_num_interop_threads(1)
        torch.use_deterministic_algorithms(True)
        inputs = Inputs(plan, training)
        report['inputValidation'] = inputs.validate()
        report['inputGallery'] = inputs.gallery(args.output)
        draws = schedule(sorted(inputs.original), list(inputs.variants), protocol['updatesPerArm'], protocol['seed'])
        report['schedule'] = draws
        report['scheduleSha256'] = digest(json.dumps(draws, sort_keys=True).encode())
        report['originalViewsSeen'] = len({d['original'] for d in draws})
        report['focusVariantsSeen'] = len({d['focus'] for d in draws})
        report['status'] = 'training'
        save()
        initial = torch.load(checkpoint, map_location='cpu', weights_only=True)
        for arm in plan['arms']:
            resources()
            torch.manual_seed(protocol['seed'])
            model = ProposalNet('random').eval()
            model.load_state_dict(initial)
            assert sum(p.numel() for p in model.parameters()) == 880466
            optimizer = torch.optim.AdamW(model.parameters(), lr=protocol['learningRate'], weight_decay=protocol['weightDecay'])
            record = {**arm, 'status': 'training', 'updates': [], 'scheduleSha256': report['scheduleSha256']}
            report['arms'].append(record)
            began = time.perf_counter()
            for step, draw in enumerate(draws):
                resources()
                items = [inputs.original_item(draw['original']), inputs.focus(draw['focus'], arm['printed'])]
                rgb, mask, target, valid = tensors(items, torch.device('cpu'))
                if draw['flipX']:
                    rgb, mask, target, valid = [v.flip(-1) for v in [rgb, mask, target, valid]]
                if draw['flipY']:
                    rgb, mask, target, valid = [v.flip(-2) for v in [rgb, mask, target, valid]]
                if arm['phase']:
                    for index, complement in enumerate(draw['complement']):
                        if complement:
                            mask[index] = 1-mask[index]
                optimizer.zero_grad(set_to_none=True)
                loss = LOSSES[protocol['loss']](model(rgb, mask), target, valid)
                assert torch.isfinite(loss)
                loss.backward()
                norm = torch.nn.utils.clip_grad_norm_(model.parameters(), protocol['gradientNormCap'], error_if_nonfinite=True)
                optimizer.step()
                record['updates'].append({'step': step+1, 'loss': float(loss.detach()), 'gradientNormBeforeClip': float(norm)})
                if (step+1) % 16 == 0:
                    save()
                    print(arm['id'], step+1, '/', len(draws), 'loss', float(loss.detach()), flush=True)
            state = model.state_dict()
            assert all(torch.isfinite(v).all() for v in state.values())
            frozen = [k for k in state if k.endswith(('running_mean', 'running_var', 'num_batches_tracked'))]
            assert all(torch.equal(state[k], initial[k]) for k in frozen)
            file = args.output/(arm['id']+'.pt')
            torch.save({k: v.detach().cpu() for k, v in state.items()}, file)
            record.update(status='complete', seconds=time.perf_counter()-began,
                          checkpoint=reference(file), frozenBatchNormBuffers=len(frozen),
                          changedParameterTensors=sum(not torch.equal(v, initial[k]) for k, v in model.named_parameters()))
            save()
            del optimizer, model, state
        for ref in report['sources']+[report['plan'], plan['checkpoint'], plan['printed'], plan['training'], plan['evaluationPlan']]+plan['preparedParents']:
            pinned(ref)
        report.update(status='complete', seconds=time.perf_counter()-started, artifactBytesBeforeFinalReport=resources())
        save()
        resources()
        print('complete', report['seconds'], flush=True)
    except Exception as error:
        report.update(status='failed', error=str(error))
        save()
        raise


if __name__ == '__main__':
    main()
