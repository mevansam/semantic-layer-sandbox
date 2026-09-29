SEMTOOL := python3 enterprise-semantic-governance/tools/semtool.py

.PHONY: fibo verify verify-governance verify-fibo verify-domains verify-template align hermit taxonomy capabilities

# FIBO is a git submodule pinned to a release. Works whether this is one monorepo
# (submodule registered at the root) or four repositories (registered in fibo-extensions).
fibo:
	git submodule update --init --depth 1 fibo-extensions/vendor/fibo 2>/dev/null || git -C fibo-extensions submodule update --init --depth 1

verify: verify-governance verify-fibo verify-domains verify-template

verify-governance:
	$(SEMTOOL) verify --repo enterprise-semantic-governance

verify-fibo:
	$(SEMTOOL) verify --repo fibo-extensions

verify-domains:
	$(SEMTOOL) verify --repo planning-and-guidance-financial-plan-management

# Generate a throw-away domain from the template and run every gate on it.
verify-template:
	rm -rf _template-check
	python3 domain-template/scripts/new_domain.py --answers domain-template/answers/pg-fpm.yaml --out _template-check --no-git
	$(SEMTOOL) verify --repo _template-check
	rm -rf _template-check

hermit:
	$(SEMTOOL) reason --reasoner HermiT --repo planning-and-guidance-financial-plan-management

taxonomy:
	$(SEMTOOL) taxonomy

capabilities:
	$(SEMTOOL) capabilities

# Show how each domain repo lines up with domain-template (unchanged / edited / added / seed-only).
align:
	python3 domain-template/scripts/compare_domain.py planning-and-guidance-financial-plan-management
