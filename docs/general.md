# ZmalaServer engineering

This repository owns the Pi server, browser administration, Server requirements
and release guides. Start with the [technical guide](server.md) and the
[interface contracts](../requirements/README.md) before changing peer behavior.
The Terminal, Android app and SD-card image builder have separate repositories.

## Development tools and checks

Run commands from the repository root. Linux is the reference test environment;
CI uses Node.js 24 and Python 3.12. GNU Make invokes the checks. Image tests also
need Pillow, supplied by the Linux runtime packages in CI; Chromium supplies
the browser tests.

In the four-repository workspace, put environments, caches and disposable
outputs in the parent `tmp/` directory. On Linux:

```sh
mkdir -p ../tmp/server-dev
python3 -m venv ../tmp/server-dev/venv
. ../tmp/server-dev/venv/bin/activate
export TMPDIR="$(cd ../tmp/server-dev && pwd)"
export PYTHONDONTWRITEBYTECODE=1
export PLAYWRIGHT_BROWSERS_PATH="$TMPDIR/browsers"
export npm_config_cache="$TMPDIR/npm-cache"
export RUFF_CACHE_DIR="$TMPDIR/ruff-cache"
python -m pip install --cache-dir "$TMPDIR/pip-cache" -r requirements-dev.txt -r build_tools/doorstop-requirements.txt Pillow
npm ci --ignore-scripts
npm --prefix zmala_server ci --ignore-scripts
npx playwright install --with-deps chromium
```

Run the appropriate checks after making changes:

```sh
make lint test-llt test-hlt test-adhoc PYTHON=python
make requirements-check PYTHON=python
```

There is no `make test` or `make coverage-llt` target. `npm test` runs the
JavaScript LLT/HLT suites only; the Make targets also run the Python suites.
For a focused check, use `node --test tests/server/LLT/call-photo.test.js` or
`node build_tools/run-tests.cjs LLT`. On Windows, run `npm run typecheck`,
`npm run build:check` and `python -m ruff check .` directly if Make cannot resolve
the npm path. Set `TEMP` and `TMP` to a directory under the parent `tmp/`.

`make requirements` publishes ignored HTML reports to `requirements/output/`.
For local workspace use, point that directory at a report directory under the
parent `tmp/` with a symlink or Windows junction. Preserve existing reports
when changing that mapping. `make requirements-check PYTHON=python` validates
without publishing. Source and test-plan coverage reports describe traceability,
not measured runtime coverage or proof that every requirement clause was tested.

`npm run build:admin` regenerates `zmala_server/web/admin.js` and `admin.css`
after browser-source changes. Commit the matching bundles. `npm run build:check`
checks freshness; `npm run typecheck` checks Server and browser code.

Portable tests use disposable state. Process, image-conversion and Linux network
tests have platform constraints; record skips separately from passes. The physical
Pi storage check is opt-in and cannot be replaced by CI. Its invocation is in the
[Server verification guide](server.md#server-requirement-baseline).

## Requirements and tests

[`ownership.json`](../requirements/ownership.json) identifies each stable ID's
owner. Imported parents retain their IDs. Update imported copies through a
reviewed owner change. Use
`python build_tools/requirements.py --next-id LLR SRV DIR` to find the next free
ID in a theme; replace `DIR` with a theme from `requirements/groups.json`.
The allocator reserves numbers across HLR and LLR within that theme.

Implementation uses a standalone language comment such as
`// @llr LLR-SRV-MEDIA-016` immediately before the owning declaration or
cohesive block. Separate multiple IDs with a comma and a space.

A test begins with standalone `@test`, `@requirements`, `@environment`,
`@plan` and `@pass` comments. Link LLT directly to an LLR and HLT directly to
an HLR. State inputs, procedure and expected assertions. Refer to the test from
each Doorstop item. Product tests belong under `tests/server/LLT/` and
`tests/server/HLT/`; tooling tests belong under `tests/adhoc/`. An inventory or
plan does not record an execution. Follow the
[requirement authoring guidance](../requirements/README.md#writing-verifiable-requirements).

Use an issue and a `codex/` feature branch for each change. Open a pull request
to `main`, resolve failures, and merge through GitHub only when Verify passes
on the current pull-request commit. Increase `VERSION.json` for runtime,
package or release changes. Packaged documentation and release-guide sources
are release inputs too.

## Three-network Docker lab

The disposable lab is owned by
[Zmala](https://github.com/toastfr35/Zmala/blob/main/tests/support/network_lab/README.md).
Follow that checkout's instructions to prepare its pinned application input.
The Server launchers do not automatically substitute the current checkout for
the input selected by the image builder. Record the input revisions with results.

Set `ZMALA_IMAGE_BUILDER_ROOT` to the absolute path of that reviewed checkout,
then run the relevant opt-in scenario on a prepared Linux host:

```sh
python tests/server/HLT/network_lab.py
python tests/server/HLT/network_lab.py --udp-blocked
python tests/server/HLT/secure_network_lab.py
```

These scenarios use Docker networks and synthetic media. They do not connect
to installed family devices or qualify physical C20, TV or Bluetooth behavior.

## Packages and release guides

Build a local package and the two release PDFs into temporary output directories:

```sh
python build_tools/linux/package-server.py --output ../tmp/server-dev/ZmalaServer-local-linux-arm64.tar.gz
python -m pip install --cache-dir "$TMPDIR/pip-cache" -r build_tools/release/requirements.txt
python build_tools/release/guides.py --component server --output ../tmp/server-dev/guides
```

[`server_prep.docx`](server_prep.docx) is the editable source for both
`ZmalaServer-Installation.pdf` and `ZmalaServer-Guide.pdf`.
`build_tools/release/guides.py` selects installation sections by exact Heading 1
text; coordinate heading changes with its `SERVER_INSTALL` list. Render and
inspect the Word source and both generated PDFs after edits. Do not commit
generated PDFs or local packages.

The package includes `docs/general.md`, `docs/server.md`, tracked Server source
and the selected installation helpers. It identifies the component version and
commit in `ZMALA-COMPONENT.json` and includes payload checksums. A local archive
can include uncommitted file content; use a clean, verified commit for releases.

After merging, run Verify through `workflow_dispatch` on the resulting `main`
commit. Then dispatch Release on that same commit. Release builds the archive,
SHA-256 sidecar and two PDFs, and publishes `v<version>`. It refuses a superseded
main commit, a duplicate tag or an unexpected asset list. Release does not run
the full Verify suite itself; a successful package build is not a substitute.
