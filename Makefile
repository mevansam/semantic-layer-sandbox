SEMTOOL := python3 enterprise-semantic-governance/tools/semtool.py
TEMPLATE := domains/domain-template
# Every sub-domain (a folder with semantic.yaml under domains/<business-domain>/) and every parent layer.
SUBDOMAINS := $(patsubst %/semantic.yaml,%,$(wildcard domains/*/*/semantic.yaml))
BUSINESS_DOMAINS := $(filter-out $(TEMPLATE),$(patsubst %/semantic.yaml,%,$(wildcard domains/*/semantic.yaml)))

.PHONY: help fibo verify verify-governance verify-fibo verify-domains verify-template drift changes selftest align hermit taxonomy capabilities codeowners list

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
	@echo "  make fibo              check out FIBO (pinned submodule)"
	@echo "  make list              list business domains and sub-domains"
	@echo "  make verify-template   generate the worked examples from the template and verify them"

# FIBO is a git submodule pinned to a release. Works whether this is one monorepo
# (submodule registered at the root) or separate repositories (registered in fibo-extensions).
fibo:
	git submodule update --init --depth 1 fibo-extensions/vendor/fibo 2>/dev/null || git -C fibo-extensions submodule update --init --depth 1

verify: verify-governance verify-fibo verify-domains verify-template

verify-governance:
	$(SEMTOOL) verify --repo enterprise-semantic-governance

verify-fibo:
	$(SEMTOOL) verify --repo fibo-extensions

# Sub-domains first, then each business domain's parent layer (reasons over all its sub-domains together).
verify-domains:
	@set -e; for d in $(SUBDOMAINS) $(BUSINESS_DOMAINS); do $(SEMTOOL) verify --repo $$d; done

# Generate throw-away sub-domains from the template (both worked examples) and run every gate on them.
verify-template:
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
hermit:
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
