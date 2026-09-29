SEMTOOL := python3 enterprise-semantic-governance/tools/semtool.py

.PHONY: verify verify-governance verify-fibo verify-domains verify-template hermit taxonomy capabilities

verify: verify-governance verify-fibo verify-domains verify-template

verify-governance:
	$(SEMTOOL) verify --repo enterprise-semantic-governance

verify-fibo:
	$(SEMTOOL) verify --repo fibo-extensions

verify-domains:
	$(SEMTOOL) verify --repo rwpa-self-directed-planning

# Generate a throw-away domain from the template and run every gate on it.
verify-template:
	rm -rf _template-check
	python3 domain-template/scripts/new_domain.py --answers domain-template/answers/rwpa-sdp.yaml --out _template-check --no-git
	$(SEMTOOL) verify --repo _template-check
	rm -rf _template-check

hermit:
	$(SEMTOOL) reason --reasoner HermiT --repo rwpa-self-directed-planning

taxonomy:
	$(SEMTOOL) taxonomy

capabilities:
	$(SEMTOOL) capabilities
