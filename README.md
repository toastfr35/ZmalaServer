# ZmalaServer

This repository contains the Zmala Pi server.

- [Technical guide](docs/server.md)
- [Development and requirements](docs/general.md)
- [Editable installation and administration guide](docs/server_prep.docx)
- [Peer interface contracts](requirements/README.md)
- [Downloads](https://github.com/toastfr35/ZmalaServer/releases)

## Related repositories

- [ZmalaTerminal](https://github.com/toastfr35/ZmalaTerminal)
- [ZmalaApp](https://github.com/toastfr35/ZmalaApp)
- [Zmala](https://github.com/toastfr35/Zmala)
- [Original ZmalaCall repository and historical downloads](https://github.com/toastfr35/ZmalaCall)

## Release

The package installer targets Raspberry Pi OS Lite 64-bit Trixie on the Pi 3/4
Model B and checks its hostname, service account and wired connection. Follow
the [installation prerequisites](docs/server.md#pi-package-installation).
The image builder owns offline provisioning separately.

After merging a verified pull request, run **Verify** on the resulting `main`
commit. When it passes, dispatch **Release** on that same commit. The Server
workflow publishes its versioned archive, SHA-256 sidecar and two PDF guides;
Terminal and App releases are managed in their own repositories. See the
[release workflow](docs/general.md#packages-and-release-guides).
