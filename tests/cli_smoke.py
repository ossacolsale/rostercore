"""Fail early on missing DLLs, startup failures or unavailable runtime schemas."""
import json
import re
import sys
from pathlib import Path
from cli_runner import process_details, run_cli


def check_cli(cli):
    process = run_cli(cli, 'version', timeout=10)
    if process.returncode or not re.fullmatch(r'\d+\.\d+\.\d+', process.stdout.strip()):
        raise AssertionError(f'CLI startup failed: {process_details(process)}')
    scenario = Path(__file__).resolve().parents[1] / 'examples' / 'pharmacy.json'
    process = run_cli(cli, 'validate', scenario, timeout=10)
    try:
        valid = json.loads(process.stdout).get('status') == 'VALID'
    except (ValueError, AttributeError):
        valid = False
    if process.returncode or not valid:
        raise AssertionError(f'CLI schema validation failed: {process_details(process)}')


if __name__ == '__main__':
    check_cli(Path(sys.argv[1]).resolve())
    print('CLI startup and schema validation passed')
