# ZmalaServer repository instructions

Use a GitHub issue and a `codex/` feature branch for every change. Open a pull
request to `main`. Wait for Verify and resolve failures before merging through
GitHub. Keep release inputs confined to the release workflow.

This repository owns the Pi server. Keep code, normative Doorstop items,
standalone `@llr` comments, LLT/HLT plans and documentation synchronized.
Keep runtime requirements in `requirements/`. Keep IDs stable and reserve
numbers across HLR and LLR within each theme. Consult `requirements/ownership.json`
before editing a shared requirement. Coordinate imported copies with the owner.

Run `make requirements` after changes to requirements, code anchors, or test
plans. Do not commit `requirements/output/` or clear suspect links without
review. Product tests go in the top-level `tests/` tree. Keep packaging,
installer and tooling tests in `tests/adhoc/`. Record hardware skips explicitly.

Before changing a client-facing interface, read the relevant contract in
[requirements](requirements/README.md). Preserve deployed peer compatibility
using the local verification plans. Coordinate deliberate wire changes across
the affected repositories.

Increase the component version for changes affecting the runtime, package or
release. Requirements and verification-only changes can keep the current version.
