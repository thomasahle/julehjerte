"""Run offline learning tests serially with the current Python interpreter."""
from pathlib import Path
import subprocess
import sys


if __name__ == '__main__':
    tests = sorted(Path(__file__).parent.glob('*.test.py'))
    for test in tests:
        print(test.name, flush=True)
        result = subprocess.run([sys.executable, str(test)])
        if result.returncode:
            raise SystemExit(result.returncode)
    print(f'Passed {len(tests)} offline learning test modules.', flush=True)
