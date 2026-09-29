SEMTOOL := python3 enterprise-semantic-governance/tools/semtool.py
TEMPLATE := domains/domain-template
# Every sub-domain (a folder with semantic.yaml under domains/<business-domain>/) and every parent layer.
SUBDOMAINS := $(patsubst %/semantic.yaml,%,$(wildcard domains/*/*/semantic.yaml))
BUSINESS_DOMAINS := $(filter-out $(TEMPLATE),$(patsubst %/semantic.yaml,%,$(wildcard domains/*/semantic.yaml)))

.PHONY: fibo verify verify-governance verify-fibo verify-domains verify-template align hermit taxonomy capabilities list

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

# How each sub-domain lines up with the template (unchanged / edited / added / seed-only).
align:
	@set -e; for d in $(SUBDOMAINS); do echo "== $$d"; python3 $(TEMPLATE)/scripts/compare_domain.py $$d | tail -1; done

# Full OWL DL reasoning (HermiT) over each business domain with all its sub-domains and FIBO.
hermit:
	@set -e; for d in $(BUSINESS_DOMAINS); do $(SEMTOOL) reason --reasoner HermiT --repo $$d; done

taxonomy:
	$(SEMTOOL) taxonomy --repo enterprise-semantic-governance

capabilities:
	$(SEMTOOL) capabilities --repo enterprise-semantic-governance

list:
	@echo "business domains: $(BUSINESS_DOMAINS)"; echo "sub-domains:      $(SUBDOMAINS)"
