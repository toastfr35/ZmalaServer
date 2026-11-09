# Server requirements

Use these contracts before changing enrollment, configuration, callbacks,
notifications, signalling, media, or any client-facing endpoint.

| Peer | Shared contract | Matching copy |
| --- | --- | --- |
| Raspberry Pi Terminal | [Terminal–Server interface](interfaces/terminal-server.md) | [ZmalaTerminal](https://github.com/toastfr35/ZmalaTerminal/blob/main/requirements/interfaces/terminal-server.md) |
| Android App | [App–Server interface](interfaces/app-server.md) | [ZmalaApp](https://github.com/toastfr35/ZmalaApp/blob/main/requirements/interfaces/app-server.md) |

The contract copies describe the interfaces on which the named clients and
Server agree. Authoritative runtime requirements and verification links are
in the themed Doorstop documents. See [ownership.json](ownership.json) for
ownership and imported parent IDs.

The [9 November 2026 review](reviews/2026-11-09.md) records the implementation
comparison, corrected discrepancies, verification evidence and remaining
hardware qualification boundaries.

## Working in this repository

1. Read the contract and the Server requirement IDs it lists. Inspect the
   corresponding route, validation, projection and SIP code before changing
   an interface. The local repo contains the implementation and checks needed
   for compatible Server work.
2. Preserve the documented field names and types, authorization boundaries,
   status codes, cache and retry behavior. Treat even a new field as a
   compatibility change if a deployed peer rejects unknown fields.
3. Run the contract's targeted LLT and HLT checks, then run
   **make requirements** and the normal **Verify** workflow. Use synthetic
   credentials. Hardware or cross-component checks remain separate evidence.
4. If a wire change cannot be backward compatible, coordinate both owners,
   update the matching contract copies and affected Doorstop items, and test
   supported old/new combinations. Introduce a versioned route or negotiated
   capability before retiring behavior that deployed peers still use.
