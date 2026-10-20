"""Inspect frozen corner proposals and A/B-label stability on real crops."""
import argparse
import hashlib
import json
import shutil
import time
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw
from scipy.ndimage import binary_erosion
import torch

from classical import refine_corners
from data import Corpus, detect_nodes, point_counts, scores
from model import ProposalNet
from train import infer, tensors


def digest(raw):
    return hashlib.sha256(raw).hexdigest()


def pinned(reference, root=Path('.')):
    file = root/reference['path']
    raw = file.read_bytes()
    assert digest(raw) == reference['sha256'], str(file)
    return file


def reference(file):
    return {'path': str(file), 'sha256': digest(file.read_bytes())}


def predict(model, rgb, mask):
    rgb_tensor = torch.from_numpy(np.ascontiguousarray(rgb.transpose(2, 0, 1)))[None].float()/255
    mask_tensor = torch.from_numpy(np.ascontiguousarray(mask))[None, None].float()
    with torch.no_grad():
        return torch.sigmoid(model(rgb_tensor, mask_tensor))[0].numpy().astype(np.float16)


def refined(mask, nodes, valid, radius):
    result = refine_corners(mask, nodes, radius)
    if len(result):
        indices = np.floor(result).astype(int)
        inside = valid[indices[:, 1], indices[:, 0]]
        result[~inside] = nodes[~inside]
    return result


