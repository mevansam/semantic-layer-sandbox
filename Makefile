SEMTOOL := python3 enterprise-semantic-governance/tools/semtool.py
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

.PHONY: help tools check-java env clean-tools fibo verify verify-governance verify-fibo verify-domains verify-template drift changes selftest align hermit taxonomy capabilities codeowners list

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
	@echo "Setup and info"
	@echo "  make tools             check Java (>= $(JAVA_MIN)) and download ROBOT $(ROBOT_VERSION) to build/tools/ (automatic for targets that reason)"
	@echo "  make env               print 'export ROBOT_JAR=...' for running semtool directly: eval \"\$$(make -s env)\""
	@echo "  make clean-tools       remove build/tools/ (downloaded on next use)"
	@echo "  make fibo              check out FIBO (pinned submodule)"
	@echo "  make list              list business domains and sub-domains"
	@echo "  make verify-template   generate the worked examples from the template and verify them"

# ---- Toolchain ------------------------------------------------------------------------------
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

# For running semtool outside make:  eval "$$(make -s env)"
env:
	@echo "export ROBOT_JAR=$(ROBOT_JAR)"

clean-tools:
	rm -rf $(TOOLS_DIR)

# FIBO is a git submodule pinned to a release. Works whether this is one monorepo
# (submodule registered at the root) or separate repositories (registered in fibo-extensions).
fibo:
	git submodule update --init --depth 1 fibo-extensions/vendor/fibo 2>/dev/null || git -C fibo-extensions submodule update --init --depth 1

verify: verify-governance verify-fibo verify-domains verify-template

verify-governance:
	$(SEMTOOL) verify --repo enterprise-semantic-governance

verify-fibo: tools
	$(SEMTOOL) verify --repo fibo-extensions

# Sub-domains first, then each business domain's parent layer (reasons over all its sub-domains together).
verify-domains: tools
	@set -e; for d in $(SUBDOMAINS) $(BUSINESS_DOMAINS); do $(SEMTOOL) verify --repo $$d; done

# Generate throw-away sub-domains from the template (both worked examples) and run every gate on them.
verify-template: tools
	rm -rf _template-check
	python3 $(TEMPLATE)/scripts/new_domain.py --answers $(TEMPLATE)/answers/rwm-fp.yaml --out _template-check/rwm/financial-planning --no-git
	python3 $(TEMPLATE)/scripts/new_domain.py --answers $(TEMPLATE)/answers/rwm-ia.yaml --out _template-check/rwm/insights-and-analytics --no-git
	$(SEMTOOL) verify --repo _template-check/rwm/financial-planning
	$(SEMTOOL) verify --repo _template-check/rwm/insights-and-analytics
	rm -rf _template-check

# Gate G8 on its own: facts repeated across files agree, generated files are current (also part of `verify`).
drift:
	@set -e; for d in enterprise-semantic-governance fibo-extensions $(BUSINESS_DOMAINS) $(SUBDOMAINS); do $(SEMTOOL) drift --repo $$d; done

# Pull requests: every changed module bumps its version by at least its change class; changed knowledge
# bumps the collection version; changes to machine-checked standards carry an ADR.  make changes BASE=origin/main
BASE ?= origin/main
changes:
	@set -e; for d in enterprise-semantic-governance fibo-extensions $(BUSINESS_DOMAINS) $(SUBDOMAINS); do $(SEMTOOL) changes --base $(BASE) --repo $$d $(if $(STRICT),--strict,); done

# Self-test of the tooling: each check must catch a seeded defect (enterprise-semantic-governance/tools/tests).
selftest:
	python3 enterprise-semantic-governance/tools/tests/selftest.py

# How each sub-domain lines up with the template (unchanged / edited / added / seed-only).
align:
	@rc=0; for d in $(SUBDOMAINS); do echo "== $$d"; out=$$(python3 $(TEMPLATE)/scripts/compare_domain.py $$d) || rc=1; \
	  echo "$$out" | awk '/^(DRIFTED|MISSING)/{p=1} /^$$/{p=0} p'; echo "$$out" | tail -1; done; exit $$rc

# Full OWL DL reasoning (HermiT) over each business domain with all its sub-domains and FIBO.
hermit: tools
	@set -e; for d in $(BUSINESS_DOMAINS); do $(SEMTOOL) reason --reasoner HermiT --repo $$d; done

taxonomy:
	$(SEMTOOL) taxonomy --repo enterprise-semantic-governance

capabilities:
	$(SEMTOOL) capabilities --repo enterprise-semantic-governance

# Regenerate every sub-domain's CODEOWNERS from its domain-manifest.ttl (commit the result).
codeowners:
	@set -e; for d in $(SUBDOMAINS); do $(SEMTOOL) codeowners --repo $$d; done

list:
	@echo "business domains: $(BUSINESS_DOMAINS)"; echo "sub-domains:      $(SUBDOMAINS)"
