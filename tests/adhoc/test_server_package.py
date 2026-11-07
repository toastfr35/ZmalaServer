"""Verify the software package independently of product requirement tests."""
import hashlib
import json
from pathlib import Path
import subprocess
import sys
import tarfile
import tempfile
import unittest


ROOT = Path(__file__).resolve().parents[2]


class ServerPackageTests(unittest.TestCase):
    def test_package_identifies_and_checksums_its_source_and_contract(self):
        with tempfile.TemporaryDirectory() as temporary:
            output = Path(temporary) / 'server.tar.gz'
            subprocess.run([sys.executable, 'build_tools/linux/package-server.py', '--output', output],
                           cwd=ROOT, check=True, capture_output=True)
            sidecar = output.with_name(output.name+'.sha256').read_text().split()
            self.assertEqual(sidecar, [hashlib.sha256(output.read_bytes()).hexdigest(), output.name])
            with tarfile.open(output, 'r:gz') as archive:
                members = archive.getmembers()
                names = {member.name for member in members}
                self.assertEqual(len(names), len(members))
                self.assertTrue(all(member.isfile() for member in members))
                self.assertTrue({'install.sh', 'zmala_server/main.js', 'build_tools/linux/install-server.sh',
                                 'vendor/terminal-contracts/terminal-languages.json',
                                 'vendor/terminal-contracts/gentle-chime.wav'} <= names)
                self.assertFalse(any(set(Path(name).parts) & {'data', 'node_modules', 'zmala_terminal',
                                                             'zmala_phone', '.env'} for name in names))
                manifest = json.load(archive.extractfile('ZMALA-COMPONENT.json'))
                expected = json.loads((ROOT/'VERSION.json').read_text())
                commit = subprocess.check_output(['git', 'rev-parse', 'HEAD'], cwd=ROOT, text=True).strip()
                self.assertEqual(manifest, {'schema': 1, 'component': 'server', 'architecture': 'arm64',
                                            'version': expected['version'], 'commit': commit})
                listed = {name: digest for digest, name in
                          (line.split('  ', 1) for line in archive.extractfile('SHA256SUMS').read().decode().splitlines())}
                self.assertEqual(set(listed), names - {'SHA256SUMS'})
                for name, digest in listed.items():
                    self.assertEqual(hashlib.sha256(archive.extractfile(name).read()).hexdigest(), digest, name)
