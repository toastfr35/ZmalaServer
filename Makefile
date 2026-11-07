PYTHON ?= python3
NODE ?= node

.PHONY: requirements requirements-check
requirements:
	$(PYTHON) build_tools/requirements.py

requirements-check:
	$(PYTHON) build_tools/requirements.py --check

test-llt:
	$(NODE) build_tools/run-tests.cjs LLT
	$(PYTHON) -m unittest discover -s tests/server/LLT -t .

test-hlt:
	$(NODE) build_tools/run-tests.cjs HLT
	$(PYTHON) -m unittest discover -s tests/server/HLT -t .

test-adhoc:
	$(NODE) build_tools/run-tests.cjs adhoc
	$(PYTHON) -m unittest discover -s tests/adhoc -t .

lint:
	npm run typecheck
	npm run build:check
	$(PYTHON) -m ruff check .

package:
	$(PYTHON) build_tools/linux/package-server.py
