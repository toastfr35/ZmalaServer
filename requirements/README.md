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
The subsequent [quality review](reviews/2026-11-09-quality.md) records clearer
acceptance criteria and the remaining gaps in automated assertions.

## Writing verifiable requirements

Keep each HLR focused on a user or system outcome. Use its LLRs to define the
observable obligations and acceptance boundaries. Preserve stable IDs when
clarifying existing behavior; a new independent obligation needs its own ID,
parent, owner, implementation anchor and direct verification plan.

For each LLR, make these details explicit where they affect acceptance:

- The actor, credential and applicable operating mode, including prerequisites
  such as an active call, enrollment or restore maintenance.
- Accepted types and values, defaults and limits with units. Distinguish UTF-8
  bytes, JavaScript UTF-16 code units, pixels, seconds and milliseconds. State
  whether boundaries are inclusive and what starts or renews a timer.
- The observable result, failure status and state that must remain unchanged.
  Describe omitted, null, empty, duplicate, stale and retried input separately
  when their meanings differ.
- Ownership and concurrency rules, persistence acknowledgement, cleanup and
  recovery after late or failed work. Do not promise atomicity across files when
  the implementation provides only per-file replacement.

Prefer a reference to the owning requirement over repeating a policy in several
items. Name finite choices or numerical limits instead of using words such as
"supported", "bounded" or "excessive" without a definition. Separate related
clauses into readable paragraphs, while keeping independently changeable behavior
in separate requirements. Avoid making incidental implementation choices normative.

The verification field is an acceptance plan: identify inputs, procedure and an
observable pass/fail result, including boundary and failure cases. Linked LLT/HLT
files identify planned coverage; they do not demonstrate that every clause has an
assertion or that a run passed. Record execution counts, platform skips and any
uncovered acceptance cases separately. Keep hardware, network-lab and real-provider
evidence distinct from deterministic fixtures.

When code and a requirement disagree, decide whether the text is stale or the
implementation violates the intended behavior. Record and fix a demonstrated
defect rather than weakening its requirement to make the audit pass. Peer contract
changes still follow the coordination rules below.

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