def thumbnail(image, size=240):
    output = Image.new('RGB', (size, size), 'white')
    image = image.copy()
    image.thumbnail((size, size), Image.Resampling.LANCZOS)
    output.paste(image, ((size-image.width)//2, (size-image.height)//2))
    return output


def proposal_panel(rgb, field, nodes, adjusted, valid, threshold):
    pixels = rgb.copy()
    boundary = (field[0] >= threshold) & valid
    pixels[boundary] = .35*pixels[boundary]+.65*np.array([0, 255, 140])
    image = Image.fromarray(pixels)
    pen = ImageDraw.Draw(image)
    for (x, y), (u, v) in zip(nodes, adjusted):
        pen.ellipse((x-4, y-4, x+4, y+4), outline=(255, 210, 0), width=2)
        pen.line((x, y, u, v), fill=(255, 0, 230))
        pen.line((u-3, v, u+3, v), fill=(255, 0, 230), width=2)
        pen.line((u, v-3, u, v+3), fill=(255, 0, 230), width=2)
    return thumbnail(image)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--plan', type=Path, required=True)
    parser.add_argument('--output', type=Path, required=True)
    args = parser.parse_args()
    started = time.perf_counter()
    plan = json.loads(args.plan.read_text())
    assert plan['schema'] == 'real-junction-phase-plan-1'
    protocol = plan['protocol']
    assert protocol['resolution'] == 384 and protocol['thresholds'] == [.6, .4]
    assert protocol['phases'] == ['original', 'exchanged']
    assert protocol['refinementRadiusPixels'] == 9 and protocol['matchingTolerancePixels'] == 3
    assert protocol['observationErosionPixels'] == 2
    pipeline = json.loads(pinned(plan['pipeline']).read_text())
    training = json.loads(pinned(plan['training']).read_text())
    previous = json.loads(pinned(plan['previousSyntheticReplay']).read_text())
    checkpoint = pinned(plan['checkpoint'])
    pinned(plan['preparedSynthetic'])
    assert pipeline['status'] == training['status'] == previous['status'] == 'complete'
    assert previous['developmentSelected'] == 'cnn-refined-9'
    assert training['checkpointSha256'] == previous['checkpointSha256'] == plan['checkpoint']['sha256']
    assert training['selectedThresholds'] == protocol['thresholds']
    code = Path(__file__).parent
    assert digest((code/'model.py').read_bytes()) == training['sourceHashes']['model.py']
    selected = [r for r in pipeline['rows'] if r['method'] == protocol['seedMethod']]
    assert [r['id'] for r in selected] == plan['expectedCases']
    root = Path(plan['pipeline']['path']).parent
    args.output.mkdir(parents=True, exist_ok=False)
    source_files = [Path(__file__), code/'model.py', code/'data.py', code/'classical.py', code/'train.py']
    report = {
        'schema': 'real-junction-phase-probe-1', 'status': 'running', 'plan': reference(args.plan),
        'sources': [reference(p) for p in source_files], 'rows': [], 'gallery': [],
        'scope': plan['evaluation'], 'protocol': protocol,
    }

    def save():
        (args.output/'report.json').write_text(json.dumps(report, indent=2)+'\n')

    def resources():
        assert time.perf_counter()-started < plan['resources']['maximumWallSeconds'], 'Wall-time cap'
        assert shutil.disk_usage(args.output).free >= plan['resources']['minimumFreeGiB']*2**30
        total = sum(p.stat().st_size for p in args.output.rglob('*') if p.is_file())
        assert total < plan['resources']['maximumArtifactMiB']*2**20, 'Artifact cap'
        return total

    save()
    try:
        torch.set_num_threads(1)
        torch.set_num_interop_threads(1)
        torch.manual_seed(1729)
        model = ProposalNet('random').eval()
        model.load_state_dict(torch.load(checkpoint, map_location='cpu', weights_only=True))
        assert sum(p.numel() for p in model.parameters()) == training['parameters']
        initial = {name: value.clone() for name, value in model.state_dict().items()}
        # Same CPU model and a real prepared synthetic item: independently use
        # the historical tensor/inference path to check input layout and scale.
        corpus = Corpus(Path(plan['preparedSynthetic']['path']).parent)
        item = corpus.load(corpus.rows[0])
        _, expected = infer(model, [item], torch.device('cpu'), 1)
        actual = predict(model, item['rgb'], item['mask'])
        assert np.array_equal(actual, expected[0])
        _, old_mask, _, _ = tensors([item], torch.device('cpu'))
        assert np.array_equal(old_mask.numpy()[0, 0], item['mask'].astype(np.float32))
        report['syntheticForwardControl'] = {
            'id': item['id'], 'exactFloat16Fields': True,
            'sha256': digest(actual.tobytes()),
            'scope': 'Same CPU checkpoint through the historical and new input paths; not historical GPU-bit parity.',
        }
        panels = []
        n = protocol['resolution']
        for row in selected:
            resources()
            photo_file = pinned({'path': row['source'], 'sha256': row['sourceSha256']})
            with Image.open(photo_file) as image:
                photo = thumbnail(image.convert('RGB'))
            result = {'id': row['id'], 'source': reference(photo_file), 'status': row['status']}
            if row['status'] == 'crop-unresolved':
                report['rows'].append(result)
                panels.append([photo]+[Image.new('RGB', (240, 240), '#eeeeee') for _ in range(4)])
                continue
            crop_file = pinned(row['assets']['crop.png'], root)
            mask_file = pinned(row['assets']['mask.png'], root)
            with Image.open(crop_file) as image:
                rgb = np.asarray(image.convert('RGB').resize((n, n), Image.Resampling.BILINEAR)).copy()
            with Image.open(mask_file) as image:
                native = np.asarray(image.convert('RGB'))[:, :, 1] < 128
            assert digest(native.astype(np.uint8).tobytes()) == row['targetMaskSha256']
            assert native.shape == (row['resolution'],)*2
            mask = np.asarray(Image.fromarray(native).resize((n, n), Image.Resampling.NEAREST)).copy()
            observed = (np.frombuffer(pinned(row['assets']['observed.bin'], root).read_bytes(), np.uint8).reshape(native.shape) != 0
                        if 'observed.bin' in row['assets'] else np.ones_like(native))
            valid = binary_erosion(np.asarray(Image.fromarray(observed).resize((n, n), Image.Resampling.NEAREST)), iterations=2)
            assert valid.any()
            fields, proposals, adjusted = {}, {}, {}
            result.update({
                'status': 'complete', 'selectedCrop': row['selectedCrop'],
                'nativeMaskSha256': row['targetMaskSha256'], 'crop': reference(crop_file),
                'rgbInputSha256': digest(rgb.tobytes()), 'maskInputSha256': digest(mask.tobytes()),
                'validInputSha256': digest(valid.tobytes()), 'validPixels': int(valid.sum()),
                'methods': {},
            })
            # Rotate invocation order without changing the declared reporting order.
            order = protocol['phases'][::1 if len(report['rows']) % 2 == 0 else -1]
            for phase in order:
                input_mask = mask if phase == 'original' else ~mask
                began = time.perf_counter()
                fields[phase] = predict(model, rgb, input_mask)
                seconds = time.perf_counter()-began
                nodes = detect_nodes(fields[phase][1]*valid, protocol['thresholds'][1])
                adjusted[phase] = refined(mask, nodes, valid, protocol['refinementRadiusPixels'])
                proposals[phase] = nodes
                result['methods'][phase] = {
                    'nodes': nodes.tolist(), 'refined': adjusted[phase].tolist(),
                    'inferenceSeconds': seconds, 'fieldSha256': digest(fields[phase].tobytes()),
                    'boundaryPixels': int(((fields[phase][0] >= protocol['thresholds'][0]) & valid).sum()),
                }
            result['phaseAgreement'] = {
                kind: {'counts': point_counts(values['original'], values['exchanged'], tolerance=3),
                       'interpretation': 'Across label phases, not against ground truth.'}
                for kind, values in [('raw', proposals), ('refined', adjusted)]
            }
            # The metric is symmetric even though point_counts names its second
            # argument "target". Neither phase is the truth in this diagnostic.
            for part in result['phaseAgreement'].values():
                part['counts'] = [int(v) for v in part['counts']]
                matched, first, second = part['counts']
                part['symmetricAgreement'] = 2*matched/(first+second) if first+second else 1.
            difference = np.abs(fields['original'].astype(np.float32)-fields['exchanged'].astype(np.float32))
            result['meanAbsoluteHeatmapChange'] = [float(x[valid].mean()) for x in difference]
            result['maximumHeatmapChange'] = [float(x[valid].max()) for x in difference]
            output = args.output/(row['id']+'.npz')
            np.savez_compressed(output, **fields)
            with np.load(output) as stored:
                assert all(np.array_equal(stored[p], fields[p]) for p in protocol['phases'])
            result['fields'] = reference(output)
            panels.append([
                photo, thumbnail(Image.fromarray(rgb)),
                thumbnail(Image.fromarray(np.uint8(mask)*255).convert('RGB')),
                *[proposal_panel(rgb, fields[p], proposals[p], adjusted[p], valid, protocol['thresholds'][0])
                  for p in protocol['phases']],
            ])
            report['rows'].append(result)
            save()
            print(json.dumps({'id': row['id'], 'nodes': {p: len(proposals[p]) for p in protocol['phases']},
                              'agreement': result['phaseAgreement']['raw']['symmetricAgreement']}), flush=True)
        for start in range(0, len(panels), 3):
            page = Image.new('RGB', (1200, 300*min(3, len(panels)-start)), 'white')
            pen = ImageDraw.Draw(page)
            for j, group in enumerate(panels[start:start+3]):
                for k, (image, label) in enumerate(zip(group, ['Photo', 'Fixed crop', 'Fixed mask', 'Original labels', 'Exchanged labels'])):
                    page.paste(image, (k*240, j*300+20))
                    pen.text((k*240+3, j*300+3), label, fill='black')
                row = report['rows'][start+j]
                text = row['id']+' | '+row['status']
                if row['status'] == 'complete':
                    part = row['phaseAgreement']['raw']
                    text += ' | nodes %d/%d; phase agreement %.1f%%' % (*part['counts'][1:], 100*part['symmetricAgreement'])
                pen.text((3, j*300+263), text, fill='black')
                pen.text((3, j*300+279), 'Green: predicted boundary; yellow: raw corner; magenta: existing 9px refinement. No corner ground truth.', fill='black')
            file = args.output/('review-%02d.jpg' % (start//3+1))
            page.save(file, quality=92)
            report['gallery'].append({**reference(file), 'ids': [r['id'] for r in report['rows'][start:start+3]]})
        fitted = [r for r in report['rows'] if r['status'] == 'complete']
        report['summary'] = {
            'photos': len(report['rows']), 'crops': len(fitted), 'unresolved': len(report['rows'])-len(fitted),
            'phaseAgreement': {
                kind: scores([sum(r['phaseAgreement'][kind]['counts'][i] for r in fitted) for i in range(3)])
                for kind in ['raw', 'refined']
            },
            'photosWithEveryProposalMatched': {
                kind: sum(len(set(r['phaseAgreement'][kind]['counts'])) == 1 for r in fitted)
                for kind in ['raw', 'refined']
            },
            'interpretation': 'Agreement between A/B label phases, not real junction accuracy or valid-template recovery.',
        }
        assert len(report['rows']) == 32 and len(fitted) == 26
        assert all(torch.equal(initial[name], value) for name, value in model.state_dict().items())
        pinned(plan['checkpoint'])
        for source in report['sources']:
            pinned(source)
        report['seconds'] = time.perf_counter()-started
        report['artifactBytesBeforeFinalReport'] = resources()
        report['status'] = 'complete'
        save()
        resources()
        print(json.dumps(report['summary']), flush=True)
    except Exception as error:
        report['status'] = 'failed'
        report['error'] = str(error)
        save()
        raise


if __name__ == '__main__':
    main()
