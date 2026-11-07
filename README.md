# ZmalaServer

This repository contains the Zmala Pi server.

- [Technical guide](docs/server.md)
- [Development and requirements](docs/general.md)
- [Migration provenance](docs/migration/provenance.json)
- [Downloads](https://github.com/toastfr35/ZmalaServer/releases)

## Related repositories

- [ZmalaTerminal](https://github.com/toastfr35/ZmalaTerminal)
- [ZmalaApp](https://github.com/toastfr35/ZmalaApp)
- [Zmala](https://github.com/toastfr35/Zmala)
- [Original ZmalaCall repository and historical downloads](https://github.com/toastfr35/ZmalaCall)

## Release

The Pi installer uses the target package manager. The image builder locks dependencies separately for offline image provisioning.

After Verify passes on the merged version, dispatch **Release** on main. Terminal and App require the existing signing credentials in the release environment.
