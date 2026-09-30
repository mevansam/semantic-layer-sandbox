# Enterprise semantic layer: sandbox

An ontology-based semantic layer for grounding AI agents in business meaning, rules, processes, data sources and specifications. It is governed by the enterprise taxonomy and capability map, built on FIBO, and served to agents through a knowledge graph via GraphRAG.

> **Business domains are accountable for meaning, rules, data, records and APIs.
> The enterprise governs how that knowledge is represented, shared and consumed by AI.**

## Documentation

**Start with the [framework guide](docs/framework/README.md).** It explains:
- enterprise governance
- how the federated repository structure keeps independent domains and sub-domains consistent
- how the semantic model and the ontology are managed at each level
- the logical and physical models, as diagrams
- how to make every kind of change without drift

| | |
|---|---|
| [1 Overview](docs/framework/01-overview.md) | [5 Logical model](docs/framework/05-logical-model.md) |
| [2 Enterprise governance](docs/framework/02-enterprise-governance.md) | [6 Physical model: how files link](docs/framework/06-physical-model.md) |
| [3 Federated repository structure](docs/framework/03-federated-repository-structure.md) | [7 Change management without drift](docs/framework/07-change-management.md) |
| [4 Semantic model and ontology](docs/framework/04-semantic-model-and-ontology.md) | [8 Validation tooling reference](docs/framework/08-validation-tooling.md) |

Standards are in `enterprise-semantic-governance/docs/standards/` and ADRs in `enterprise-semantic-governance/docs/adr/`.

## Layout

```
docs/framework/                      Framework guide (start here)
enterprise-semantic-governance/      Enterprise governance + semantic fabric: standards, meta-shapes, AI controls,
                                     alignment, taxonomy, capability map, GraphRAG contract, semtool, CI
fibo-extensions/                     FIBO (pinned submodule), enterprise FIBO profile, enterprise core, domain registry,
                                     ontology-domain umbrellas
domains/
├── domain-template/                 Template every sub-domain is generated from (+ parent-template for business domains)
└── retail-wealth-management/        Business domain (parent layer: domain.ttl umbrella + parent manifest)
    ├── financial-planning/          Sub-domain: goals, plans, scenarios, projections  (publishes `planning`)
    └── insights-and-analytics/      Sub-domain: insights, health score, advice boundary (builds on financial-planning)
```

| Layer | Owns | Extension point |
|---|---|---|
| FIBO | financial-industry meaning | pinned, read-only; extended only by subclassing (E1) |
| `fibo-extensions` | the enterprise's slice of FIBO and shared cross-domain terms | profile (which FIBO modules), enterprise core, registry (namespaces, published modules) |
| `domains/<business-domain>/` | business-domain owner, list of sub-domains | `domain.ttl` umbrella imports each sub-domain's published module; verified together |
| `domains/<business-domain>/<sub-domain>/` | meaning, rules, APIs, data, records of one sub-domain | `dependencies`: import another sub-domain's **published** module (one way, no cycles) |

```
             enterprise taxonomy (SKOS) ─┐   capability map (ontology domains › business domains › sub-domains › capabilities)
                                         ▼                        ▼
 FIBO (pinned) ─▶ enterprise FIBO profile ─▶ enterprise core ◀── sub-domain ontologies ◀── domains/domain-template
                                                                   │ rules · processes · APIs · data · records
                                                                   ▼
                                     knowledge collections (named graphs + ODRL policy + risk assessment)
                                                                   │
                                          knowledge graph (TriG) ──┴─▶ GraphRAG concept cards + execution models ─▶ agents
```

## Run, validate and test

