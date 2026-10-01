# Every prerequisite is set up automatically, once, by the targets that need it:
#   Python packages (venv/)  ->  every target that runs the tools
#   FIBO checkout + OMG Commons/LCC + Java check + ROBOT  ->  targets that reason (verify, hermit, ...)
# `make setup` does all of it up front. Nothing needs to be run by hand.

# ---- Python environment ---------------------------------------------------------------------
# A virtualenv in venv/ (git-ignored), (re)installed when requirements.txt changes.
# USE_VENV=0 uses the current python3 as is (you install the requirements yourself).
USE_VENV      ?= 1
VENV          := $(CURDIR)/venv
REQUIREMENTS  := enterprise-governance/requirements.txt
ifeq ($(USE_VENV),1)
PYTHON        := $(VENV)/bin/python3
PY_READY      := $(VENV)/.installed
else
PYTHON        ?= python3
PY_READY      :=
endif
SEMTOOL := $(PYTHON) enterprise-governance/tools/semtool.py
TEMPLATE := domains/domain-template
# Every sub-domain (a folder with semantic.yaml under domains/<business-domain>/) and every parent layer.
SUBDOMAINS := $(patsubst %/semantic.yaml,%,$(wildcard domains/*/*/semantic.yaml))
BUSINESS_DOMAINS := $(filter-out $(TEMPLATE),$(patsubst %/semantic.yaml,%,$(wildcard domains/*/semantic.yaml)))

# ---- Reasoner toolchain (gate G4) -----------------------------------------------------------
# ROBOT is downloaded once to build/tools/ (git-ignored) and ROBOT_JAR is exported to every command
# make runs. Override with `make verify ROBOT_JAR=/path/robot.jar` or an exported ROBOT_JAR.
ROBOT_VERSION ?= v1.9.10
JAVA_MIN      ?= 11
TOOLS_DIR     := $(CURDIR)/build/tools
ROBOT_JAR     ?= $(TOOLS_DIR)/robot-$(ROBOT_VERSION).jar
ROBOT_URL     := https://github.com/ontodev/robot/releases/download/$(ROBOT_VERSION)/robot.jar
export ROBOT_JAR

# ---- FIBO and its OMG dependencies ----------------------------------------------------------
# FIBO is a git submodule pinned by the repository (gitlink). It is (re)checked out when missing or
# when the pin changes. FIBO's OMG Commons + LCC imports are fetched from www.omg.org into
# fibo-extensions/vendor/omg/ (git-ignored) once per FIBO pin. If www.omg.org can't be reached the
# build continues with a warning (reasoning runs without them) and the fetch is retried next time;
# SKIP_OMG=1 skips it.
FIBO_DIR      := fibo-extensions/vendor/fibo
OMG_DIR       := fibo-extensions/vendor/omg
FIBO_PIN      := $(shell git ls-files -s $(FIBO_DIR) 2>/dev/null | awk '{print $$2}')
FIBO_TAG      := $(shell sed -n 's/^ *release_tag: *//p' enterprise-governance/semantic.yaml | head -1)
FIBO_READY    := $(TOOLS_DIR)/fibo-$(or $(FIBO_PIN),unpinned)-$(FIBO_TAG).stamp
OMG_READY     := $(OMG_DIR)/.fetched-$(or $(FIBO_PIN),unpinned)

# Everything the reasoning targets need.
REASONING_DEPS := $(PY_READY) tools $(FIBO_READY) $(OMG_READY)

.PHONY: help setup python tools check-java omg env clean-tools fibo verify verify-governance verify-fibo verify-domains verify-template drift changes selftest align hermit taxonomy capabilities codeowners list \
        studio studio-data studio-app studio-serve studio-docker studio-fresh studio-lock studio-lock-check check-node check-docker clean-studio

# `make` or `make help` lists the targets. Full reference: docs/framework/08-validation-tooling.md
help:
	@echo "Validation (see docs/framework/08-validation-tooling.md)"
	@echo "  make verify            all gates G1-G8 for every repository, sub-domain, business domain + template check"
	@echo "  make drift             gate G8 only (repeated facts agree, generated files current) - fast"
	@echo "  make changes BASE=ref  version bumps match change classes against a git ref (default origin/main; STRICT=1 also fails on Provisional)"
	@echo "  make hermit            full OWL DL reasoning (HermiT) per business domain"
	@echo "  make align             sub-domains still match domain-template (fails on drifted template-owned files)"
	@echo "  make selftest          prove every check still catches what it should (after changing the tooling)"
	@echo "Generate (commit the result)"
	@echo "  make taxonomy          taxonomy/source/*.md  -> taxonomy/enterprise-taxonomy.ttl"
	@echo "  make capabilities      capabilities/source + curation.yaml -> capability-map.ttl + data-quality-report.md"
	@echo "  make codeowners        domain-manifest.ttl -> CODEOWNERS for every sub-domain"
	@echo "Setup (all automatic when a target needs it; listed for doing it up front)"
	@echo "  make setup             everything below: Python venv, Java check, ROBOT, FIBO checkout, OMG dependencies"
	@echo "  make python            venv/ with the Python requirements (USE_VENV=0 to use your own python3)"
	@echo "  make tools             check Java (>= $(JAVA_MIN)) and download ROBOT $(ROBOT_VERSION) to build/tools/"
	@echo "  make fibo              check out FIBO at the pinned commit"
	@echo "  make omg               fetch FIBO's OMG Commons + LCC dependencies (SKIP_OMG=1 to skip)"
	@echo "  make env               print 'export ROBOT_JAR=...' for running semtool directly: eval \"\$$(make -s env)\""
	@echo "  make clean-tools       remove build/tools/ and the OMG download (fetched again on next use)"
	@echo "  make list              list business domains and sub-domains"
	@echo "  make verify-template   generate the worked examples from the template and verify them"
	@echo "Semantic Studio (semantic-studio/README.md)"
	@echo "  make studio            export the data and build the site into semantic-studio/build/site (needs Node >= $(NODE_MIN))"
	@echo "  make studio-serve      build, then serve it with SPARQL on http://localhost:$(STUDIO_PORT)/"
	@echo "  make studio-docker     export the data, then build and run the studio in Docker (Node not needed)"
	@echo "  make studio-fresh      verify + hermit + selftest first, so the Health page is current, then studio"
	@echo "  make studio-data       export the data only (semantic-studio/build/site/data)"
	@echo "  make studio-lock       re-resolve npm dependencies to versions at least $(STUDIO_MIN_AGE_HOURS) h old (commit package-lock.json)"
	@echo "  make studio-lock-check check every locked npm version is at least $(STUDIO_MIN_AGE_HOURS) h old"

# ---- Setup ----------------------------------------------------------------------------------
setup: $(PY_READY) tools $(FIBO_READY) $(OMG_READY)
	@echo "Setup complete."

python: $(PY_READY)

# PYTHON_BOOT is the interpreter that creates the venv (e.g. make setup PYTHON_BOOT=python3.12).
PYTHON_BOOT ?= python3
$(VENV)/.installed: $(REQUIREMENTS)
	@command -v $(PYTHON_BOOT) >/dev/null 2>&1 || { echo "ERROR: $(PYTHON_BOOT) not found. Install Python >= 3.10 (macOS: brew install python@3.12)"; exit 1; }
	@$(PYTHON_BOOT) -c 'import sys; sys.exit(sys.version_info < (3, 10))' || { \
	   echo "ERROR: $$($(PYTHON_BOOT) --version 2>&1) is too old; Python >= 3.10 is required."; \
	   echo "       Install one (macOS: brew install python@3.12) and run: make setup PYTHON_BOOT=python3.12"; exit 1; }
	@test -x $(PYTHON) || { echo "Creating Python virtualenv in venv/ ($$($(PYTHON_BOOT) --version 2>&1))"; $(PYTHON_BOOT) -m venv $(VENV); }
	@echo "Installing Python requirements into venv/"
	@$(VENV)/bin/pip install -q --disable-pip-version-check -r $(REQUIREMENTS)
	@touch $@

tools: check-java $(ROBOT_JAR)
	@echo "ROBOT ready: $(ROBOT_JAR)"

# Java must be installed and at least JAVA_MIN (ROBOT 1.9 needs Java 11+; CI uses 17).
check-java:
	@command -v java >/dev/null 2>&1 || { \
	  echo "ERROR: Java not found. Install a JDK >= $(JAVA_MIN), e.g."; \
	  echo "  macOS:  brew install --cask temurin@17"; \
	  echo "  Ubuntu: sudo apt-get install -y openjdk-17-jre-headless"; exit 1; }
	@major=$$(java -version 2>&1 | sed -n 's/.*version "\([0-9][0-9]*\)\.\{0,1\}\([0-9]*\).*/\1 \2/p' | head -1 | \
	          awk '{ print ($$1 == 1 ? $$2 : $$1) }'); \
	 if [ -z "$$major" ]; then \
	   echo "ERROR: 'java' is on the PATH but does not run (no JDK installed?). Output of java -version:"; \
	   java -version 2>&1 | grep -v '^Picked up' | sed 's/^/  /'; exit 1; fi; \
	 if [ "$$major" -lt $(JAVA_MIN) ]; then \
	   echo "ERROR: Java $$major found; ROBOT needs Java >= $(JAVA_MIN). Install a newer JDK (e.g. temurin@17)."; exit 1; fi; \
	 echo "Java $$major found"

# Download ROBOT once (order-only on check-java: Java is checked first, even with make -j).
$(ROBOT_JAR): | check-java
	@mkdir -p $(dir $@)
	@echo "Downloading ROBOT $(ROBOT_VERSION) -> $@"
	@curl -fsSL -o $@.part $(ROBOT_URL) || { rm -f $@.part; echo "ERROR: download failed: $(ROBOT_URL)"; exit 1; }
	@java -jar $@.part --version >/dev/null 2>&1 || { rm -f $@.part; echo "ERROR: downloaded file is not a working ROBOT jar"; exit 1; }
	@mv $@.part $@

# For running semtool outside make:  eval "$$(make -s env)"  (activates nothing; just sets ROBOT_JAR)
env:
	@echo "export ROBOT_JAR=$(ROBOT_JAR)"

clean-tools:
	rm -rf $(TOOLS_DIR) $(OMG_DIR)

fibo: $(FIBO_READY)

# Check out FIBO at the pinned commit (monorepo: submodule at the root; split repos: in fibo-extensions).
$(FIBO_READY):
	@mkdir -p $(dir $@)
	@if [ -n "$(FIBO_PIN)" ]; then \
	   echo "Checking out FIBO at the pinned commit $(FIBO_PIN)"; \
	   git submodule update --init --depth 1 $(FIBO_DIR) 2>/dev/null \
	   || git -C fibo-extensions submodule update --init --depth 1 2>/dev/null \
	   || echo "WARNING: could not update the FIBO submodule; using the existing checkout"; \
	 fi
	@git -C $(FIBO_DIR) fetch -q --depth 1 origin tag $(FIBO_TAG) 2>/dev/null \
	   || echo "Note: could not fetch FIBO tag $(FIBO_TAG); 'make drift' (D10) then can't confirm the checkout is that release"
	@test -f $(FIBO_DIR)/catalog-v001.xml || { \
	   echo "ERROR: FIBO is not checked out in $(FIBO_DIR). Clone the repository with git (FIBO is a submodule)"; \
	   echo "       and make sure github.com/edmcouncil/fibo is reachable."; exit 1; }
	@rm -f $(TOOLS_DIR)/fibo-*.stamp; touch $@

# `make omg` (re)tries the fetch explicitly, e.g. after a failed automatic attempt.
omg:
	@rm -f $(OMG_DIR)/.failed-*
	@$(MAKE) --no-print-directory $(OMG_READY)

# Automatic: attempted once per FIBO pin. A failure is a warning, never a build failure; it is
# remembered (.failed-<pin>) so later runs don't retry until `make omg`. SKIP_OMG=1 skips it.
$(OMG_READY): $(FIBO_READY)
	@if [ -n "$(SKIP_OMG)" ]; then exit 0; fi; \
	 failed=$(OMG_DIR)/.failed-$(or $(FIBO_PIN),unpinned); \
	 if [ -f $$failed ]; then \
	   echo "Note: FIBO's OMG Commons/LCC dependencies are not available (last fetch failed); reasoning runs without them. Retry: make omg"; exit 0; fi; \
	 echo "Fetching FIBO's OMG Commons + LCC dependencies into $(OMG_DIR)"; \
	 if bash fibo-extensions/scripts/fetch-omg-dependencies.sh; then \
	   rm -f $(OMG_DIR)/.fetched-* $(OMG_DIR)/.failed-*; touch $@; \
	 else \
	   mkdir -p $(OMG_DIR); touch $$failed; \
	   echo "WARNING: OMG Commons/LCC could not be fetched (is www.omg.org reachable?). Reasoning continues without"; \
	   echo "         them (closure warns 'unresolved imports'). Retry later with: make omg"; \
	 fi

verify: verify-governance verify-fibo verify-domains verify-template

verify-governance: $(PY_READY)
	$(SEMTOOL) verify --repo enterprise-governance

verify-fibo: $(REASONING_DEPS)
	$(SEMTOOL) verify --repo fibo-extensions

# Sub-domains first, then each business domain's parent layer (reasons over all its sub-domains together).
# Every repository is verified even when an earlier one fails (so each has a current report); fails at the end.
verify-domains: $(REASONING_DEPS)
	@rc=0; for d in $(SUBDOMAINS) $(BUSINESS_DOMAINS); do $(SEMTOOL) verify --repo $$d || rc=1; done; exit $$rc

# Generate throw-away sub-domains from the template (both worked examples) and run every gate on them.
verify-template: $(REASONING_DEPS)
	rm -rf _template-check
	$(PYTHON) $(TEMPLATE)/scripts/new_domain.py --answers $(TEMPLATE)/answers/rwm-fp.yaml --out _template-check/rwm/financial-planning --no-git
	$(PYTHON) $(TEMPLATE)/scripts/new_domain.py --answers $(TEMPLATE)/answers/rwm-ia.yaml --out _template-check/rwm/insights-and-analytics --no-git
	$(SEMTOOL) verify --repo _template-check/rwm/financial-planning
	$(SEMTOOL) verify --repo _template-check/rwm/insights-and-analytics
	rm -rf _template-check

# Gate G8 on its own: facts repeated across files agree, generated files are current (also part of `verify`).
drift: $(PY_READY)
	@set -e; for d in enterprise-governance fibo-extensions $(BUSINESS_DOMAINS) $(SUBDOMAINS); do $(SEMTOOL) drift --repo $$d; done

# Pull requests: every changed module bumps its version by at least its change class; changed knowledge
# bumps the collection version; changes to machine-checked standards carry an ADR.  make changes BASE=origin/main
BASE ?= origin/main
changes: $(PY_READY)
	@set -e; for d in enterprise-governance fibo-extensions $(BUSINESS_DOMAINS) $(SUBDOMAINS); do $(SEMTOOL) changes --base $(BASE) --repo $$d $(if $(STRICT),--strict,); done

# Self-test of the tooling: each check must catch a seeded defect (enterprise-governance/tools/tests).
selftest: $(PY_READY)
	$(PYTHON) enterprise-governance/tools/tests/selftest.py

# How each sub-domain lines up with the template (unchanged / edited / added / seed-only).
align: $(PY_READY)
	@rc=0; for d in $(SUBDOMAINS); do echo "== $$d"; out=$$($(PYTHON) $(TEMPLATE)/scripts/compare_domain.py $$d) || rc=1; \
	  echo "$$out" | awk '/^(DRIFTED|MISSING)/{p=1} /^$$/{p=0} p'; echo "$$out" | tail -1; done; exit $$rc

# Full OWL DL reasoning (HermiT) over each business domain with all its sub-domains and FIBO.
hermit: $(REASONING_DEPS)
	@rc=0; for d in $(BUSINESS_DOMAINS); do $(SEMTOOL) reason --reasoner HermiT --repo $$d || rc=1; done; exit $$rc

taxonomy: $(PY_READY)
	$(SEMTOOL) taxonomy --repo enterprise-governance

capabilities: $(PY_READY)
	$(SEMTOOL) capabilities --repo enterprise-governance

# Regenerate every sub-domain's CODEOWNERS from its domain-manifest.ttl (commit the result).
codeowners: $(PY_READY)
	@set -e; for d in $(SUBDOMAINS); do $(SEMTOOL) codeowners --repo $$d; done

list:
	@echo "business domains: $(BUSINESS_DOMAINS)"; echo "sub-domains:      $(SUBDOMAINS)"

# ---- Semantic Studio (semantic-studio/, ADR-0008) --------------------------------------------
# A read-only web view of everything above. `make studio` exports the data (Python, from the repositories
# and the reports `make verify` / `hermit` / `selftest` leave in build/reports) and builds the site (Node).
# The Health page shows the gate results of the last runs: `make studio-fresh` runs them first.
STUDIO_DIR    := semantic-studio
STUDIO_SITE   := $(STUDIO_DIR)/build/site
STUDIO_PORT   ?= 8787
STUDIO_IMAGE  ?= semantic-studio
NODE_MIN      ?= 20
STUDIO_NODE_READY := $(STUDIO_DIR)/node_modules/.installed

studio: studio-data studio-app
	@echo "Semantic Studio built: $(STUDIO_SITE)/  (serve it with: make studio-serve)"

studio-data: $(PY_READY) $(FIBO_READY)
	$(PYTHON) $(STUDIO_DIR)/exporter/export_site_data.py

studio-app: $(STUDIO_NODE_READY)
	cd $(STUDIO_DIR) && node build.mjs

studio-serve: studio
	$(PYTHON) $(STUDIO_DIR)/server/studio_server.py --site $(STUDIO_SITE) --port $(STUDIO_PORT)

# The checks may fail: the studio is built anyway, to show what failed (make reports the failures, exit 0).
studio-fresh:
	-$(MAKE) -k --no-print-directory verify
	-$(MAKE) --no-print-directory hermit
	-$(MAKE) --no-print-directory selftest
	$(MAKE) --no-print-directory studio

# Docker builds the site in the image (Node stage), so Node is not needed; the data is exported here with the
# usual Python setup. The port is published on this machine only (127.0.0.1).
# Behind a proxy: your npm registry and ~/.npmrc (as a build secret) and pip index are passed to the build;
# override with NPM_REGISTRY=... / PIP_INDEX_URL=...
NPM_REGISTRY  = $(shell npm config get registry 2>/dev/null)
PIP_INDEX_URL = $(shell $(PYTHON) -m pip config get global.index-url 2>/dev/null)
comma := ,
studio-docker: check-docker studio-data
	DOCKER_BUILDKIT=1 docker build -t $(STUDIO_IMAGE) \
	  --build-arg NPM_REGISTRY=$(NPM_REGISTRY) --build-arg PIP_INDEX_URL=$(PIP_INDEX_URL) \
	  $(if $(wildcard $(HOME)/.npmrc),--secret id=npmrc$(comma)src=$(HOME)/.npmrc) $(STUDIO_DIR)
	@echo "Semantic Studio: http://localhost:$(STUDIO_PORT)/   (Ctrl-C to stop)"
	docker run --rm $$( [ -t 0 ] && echo -it ) -p 127.0.0.1:$(STUDIO_PORT):8787 $(STUDIO_IMAGE)

check-node:
	@command -v node >/dev/null 2>&1 && command -v npm >/dev/null 2>&1 || { \
	  echo "ERROR: Node.js not found. Install Node >= $(NODE_MIN) (macOS: brew install node), or use make studio-docker"; exit 1; }
	@major=$$(node -p 'process.versions.node.split(".")[0]'); if [ "$$major" -lt $(NODE_MIN) ]; then \
	  echo "ERROR: Node $$major found; Semantic Studio needs Node >= $(NODE_MIN) (or use make studio-docker)"; exit 1; fi

check-docker:
	@command -v docker >/dev/null 2>&1 || { echo "ERROR: Docker not found. Install Docker Desktop (or use make studio-serve)"; exit 1; }
	@docker info >/dev/null 2>&1 || { echo "ERROR: Docker is installed but not running. Start Docker Desktop and retry."; exit 1; }

# JavaScript dependencies at the versions in package-lock.json (npm ci), reinstalled when either file changes.
# To add or upgrade a dependency: edit package.json, run `npm install` in semantic-studio/, commit both files.
$(STUDIO_NODE_READY): $(STUDIO_DIR)/package.json $(STUDIO_DIR)/package-lock.json | check-node
	@echo "Installing Semantic Studio's JavaScript dependencies into $(STUDIO_DIR)/node_modules/"
	@cd $(STUDIO_DIR) && npm ci --no-audit --no-fund || { \
	  echo "ERROR: npm ci failed. If the npm proxy refused a package as too new, run: make studio-lock"; exit 1; }
	@touch $@

# Dependencies must be versions published at least STUDIO_MIN_AGE_HOURS ago (the enterprise npm proxy blocks
# newer ones). studio-lock re-resolves package-lock.json under that rule; studio-lock-check verifies it.
STUDIO_MIN_AGE_HOURS ?= 72
export STUDIO_MIN_AGE_HOURS
studio-lock: check-node
	cd $(STUDIO_DIR) && node scripts/lock.mjs

studio-lock-check: check-node
	cd $(STUDIO_DIR) && node scripts/lock.mjs --check

clean-studio:
	rm -rf $(STUDIO_DIR)/build $(STUDIO_DIR)/node_modules
