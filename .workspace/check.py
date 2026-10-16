"""Portable, read-only repository checks. Standard library only; never runs project code."""
from __future__ import annotations

import argparse
from datetime import date
import json
from pathlib import Path
import re
import subprocess
import sys

VERSION = 1
PRIVATE_SUFFIXES = {'.pfx', '.p12', '.pem', '.key', '.db', '.sqlite', '.sqlite3', '.db3'}
PRIVATE_NAMES = {'local.settings.json', 'local.properties', 'settings.local.json'}


def inside(root: Path, relative: str) -> Path:
    if not relative or Path(relative).is_absolute() or re.match(r'^[A-Za-z]:', relative):
        raise ValueError('Expected repository-relative path')
    target = (root / relative).resolve()
    if not target.is_relative_to(root.resolve()):
        raise ValueError('Path escapes repository')
    return target


def private_file(name: str) -> bool:
    path = Path(name)
    base = path.name.lower()
    if base in {'.env.example', '.env.sample', '.env.template', 'local.settings.json.example'}:
        return False
    return (base == '.env' or base.startswith('.env.') or base in PRIVATE_NAMES
            or path.suffix.lower() in PRIVATE_SUFFIXES
            or any(p.lower() in {'invoic-reconciliation-cowork', 'credentials', '.ssh'} for p in path.parts))


def git(root: Path, *args: str) -> subprocess.CompletedProcess:
    return subprocess.run(['git', '--no-optional-locks', '-c', 'core.fsmonitor=false',
                           '-C', str(root), *args], capture_output=True, timeout=30)


def audit(root: Path, tracked: list[str] | None = None) -> dict:
    errors, warnings = [], []
    root = root.resolve()
    config_path = root / '.workspace/project.json'
    if not config_path.is_file():
        return {'project': root.name, 'errors': ['Missing .workspace/project.json'], 'warnings': []}
    try:
        if tracked is None:
            result = git(root, 'ls-files', '-z')
            if result.returncode:
                errors.append('Cannot inspect Git index; repository was not verified')
                tracked = []
            else:
                tracked = result.stdout.decode('utf-8', errors='replace').split('\0')
        config = json.loads(config_path.read_text(encoding='utf-8-sig'))
        if config.get('schema_version') != VERSION:
            errors.append('Unsupported workspace schema version')
        for relative in config.get('required_paths', []):
            if not inside(root, relative).exists():
                errors.append(f'Missing documented path: {relative}')
        for guide in ['AGENTS.md', 'DEVELOPMENT.md']:
            p = root / guide
            if not p.is_file():
                errors.append(f'Missing {guide}')
            elif '.workspace/STANDARD.md' not in p.read_text(encoding='utf-8-sig'):
                errors.append(f'{guide} does not reference .workspace/STANDARD.md')
            if p.is_file():
                for link in re.findall(r'\]\(([^)]+)\)', p.read_text(encoding='utf-8-sig')):
                    link = link.split('#', 1)[0].strip('<>')
                    if not link or re.match(r'^[A-Za-z]+:', link):
                        continue
                    # External context is optional; source-repository links must work on a clone.
                    if not inside(root, link).exists():
                        errors.append(f'Broken local link in {guide}: {link}')
        agents = root / 'AGENTS.md'
        if agents.is_file() and agents.stat().st_size > 16000:
            warnings.append('AGENTS.md exceeds 16 KB; move specialist detail to referenced documentation')
        claude = root / 'CLAUDE.md'
        if claude.is_file() and claude.read_text(encoding='utf-8-sig').strip() != '@AGENTS.md':
            warnings.append('CLAUDE.md is not a thin @AGENTS.md adapter; preserve unique content before consolidating')
        for command in config.get('commands', []):
            cwd = inside(root, command['cwd'])
            if command['runner'] == 'npm':
                manifest = cwd / 'package.json'
                if not manifest.is_file():
                    errors.append(f'Missing command manifest: {command["cwd"]}/package.json')
                    continue
                package = json.loads(manifest.read_text(encoding='utf-8-sig'))
                if command['name'] not in package.get('scripts', {}):
                    errors.append(f'Missing npm script in {command["cwd"]}: {command["name"]}')
                if tracked is not None and manifest.relative_to(root).as_posix() not in tracked:
                    errors.append(f'Command manifest is not tracked: {manifest.relative_to(root).as_posix()}')
        for filename, fragments in config.get('forbidden_claims', {}).items():
            p = inside(root, filename)
            if p.exists():
                body = p.read_text(encoding='utf-8-sig')
                for fragment in fragments:
                    if fragment in body:
                        errors.append(f'Obsolete guidance remains in {filename}; see project.json forbidden_claims')
        exceptions = config.get('existing_private_records', {})
        for name in tracked or []:
            if name and private_file(name):
                if name in exceptions and exceptions[name].get('reason') and exceptions[name].get('review_by'):
                    if date.fromisoformat(exceptions[name]['review_by']) < date.today():
                        errors.append(f'Private-record review deadline expired: {name}')
                    else:
                        warnings.append(f'Existing private record requires a retention decision: {name}')
                else:
                    errors.append(f'Private/local file is tracked: {name}')
        if config.get('lifecycle') == 'review-required':
            warnings.append('Project lifecycle/purpose needs review; no architecture was inferred')
    except (OSError, ValueError, KeyError, TypeError, subprocess.SubprocessError):
        errors.append('Invalid or unreadable workspace metadata; no file contents displayed')
    return {'project': root.name, 'errors': sorted(set(errors)), 'warnings': sorted(set(warnings))}


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--repo', type=Path, default=Path(__file__).resolve().parent.parent)
    parser.add_argument('--json', action='store_true')
    args = parser.parse_args()
    result = audit(args.repo)
    if args.json:
        print(json.dumps(result, indent=2))
    else:
        print(f'{result["project"]}: {len(result["errors"])} errors, {len(result["warnings"])} warnings')
        for item in result['errors']:
            print('ERROR: ' + item)
        for item in result['warnings']:
            print('REVIEW: ' + item)
    return bool(result['errors'])


if __name__ == '__main__':
    sys.exit(main())
