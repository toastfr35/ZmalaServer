# @test S-HLT-030
# @requirements HLR-SRV-MEDIA-014
# @environment linux-root
# @plan Run the real secure server and two real native terminal Engines in the isolated Docker network lab. Block forwarded UDP at A, B, both, or neither. Verify HTTPS configuration, authenticated SIP TLS, TURN credentials, SRTP/relay ICE, decoded opposite audio tones and fresh H.264 frames in both call directions. Check drop counters, repeated calls and hangup. Probe endpoint certificate trust and native SIP rejection of an untrusted CA or wrong certificate name. Synthetic static cameras do not qualify Pi motion performance or institutional HTTP proxies.
# @pass All eight calls sustain decoded audio/video; TLS certificate probes and firewall checks pass. No production transport monkeypatch is permitted.

import os
from pathlib import Path
import subprocess
import sys


if __name__ == '__main__':
    configured = os.environ.get('ZMALA_IMAGE_BUILDER_ROOT')
    if not configured:
        raise SystemExit('Set ZMALA_IMAGE_BUILDER_ROOT to the reviewed Zmala image builder checkout.')
    builder = Path(configured).resolve()
    if not (builder/'tests/support/network_lab').is_dir():
        raise SystemExit('The selected Zmala checkout does not contain the network lab.')
    subprocess.run([sys.executable, '-c', 'from tests.support.network_lab.tls_scenarios import main; main()', *sys.argv[1:]], cwd=builder, check=True)
