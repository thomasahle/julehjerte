"""Build pinned probe/pipeline plans from one predeclared paired body study."""
import argparse
import json
from pathlib import Path

from data import digest
from body_provenance import verify_body_sources
from preserved_candidate import pinned


def reference(file):
    file = Path(file)
    return {'path': str(file), 'sha256': digest(file.read_bytes())}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    for key in ['study', 'run', 'output_prefix']: parser.add_argument('--'+key.replace('_', '-'), type=Path, required=True)
    parser.add_argument('--arm', choices=['control', 'candidate'], required=True)
    parser.add_argument('--stage', choices=['probe', 'pipeline'], required=True)
    parser.add_argument('--probe-run', type=Path)
    args = parser.parse_args(); study = json.loads(args.study.read_bytes())
    if study['schema'] not in ['paired-body-expansion-evaluation-plan-1', 'paired-body-exposure-evaluation-plan-1']:
        raise ValueError('Require a predeclared paired body study')
    training = json.loads((args.run/'report.json').read_bytes()); audit = json.loads((args.run/'audit.json').read_bytes())
    if training['status'] != 'complete' or not audit['passed'] or audit['report'] != reference(args.run/'report.json'):
        raise ValueError('Require a completed independently audited checkpoint')
    verify_body_sources(training)
    if training['plan'] != study[args.arm+'TrainingPlan']:
        raise ValueError('Training arm differs from predeclared study')
    plan = json.loads(pinned(training['plan']).read_bytes())
    if plan['evaluation'] != study['evaluationSelection']:
        raise ValueError('Evaluation cohort differs')
    model = reference(args.run/'model.pt')
    if model['sha256'] != training['checkpointSha256']:
        raise ValueError('Checkpoint changed')
    control = json.loads(pinned(study['productionControl']).read_bytes())
    # Match replay-photo-fallback's production-only reuse rule. Research
    # adapters evolve, but every dependency of the cached production fit must
    # still match the predeclared list and the historical bytes.
    production_files = [f for f in control['sourceHashes'] if f.startswith('static/inverse/') or
                        f in ['scripts/inverse/hard-photo-target.mjs', 'scripts/inverse/export-renderer.mjs']]
    if sorted(production_files) != sorted(study['productionSourceHashesVerified']):
        raise ValueError('Production dependency set differs from predeclared study')
    for file in production_files: pinned({'path': file, 'sha256': control['sourceHashes'][file]})
    source_pin = reference(Path(__file__))
    scope = study['scope']+' Native development only; no browser parity or production-release claim.'
    def save(suffix, value):
        value['generatedBy'] = source_pin
        with Path(str(args.output_prefix)+suffix).open('x') as file:
            file.write(json.dumps(value, indent=2)+'\n')
    if args.stage == 'probe':
        if args.probe_run: raise ValueError('Probe run is only used at pipeline stage')
        save('-probe-plan.json', {
            'schema': 'u2netp-probe-plan-1', 'status': 'predeclared', 'source': plan['source'],
            'checkpoint': model, 'adaptation': reference(args.run/'report.json'), 'selection': plan['evaluation'],
            'control': study['productionControl'], 'pairedStudy': reference(args.study),
            'protocol': {'resolution': 320, 'skimage': plan['protocol']['skimage'], 'threads': 1,
                         'pairedControl': 'fresh-production', 'input': plan['protocol']['input'],
                         'output': plan['protocol']['inference'], 'pipeline': study['pipeline']['selection']},
            'resources': {'maxProbeMiB': 16, 'workers': 1, 'newPhotoDownloads': 0, 'newSourcePhotoCopies': 0}, 'scope': scope})
    else:
        if not args.probe_run: raise ValueError('Require completed native probe')
        runtime = json.loads((args.probe_run/'report.json').read_bytes())
        manifest = json.loads((args.probe_run/'manifest.json').read_bytes())
        if runtime['status'] != 'complete' or manifest['status'] != 'complete' or runtime['checkpointSha256'] != model['sha256']:
            raise ValueError('Probe incomplete or uses another checkpoint')
        if manifest['fieldOrigin']['adaptation'] != reference(args.run/'report.json'):
            raise ValueError('Probe adaptation differs')
        probe_plan = json.loads(pinned(runtime['plan']).read_bytes())
        if probe_plan['pairedStudy'] != reference(args.study): raise ValueError('Probe belongs to another study')
        files = ['partial-photo-crop.mjs', 'u2netp-probe.py', 'replay-photo-fallback.mjs',
                 'continuous-foreground.mjs', 'foreground-crop.mjs']
        pins = {str(Path(__file__).with_name(f)): reference(Path(__file__).with_name(f))['sha256'] for f in files}
        save('-study-plan.json', {'schema': 'saliency-fresh-study-1', 'status': 'predeclared-development',
             'selection': plan['evaluation'], 'checkpoint': model, 'model': model, 'upstreamSource': plan['source'],
             'pipeline': study['pipeline'], 'sourcePins': pins, 'scope': scope, 'pairedStudy': reference(args.study),
             'trainingSeparation': {'report': reference(args.run/'report.json'), 'plan': training['plan']}})
        save('-pipeline-plan.json', {'schema': 'saliency-photo-crop-fallback-plan-1',
             'study': reference(str(args.output_prefix)+'-study-plan.json'), 'purpose': scope,
             'runtimeStage': 'native-development', 'probe': reference(args.probe_run/'manifest.json'),
             'runtimeEvidence': reference(args.probe_run/'report.json'), 'adaptationAudit': reference(args.run/'audit.json'),
             'ids': [r['id'] for r in manifest['rows']], 'protocol': study['pipeline'],
             'resources': {'artifactBudgetMiB': 30, 'workers': 1, 'newSourcePhotoCopies': 0},
             'controlRun': study['productionControl']})


if __name__ == '__main__': main()
