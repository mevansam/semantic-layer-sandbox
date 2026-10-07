# Changelog

Notable changes to the semantic layer: tooling, structure, content milestones and fixes. **Decisions** that bind domains are in [ADRs](enterprise-governance/docs/adr/README.md); this file is the history around them. Newest first.

## 2026-10-06

- **Decision records narrowed; rules link to their decisions** (ADR-0010).
  - ADRs 0003, 0008 and 0009 were retired here, and the remaining ADRs were cut down to their reasoning and the alternatives they rejected.
  - Enterprise rules are catalogued in `enterprise-governance/standards/enterprise-rules.ttl`. Each rule, and each meta-shape, links to the standard that defines it and to the ADR that justifies it.
  - New in the tooling:
    - `semtool decisions` / `make decisions` generates `standards/decision-register.ttl` from the ADR files
    - drift check D11 checks the links
    - Semantic Studio shows a rule's decision, and a decision's rules
- **Changelog** introduced (this file).

## 2026-10-01

- **Governance repository renamed** from `enterprise-semantic-governance` to `enterprise-governance`.
  - Every reference was updated: configuration, the domain template and the generated sub-domains, CI, `make`, the self-test, Semantic Studio and the docs.
  - IRIs did not change. Domain repositories generated earlier need `copier update`.
  - `make changes` against an earlier commit lists the governance modules as new. *(formerly ADR-0009)*
- **Semantic Studio**: a read-only web view of the semantic layer, in `semantic-studio/`.
  - **Pages:** domains, every term, the capability map, the taxonomy, FIBO, graphs, governance, health, docs, search, and SPARQL through a read-only server.
  - **Build:** `make studio`, `studio-serve`, `studio-docker` and `studio-fresh` build and run it, generated from the repositories at one commit.
  - **Reports:** `semtool` now leaves a report of every check in `build/reports/` for its Health page.
  - **npm dependencies:** pinned by `package-lock.json`, and every version must be at least 72 hours old for the enterprise npm proxy (`make studio-lock`, `studio-lock-check`).
  - See `semantic-studio/docs/architecture.md`. *(formerly ADR-0008)*
- **Known upstream FIBO defects**: register and closure patching (ADR-0007). UP-001 (`hasVestedInIt`) is the first entry. With it, the closure classifies with ELK and HermiT whether or not OMG Commons/LCC are present.
- `make verify-domains` and `make hermit` check every repository before failing.

## 2026-09-30

- **Gate G8 (drift) and the pull-request change-class check** (ADR-0006).
  - Their first run found the Insights and Analytics manifest missing its `assessments` module, and duplicate partitions and policy blocks in both sub-domains' `collections.ttl`. All were fixed.
  - `semtool rebase --all` now reaches nested sub-domains and the template. The reusable CI workflow takes a `path` input.
- **Self-test** of every check (`make selftest`), and the validation tooling reference (framework doc 08).
- **`make` sets up everything automatically**: Python venv, Java check, ROBOT, FIBO checkout, OMG Commons/LCC.
- **Framework guide**, with Mermaid diagrams (`docs/framework/`). The folder-level tool instructions were replaced by the root README's run, validate and test sections.

## 2026-09-29

- **Sub-domain "Planning and Guidance" renamed to "Financial Planning"**, so it can't be confused with the capability map's ontology domain of that name.
- **Retail Wealth Management split into two sub-domains** (ADR-0005).
  - **Financial Planning** (`rwm-fp`) publishes `planning`. **Insights and Analytics** (`rwm-ia`) builds on it.
  - The interim repository `planning-and-guidance-financial-plan-management` (`pg-fpm`), set up under the first capability-map import, was retired. Financial Plan Management is again a capability gap in the map.
  - The advice boundary (ALN-002) now runs inside Retail Wealth Management.
- **Domain repository aligned with the domain template**; capability map updated to the curated import.

## 2026-09-28

- **Curated import of the authoritative capability map** (ADR-0004). It replaced a provisional map derived from the taxonomy, which had been used until the real map arrived. The provisional map covered Retail Wealth Planning & Advisory in detail and a few domains at a high level. *(formerly ADR-0003)*
- **Baseline**:
  - governance repository, FIBO extensions and the domain template
  - FIBO as the pinned, read-only upper ontology (ADR-0001)
  - two-key review (ADR-0002)
