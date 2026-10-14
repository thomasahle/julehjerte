"""Export frozen full-photo predictions without using annotation geometry as input."""
import json
from pathlib import Path

import numpy as np

from data import digest
from real_foreground import ROOT, load_real_labels
from real_annotations import read_source


def export_real_probe(output, predictions, labels_directory, annotations,
                      checkpoint_sha256, source_manifest=None, root=ROOT):
    """Verify labels/provenance, then export only RGB and the supplied field.

    Labels establish source identity and the exact inference letterbox transform.
    Neither body polygons, approximate corners nor label pixels enter the probe.
    The downstream cropper receives the whole source photograph and no ROI.
    """
    output, labels_directory = Path(output), Path(labels_directory)
    source_manifest = Path(source_manifest or root/'docs/inverse/datasets/real-manifest.json')
    items, audit = load_real_labels(labels_directory, source_manifest, annotations, root, purpose='diagnostic')
    if set(predictions) != {item['id'] for item in items}:
        raise ValueError('Prediction identities differ from reviewed labels')
    labels = json.loads((labels_directory/'manifest.json').read_text())
    sources = {row['id']: row for row in json.loads(source_manifest.read_text())['assets']}
    resolutions = {row['transform']['resolution'] for row in labels['instances']}
    if len(resolutions) != 1:
        raise ValueError('A probe requires one inference resolution')
    resolution = resolutions.pop()
    for identity, probability in predictions.items():
        probability = np.asarray(probability)
        if probability.shape != (resolution, resolution) or not np.isfinite(probability).all() or np.any((probability < 0) | (probability > 1)):
            raise ValueError('Invalid full-photo probability field: '+identity)
    output.mkdir(parents=True, exist_ok=False)
    probe = {'schema': 'woven-heart-foreground-probe-1', 'status': 'writing',
             'resolution': resolution, 'checkpointSha256': checkpoint_sha256,
             'labelsAudit': audit,
             'scope': 'Frozen full-photo predictions. Labels provide provenance and letterbox transforms only; no annotation corners, polygons, masks or ROI enter reconstruction. Cached inference; no inference-latency claim.',
             'rows': []}
    for row in labels['instances']:
        identity = row['id']; source = sources[row['assetId']]
        # read_source rechecks original bytes and dimensions. A lossless RGB
        # decode gives every replay method the same pixels without EXIF rotation.
        photo = read_source(root, source)
        file = output/(identity+'.png'); photo.convert('RGB').save(file)
        transform = row['transform']; scale = transform['scale']; ox, oy = transform['offset']
        window = [-ox/scale, -oy/scale, (resolution-ox)/scale, (resolution-oy)/scale]
        raw = np.asarray(predictions[identity], dtype='<f4').tobytes()
        probability_file = identity+'.f32'; (output/probability_file).write_bytes(raw)
        probe['rows'].append({'id': identity, 'caseId': identity, 'group': 'real',
                              'file': str(file.resolve()), 'photoSha256': digest(file.read_bytes()),
                              'originalPhotoSha256': source['sha256'],
                              'dimensions': [source['width'], source['height']],
                              'window': window, 'roi': None, 'inferenceSeconds': None,
                              'assets': {'probability.f32': {'path': probability_file, 'sha256': digest(raw)}}})
    probe['status'] = 'complete'
    (output/'manifest.json').write_text(json.dumps(probe, indent=2)+'\n')
    return probe