All commands run from the repository root. Each exits non-zero on failure. `make` on its own lists the targets. Every command, option, output and error message is explained in the [validation tooling reference](docs/framework/08-validation-tooling.md). What each gate checks is in [Gates](#gates) below.

### Setup

Install **Java** (JDK 11+, 17 recommended; macOS `brew install --cask temurin@17`, Ubuntu `sudo apt-get install -y openjdk-17-jre-headless`), **Python 3.10+**, `git`, `make` and `curl`. Everything else is set up by `make` itself, automatically, the first time a target needs it:

| What | Where | When it's (re)done |
|---|---|---|
| Python virtualenv with the requirements | `venv/` | missing, or `requirements.txt` changed |
| Java check (≥ 11) + ROBOT `v1.9.10` | `build/tools/` | missing, or another `ROBOT_VERSION` |
| FIBO checkout at the pinned commit | `fibo-extensions/vendor/fibo` | missing, or the pin changed |
| FIBO's OMG Commons + LCC ontologies (from www.omg.org) | `fibo-extensions/vendor/omg/` | once per FIBO pin |

All of these are git-ignored. To do everything up front instead:

```bash
make setup                                                          # venv, Java check, ROBOT, FIBO, OMG Commons/LCC
alias semtool='venv/bin/python3 enterprise-semantic-governance/tools/semtool.py'   # used in the examples below
make list                                                           # business domains and sub-domains found
```

Notes:
- **Java missing, not running or older than 11:** `make` stops with install instructions.
- **Python older than 3.10:** macOS ships 3.9. Install a newer one and point `make` at it: `make setup PYTHON_BOOT=python3.12`. To use your own environment instead of `venv/`, add `USE_VENV=0` (you install the requirements yourself).
- **ROBOT:** `make` exports `ROBOT_JAR` to every command it runs. `semtool` run directly finds `build/tools/` on its own; `eval "$(make -s env)"` sets the variable in your shell. You can also use your own jar (`ROBOT_JAR=/path/robot.jar`) or another version (`ROBOT_VERSION=v1.9.x`).
- **OMG Commons/LCC:** if www.omg.org can't be reached, `make` warns once and continues; reasoning then runs without those imports (`closure` warns `unresolved imports`). Later runs print a one-line note instead of retrying. `make omg` retries, and `SKIP_OMG=1` skips it.
- **Start again:** `make clean-tools` removes ROBOT and the OMG download; delete `venv/` to rebuild the Python environment.

### Run everything

```bash
make verify         # gates G1-G8 for governance, FIBO extensions, every sub-domain and business domain, plus the template (~1 min)
make hermit         # full OWL DL reasoning (HermiT) over each business domain with its sub-domains and FIBO
make align          # every sub-domain still matches domain-template
make selftest       # every check still catches the defect it is meant to catch
```

This is what CI runs on every pull request and push to `main`, plus `make changes` on pull requests.

### Validate the enterprise layer

```bash
make verify-governance      # enterprise-semantic-governance: syntax, meta-shapes, consistency (incl. generated files, FIBO pin)
make verify-fibo            # fibo-extensions: + FIBO extension rules, closure, coherence with FIBO
make verify-template        # generate the worked sub-domains from domains/domain-template and run every gate on them
```

After changing anything enterprise-level (a standard, the meta-model, registry, profile, enterprise core, the template), run `make verify`. Every domain must still pass.

### Validate a business domain

```bash
semtool verify --repo domains/retail-wealth-management                        # parent layer; ELK over all sub-domains together
semtool reason --reasoner HermiT --repo domains/retail-wealth-management       # complete OWL DL (make hermit does all)
```

### Validate a sub-domain

```bash
semtool verify --repo domains/retail-wealth-management/financial-planning     # all 12 checks (G1-G8)
```

Or one check at a time:

| Check | Command (`--repo domains/<bd>/<sd>`) |
|---|---|
| G1 syntax, repository structure | `semtool syntax` · `semtool structure` |
| G2 enterprise standards (meta-shapes) | `semtool meta` |
| G3 FIBO extension rules E1–E3 | `semtool extensions` |
| G4 import closure, coherence with FIBO | `semtool closure` then `semtool reason` (`--reasoner HermiT` for full OWL DL) |
| G5 business rules | `semtool rules` |
| G6 competency questions | `semtool cq --show 5` |
| G7 knowledge graph, GraphRAG cards | `semtool kg` · `semtool cards` |
| G8 consistency (no drift) | `semtool drift` |

### Test business rules

```bash
semtool rules --repo domains/retail-wealth-management/insights-and-analytics
```

- Positive examples (`examples/*.ttl`) must conform.
- Each negative case in `tests/negative/expectations.yaml` must trip its rule.
- To test a new rule, add `tests/negative/nc-NNN-<name>.ttl` and a case expecting `{PREFIX}-R-NNN`, then run `rules` and `structure`.

### Query the knowledge graph

```bash
semtool kg --repo domains/retail-wealth-management/financial-planning         # -> build/kg.trig (named graphs)
semtool cq --repo domains/retail-wealth-management/financial-planning --show 5  # answers to the competency questions
```

`build/kg.trig` can be loaded into any TriG-capable triple store, or queried with rdflib ([example](docs/framework/08-validation-tooling.md#88-build-outputs-and-how-to-inspect-them)).

### Inspect GraphRAG output

```bash
semtool cards --repo domains/retail-wealth-management/financial-planning      # -> build/graphrag/cards.jsonl, edges.jsonl
head -1 domains/retail-wealth-management/financial-planning/build/graphrag/cards.jsonl | python3 -m json.tool
```

### Check for drift

```bash
make drift                                  # gate G8 on every repository (~3 s)
semtool drift --repo <folder>               # one repository
```

It checks that facts repeated across files agree (registry, manifests, capability map, folders, versions, graph names, dependencies, alignment) and that generated files are current. Each finding's code (D1–D10) is explained in [doc 7 §7.3](docs/framework/07-change-management.md#73-the-checks).

### Before a pull request

```bash
make verify
make changes BASE=origin/main               # version bumps match change classes; collection bumped if knowledge changed
make changes BASE=origin/main STRICT=1      # also fail on Provisional content
```

### Create a sub-domain

```bash
# 1. declare it in enterprise-semantic-governance/capabilities/curation.yaml (sub_domains), then:
make capabilities
# 2. register its namespace in fibo-extensions/registry/domain-registry.ttl (status Provisional)
# 3. write an answers file (copy domains/domain-template/answers/rwm-fp.yaml), then generate it:
python3 domains/domain-template/scripts/new_domain.py --answers my-answers.yaml --out domains/<bd>/<sd> --no-git
# 4. add ent-gov:includesSubDomain to domains/<bd>/domain.ttl (the script prints the line), fill in the manifest roles
make codeowners verify align
```

`python3 domains/domain-template/scripts/compare_domain.py domains/<bd>/<sd>` shows file by file how a sub-domain lines up with the template. The full playbook is in [doc 7](docs/framework/07-change-management.md#add-a-sub-domain).

### Regenerate generated files

Never edit these by hand. Regenerate them and commit them together with the source change; `make drift` fails if they are stale.

```bash
make taxonomy        # taxonomy/source/enterprise-taxonomy.md -> taxonomy/enterprise-taxonomy.ttl
make capabilities    # capabilities/source + curation.yaml + crosswalk -> capability-map.ttl + data-quality-report.md
make codeowners      # each sub-domain's domain-manifest.ttl -> CODEOWNERS
```

### Test the tooling

```bash
make selftest                                                          # all scenarios (~30 s)
python3 enterprise-semantic-governance/tools/tests/selftest.py -k D4 E3  # only matching scenarios
```

Run it after changing `semtool.py`, a meta-shape or the structure standard. It seeds one defect at a time into a temporary copy of the repository and expects the intended check to catch it, plus one correct change that must pass.

### Upgrade FIBO

Follow [`fibo-extensions/docs/upgrading-fibo.md`](fibo-extensions/docs/upgrading-fibo.md), then run `make verify hermit`. The FIBO pin in `.gitmodules` and `semantic.yaml` must agree, or `make drift` fails.

## Gates

From `enterprise-semantic-governance/GOVERNANCE.md`:


- G1 syntax and domain-repo structure
- G2 standards (meta-shapes)
- G3 FIBO extension rules
- G4 coherence with FIBO (ELK in `verify`, plus HermiT in CI)
- G5 business rules (positive and negative tests)
- G6 competency questions
- G7 knowledge graph plus GraphRAG export
- G8 consistency: no drift between files that repeat a fact, or between generated files and their sources

On pull requests, `semtool changes` also checks that version bumps match the change class. See [doc 7](docs/framework/07-change-management.md).

## Placeholders to replace

| What | Where | How |
|---|---|---|
| Namespace `https://ontology.example.com/` | everywhere | `semtool rebase --to https://ontology.<company>.com/ --all`, then `make verify` |
| Capability-map gaps and proposed capabilities | `enterprise-semantic-governance/capabilities/data-quality-report.md` | send to the map owners; when the map is fixed, run `make capabilities` and trim `curation.yaml` (ADR-0004) |
| Role holders and teams | each `domain-manifest.ttl` and `domains/*/domain.ttl`, governance `semantic.yaml` | edit, then `make codeowners` and commit `CODEOWNERS` |
| Policy sources, retention periods, regulatory citations | domain `rules/`, `records/` | confirm with rule owners, Records, Legal & Compliance |
| Control framework mappings (NIST AI RMF, ISO/IEC 42001) | `enterprise-semantic-governance/ontology/controls.ttl` | map to the enterprise control framework |
