"""Validate component release identity and publish only an exact asset list."""
import argparse
import hashlib
import json
import os
from pathlib import Path
import re
import subprocess

ROOT = Path(__file__).resolve().parents[2]
REPOSITORY = 'toastfr35/ZmalaServer'
VERSION_PATH = 'VERSION.json'


def git(*args):
    return subprocess.check_output(['git', *args], cwd=ROOT, text=True).strip()


def read_version(text):
    metadata = json.loads(text)
    version, sequence = metadata['version'], metadata.get('sequence')
    if not re.fullmatch(r'[0-9]+\.[0-9]+\.[0-9]+', version):
        raise ValueError('Invalid component release version')
    return version, sequence


def check_pr_version():
    base = os.environ['BASE_SHA']
    if not re.fullmatch('[0-9a-f]{40}', base):
        raise ValueError('Expected a full base SHA')
    current = read_version((ROOT/VERSION_PATH).read_text(encoding='utf-8'))
    if not git('ls-tree', base, '--', VERSION_PATH):
        return  # Initial import into a repository-creation README commit.
    previous = read_version(git('show', base+':'+VERSION_PATH))
    if (tuple(map(int, current[0].split('.'))) <= tuple(map(int, previous[0].split('.')))
            or (current[1] is not None and current[1] <= previous[1])):
        raise ValueError('Increase the component version and its update sequence, if applicable')


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('action', choices=('check-pr-version', 'publish'))
    parser.add_argument('assets', nargs='*', type=Path)
    args = parser.parse_args()
    if args.action == 'check-pr-version':
        check_pr_version()
        return
    version, _ = read_version((ROOT/VERSION_PATH).read_text(encoding='utf-8'))
    tag = 'v'+version
    commit = git('rev-parse', 'HEAD')
    if os.environ.get('GITHUB_REPOSITORY') != REPOSITORY or os.environ.get('GITHUB_REF') != 'refs/heads/main':
        raise ValueError('Releases are restricted to the owning repository main branch')
    if git('ls-remote', 'origin', 'refs/heads/main').split()[0] != commit:
        raise ValueError('Refusing to publish a superseded main commit')
    expected = {f'ZmalaServer-{version}-linux-arm64.tar.gz', f'ZmalaServer-{version}-linux-arm64.tar.gz.sha256', 'ZmalaServer-Installation.pdf', 'ZmalaServer-Guide.pdf'}
    if len(args.assets) != len(expected) or {p.name for p in args.assets} != expected:
        raise ValueError('Unexpected release asset list')
    if any(p.is_symlink() or not p.is_file() or not p.stat().st_size for p in args.assets):
        raise ValueError('Missing or empty release asset')
    notes = 'Built from '+commit+'\n\nSHA-256\n\n'+'\n'.join(
        '- '+p.name+' '+hashlib.sha256(p.read_bytes()).hexdigest() for p in sorted(args.assets))
    subprocess.run(['gh', 'release', 'create', tag, *map(str, args.assets), '--repo', REPOSITORY,
                    '--draft', '--target', commit, '--title', tag, '--notes', notes], check=True)
    # Keep failures visible as drafts. GitHub refuses a duplicate release tag.
    subprocess.run(['gh', 'release', 'edit', tag, '--repo', REPOSITORY, '--draft=false'], check=True)


if __name__ == '__main__':
    main()
