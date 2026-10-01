# 8 · Validation tooling reference

How to install, run, read and extend the tools that validate the semantic model and the ontology. The *why* of each check is in docs [2](02-enterprise-governance.md) (gates) and [7](07-change-management.md) (drift and change classes). This document is the *how*.

## 8.1 The tools

| Tool | Where | Use it to |
|---|---|---|
| **`make`** targets | `Makefile` (repository root) | Run everything the way CI does. `make` alone lists the targets |
| **`semtool`** | `enterprise-semantic-governance/tools/semtool.py` | Run any single check on any one repository; generate the taxonomy, capability map and CODEOWNERS; rebase the namespace |
| **Self-test** | `enterprise-semantic-governance/tools/tests/selftest.py` (`make selftest`) | Prove every check still catches the defect it is meant to catch, after you change the tooling or a standard |
| **`new_domain.py`** | `domains/domain-template/scripts/` | Generate a new sub-domain (and its business-domain parent layer) from the template |
| **`compare_domain.py`** | `domains/domain-template/scripts/` (`make align`) | Show how a sub-domain lines up with the template |
| **`fetch-omg-dependencies.sh`** | `fibo-extensions/scripts/` | Download FIBO's OMG Commons and LCC dependencies for complete reasoning (run by `make`; never needed by hand) |
| **CI** | `.github/workflows/semantic-ci.yml` | Run all of the above on every pull request and every push to `main` |

## 8.2 Setup

| Requirement | Why | How |
|---|---|---|
| Java ≥ 11 (17 recommended, as in CI) + ROBOT 1.9.10 | gate G4 reasoning (ELK, HermiT) | Install a JDK (macOS `brew install --cask temurin@17`; Ubuntu `sudo apt-get install -y openjdk-17-jre-headless`). Then `make tools` checks Java, downloads ROBOT to `build/tools/robot-<version>.jar` (git-ignored) and checks that the jar runs. Targets that reason run `make tools` automatically, and `make` exports `ROBOT_JAR` to every command. `semtool` run directly uses, in order: `ROBOT_JAR` if set, the jar in `build/tools/`, then a `robot` command on the `PATH` |
| Python packages | `semtool`, scripts | `make` creates `venv/` and installs `requirements.txt` into it the first time a target needs it, and again when `requirements.txt` changes. Python ≥ 3.10 is required (`PYTHON_BOOT=python3.12` picks the interpreter). `USE_VENV=0` uses your own `python3` |
| FIBO submodule | the upper ontology | checked out by `make` at the pinned commit when missing or when the pin changes (`make fibo` does only this) |
| OMG Commons + LCC | FIBO's own imports | fetched by `make` into `fibo-extensions/vendor/omg/` once per FIBO pin (needs access to www.omg.org). A failed fetch is a warning; later runs print a one-line note until `make omg` retries it. `SKIP_OMG=1` skips it. Without it, `closure` warns `unresolved imports skipped … Commons x20, LCC x1` and reasoning runs on the rest; every other check is unaffected |
| git, make, curl | FIBO checkout, `semtool changes`, downloads | the repository must be a git checkout; CI uses `fetch-depth: 0` so the base branch is available |

You only install Java, Python ≥ 3.10, git, make and curl; `make` does the rest. To do it all up front and check:

```bash
make setup                                                       # venv, Java check, ROBOT, FIBO, OMG Commons/LCC
make list                                                        # business domains and sub-domains found
venv/bin/python3 enterprise-semantic-governance/tools/semtool.py -h   # command list
make verify                                                      # everything (about 1 minute on this repository)
```

## 8.3 Everyday recipes

| Situation | Run |
|---|---|
| I edited a sub-domain and want quick feedback | `semtool verify --repo domains/<bd>/<sd>` (the `semtool` alias from the root README uses `venv/`) |
| … just one check | `semtool <command> --repo domains/<bd>/<sd>` (e.g. `rules`, `meta`, `drift`) |
| Before opening a pull request | `make verify && make changes BASE=origin/main` |
| I changed a published module, a dependency or the parent layer | `make verify` (verifies dependents and the business domain in one go), then `make hermit` |
| I changed an enterprise repository (standards, meta-model, registry, profile, core, template) | `make verify` (every domain must still pass), `make hermit`, `make align`; for shapes or standards also add an ADR |
| I changed the taxonomy, capability map or a manifest's roles | `make taxonomy` / `make capabilities` / `make codeowners`, commit the generated files, then `make drift` |
| I changed `semtool.py`, a meta-shape or the structure standard | `make selftest`, then `make verify` |
| I want to see what a competency question returns | `semtool cq --repo domains/<bd>/<sd> --show 5` |
| I want to look at the knowledge graph an agent would get | `semtool kg --repo domains/<bd>/<sd>`, then query `build/kg.trig` (§8.8) |

## 8.4 `make` targets

Run from the repository root. Each target exits non-zero on failure, so they can be chained with `&&` and used in CI.

| Target | Does | Runs | Time* |
|---|---|---|---|
| `make` / `make help` | lists the targets | | |
| `make verify` | `semtool verify` for governance, FIBO extensions, every sub-domain, every business domain, then `verify-template` | G1–G8 | ~60 s |
| `make verify-governance` · `verify-fibo` · `verify-domains` · `verify-template` | the parts of `make verify` | | |
| `make drift` | `semtool drift` for every repository | G8 | ~3 s |
| `make changes BASE=<ref> [STRICT=1]` | `semtool changes --base <ref>` for every repository (default `BASE=origin/main`; `STRICT=1` adds `--strict`) | PR check | ~1 s |
| `make hermit` | full OWL DL reasoning (HermiT) over each business domain with all its sub-domains and FIBO | G4 (complete) | ~25 s |
| `make align` | `compare_domain.py` for every sub-domain; fails if a template-owned file drifted or a template file is missing | template conformance | ~5 s |
| `make selftest` | seeds 31 defects one at a time and expects each to be caught, plus one correct change that must pass | the checks themselves | ~30 s |
| `make taxonomy` | regenerate `taxonomy/enterprise-taxonomy.ttl` | generator | |
| `make capabilities` | regenerate `capabilities/capability-map.ttl` and `data-quality-report.md` | generator | |
| `make codeowners` | regenerate `CODEOWNERS` in every sub-domain | generator | |
| `make tools` | check Java (≥ 11), download ROBOT to `build/tools/` once, verify the jar runs. Prerequisite of `verify`, `verify-fibo`, `verify-domains`, `verify-template` and `hermit`. Variables: `ROBOT_VERSION` (default `v1.9.10`), `ROBOT_JAR` (use your own jar), `JAVA_MIN` (default 11) | setup | first run: download |
| `make check-java` | only the Java check | setup | |
| `eval "$(make -s env)"` | set `ROBOT_JAR` in your shell (optional; `semtool` finds `build/tools/` itself) | setup | |
| `make clean-tools` | remove `build/tools/` (re-downloaded on next use) | setup | |
| `make setup` | everything a target might need, up front: `venv/`, Java check, ROBOT, FIBO checkout, OMG Commons/LCC (all otherwise automatic) | setup | first run: downloads |
| `make python` | only the `venv/` with the requirements | setup | |
| `make fibo` | only the FIBO checkout at the pinned commit | setup | |
| `make omg` | (re)try fetching FIBO's OMG Commons/LCC dependencies | setup | |
| `make list` | list business domains and sub-domains | info | |
| `make studio` · `studio-serve` · `studio-docker` · `studio-fresh` | build and serve [Semantic Studio](../../semantic-studio/README.md), the read-only web view; it shows the reports below | viewer | ~15 s |

\* measured on this repository without the OMG dependencies; with them, closure and reasoning take longer.

## 8.5 `semtool`

```text
venv/bin/python3 enterprise-semantic-governance/tools/semtool.py <command> [--repo PATH] [options]   # or the semtool alias
```

- **`--repo`** is the folder of *one* repository: `enterprise-semantic-governance`, `fibo-extensions`, `domains/<bd>` (business domain) or `domains/<bd>/<sd>` (sub-domain). The default is the current folder. The folder must contain `semantic.yaml`. Its `repo_kind` decides which checks apply, and its relative paths lead `semtool` to the other repositories.
- **Output.** One line per result: `PASS …`, `WARN …` (does not fail) or `FAIL …`. Indented lines give details, for example each SHACL violation as `[violation] <focus node> <path>: <message>`. Colours are used only on a terminal.
- **Exit code.** `0` when the command passed (warnings allowed), `1` when anything failed. A missing `semantic.yaml`, a missing `--base` for `changes`, or an unknown command stops with a message.

### What `verify` runs, by repository kind

`semtool verify` runs these commands in this order. Each is reported, and `verify` fails if any fails:

| Kind | Steps | Checks |
|---|---|---|
| `governance` | syntax · structure · meta · drift | 4 |
| `fibo-extensions` | syntax · structure · meta · drift · extensions · closure · reason | 7 |
| `business-domain` | syntax · structure · meta · drift · extensions · closure · reason | 7 |
| `domain` (sub-domain) | syntax · structure · meta · drift · extensions · closure · reason · codeowners · rules · kg · cq · cards | 12 |

(`structure` does real work only for sub-domains.)

Example, one sub-domain:

```text
$ semtool verify --repo domains/retail-wealth-management/financial-planning
== verify financial-planning (domain)
PASS syntax: 13 RDF files parse cleanly
PASS structure: conforms to the domain repository standard
PASS meta-shapes: conforms
PASS drift: domain is consistent with the registry, manifests, capability map and generated files
PASS E1 no statements about FIBO/OMG terms (extend by subclassing only)
PASS E2 namespace registered: domain/retail-wealth-management/financial-planning/
PASS E2 all 58 minted IRIs are inside the domain namespace
PASS E3 imports respect the enterprise FIBO profile and published domain modules
PASS closure: 53 ontology files, 13546 triples -> build/closure.ttl
WARN closure: unresolved imports skipped (FIBO's OMG Commons/LCC are missing: run `make omg` ...): Commons x20, LCC x1
PASS reason (ELK): closure is coherent, no unsatisfiable classes
PASS codeowners: CODEOWNERS generated from domain manifest
PASS rules on positive examples (1 file(s)): conforms
PASS negative case 'incomplete goal (no target date, amount without currency)': expected rule(s) ['FP-R-001'] fired
PASS negative case 'unsourced life expectancy, and a retirement scenario without one': expected rule(s) ['FP-R-002', 'FP-R-004'] fired
PASS negative case 'probability of success above 1': expected rule(s) ['FP-R-003'] fired
PASS kg: 18 named graphs, 11390 quads -> build/kg.trig
     graph/enterprise/governance/v0.1.0/ontology … graph/rwm-fp/financial-planning/v0.1.0/rules …
PASS cq CQ-001 Which business rules govern a financial goal, and who owns them? (1 row(s))
…
PASS cq CQ-005 Query tool rwm_fp_goal_progress: how is goal G-0001 tracking, under which assumptions? (3 row(s))
PASS cards: 38 concept cards, 111 edges -> build/graphrag/
PASS verify financial-planning: 12/12 checks passed
```

### Commands

Each entry gives the gate, the repository kinds it applies to, what it reads, what it writes, its options, and the usual fix when it fails.

#### `syntax` (G1)
Parses every `.ttl` and `.trig` of the repository, skipping `build/`, `vendor/`, the template and nested sub-domains. **Fails** with the file and the parser's message; fix the Turtle at that line.

#### `structure` (G1, sub-domains)
Checks the folder against `enterprise-semantic-governance/standards/domain-repo-structure.yaml`:
- required files; allowed file names per folder; allowed top-level entries
- competency-question numbering (`cq-001…005` from the template, `cq-101+` domain-specific), and that each question's `id` and query file match
- execution-model files are named after a `toolName`, and `artifactPath` / `inputSchemaPath` point at them
- every business rule has a negative case, `nc-NNN` expects rule `*-R-NNN`, and every `nc-*.ttl` is listed in `expectations.yaml`

**Fix:** rename or move the file to the pattern shown in the message; never rename template files.

#### `meta` (G2)
Validates the repository's governed files (the `paths` in its `semantic.yaml`) against the enterprise **meta-shapes** (`shapes/meta-common.ttl`, `meta-assets.ttl`, and `meta-business.ttl` for everything except governance). To resolve references, it adds a read-only *reference view* of:
- the governance meta-model, taxonomy, capability map and reusable assets
- the FIBO-extensions ontology and registry
- the ontology and manifests of all dependencies (transitively, so dependency cycles of any length are found)

**Output:** one `[violation]` or `[warning]` line per finding (up to 25), then `FAIL meta-shapes: N violation(s)`. The message says what is missing, for example `A business rule must cite its policySource.`. Warnings (e.g. missing `agentGuidance`) do not fail.

#### `extensions` (G3)
The FIBO extension rules:

| Rule | Checks | Typical message |
|---|---|---|
| E1 | no triple has a FIBO/OMG IRI as subject | `E1 ontology/x.ttl makes statements about external (FIBO/OMG) terms: …` |
| E2 | the repository's namespace is registered; every IRI it types lies inside it | `E2 namespace … is not registered`, `E2 IRIs minted outside the domain namespace: …` |
| E3 | `owl:imports` only of profile FIBO modules, enterprise modules, and other domains' *published* modules; no ontology-domain umbrellas; a business-domain umbrella only its own sub-domains | `E3 … imports FIBO module not in enterprise profile`, `… imports unpublished module of another domain`, `… imports an ontology-domain umbrella` |

#### `closure` and `reason` (G4)
- `closure` resolves `owl:imports` transitively (own modules, dependencies' published modules, enterprise core and alignment, the FIBO profile; FIBO and OMG through XML catalogs) and writes `build/closure.ttl`, plus `build/closure-unresolved.json`. Unresolved imports are a **warning**.
- **Known upstream defects.** Axioms listed in `fibo-extensions/profile/upstream-issues.yaml` (ADR-0007) are removed from `build/closure.ttl`, never from `vendor/`. `closure` reports the entries it applied, for example `(known upstream defects patched out: UP-001)`. It warns when an entry no longer applies, which usually means it was fixed upstream.
- `reason` classifies the closure with ROBOT and writes `build/reasoned.ttl`. Options: `--reasoner ELK` (default, fast, OWL EL) or `--reasoner HermiT` (complete OWL DL; `make hermit`). It **fails** on unsatisfiable classes or inconsistency, and names the first unsatisfiable class.
- **Fix:** an unsatisfiable class usually means conflicting parents or restrictions, often between two sub-domains. Find the axioms that meet in that class. If they come from different domains, it is an alignment question (standard 07).

#### `rules` (G5, sub-domains)
Runs the sub-domain's SHACL business rules (and the reusable assets they use via `sh:node`):
- against `examples/*.ttl`, which must **conform**
- against each negative case in `tests/negative/expectations.yaml` (together with the positive examples), which must fire **at least** the listed rule identifiers

The ontology context is the sub-domain's own ontology, its dependencies' ontology, enterprise core, and the class hierarchy from `build/closure.ttl` if present.

**Messages:** `negative case '<name>': expected ['FP-R-003'], fired []` means the rule no longer catches the case. Fix the rule, or the case if the rule changed on purpose.

#### `kg` (G7, sub-domains)
Assembles the knowledge graph an agent would see into `build/kg.trig`:
- the enterprise graphs (governance, taxonomy and capability map, reusable assets, alignment, FIBO extensions, registry, profile, ontology-domain umbrellas)
- each partition of the sub-domain's collection, under its declared graph name
- the dependencies' ontology partitions
- the FIBO labels and parents used (from the closure)
- the examples of the sub-domain and its dependencies, as a test graph

It prints every named graph.

#### `cq` (G6, sub-domains)
Runs each `competency-questions/*.yaml` query over the assembled graph.
- Query tools are exercised by binding `$inputs` from the question's `bindings`.
- Each question's `expect` sets a minimum number of rows (`min_rows`) and values that must appear (`contains`).
- `--show N` prints the first N rows of each answer.

**Fails** with `cq CQ-00n …: expected >= 1 rows, got 0` or `no row with <var> ~ '<value>'`.

#### `cards` (G7, sub-domains)
Exports GraphRAG **concept cards** and **edges** as defined by `fabric/graphrag/retrieval-contract.yaml` to `build/graphrag/cards.jsonl` and `edges.jsonl`. Each card carries its governing rules (inherited through superclasses), the APIs and data products serving it, taxonomy anchors, FIBO parents and citations.

#### `drift` (G8)
Checks that facts stated in more than one place agree. Which codes run depends on the repository kind:

| Kind | Codes |
|---|---|
| all | D1 version IRIs |
| sub-domain | D2 identity · D3 modules · D4 dependencies · D5 collections and graph names |
| business domain | D2 identity · D6 parent layer |
| fibo-extensions | D7 registry and umbrellas |
| governance | D8 alignment and core · D9 generated files current (regenerated in a temporary copy) and curation · D10 FIBO pin |

Every finding starts with its code and says what disagrees with what, e.g. `FAIL D4 manifest dependsOnSubDomain [] differs from semantic.yaml dependencies [...]`. The fix is always to make the *derived* statement match the *authoritative* one (table in [doc 7 §7.2](07-change-management.md#72-where-every-fact-lives)). For D9, re-run the generator named in the message and commit the result.

#### `changes` (pull requests)
```text
semtool changes --base origin/main --repo <folder> [--strict]
```
Compares the working tree (including uncommitted and untracked files) with the git ref `--base`:
- every changed module bumps `owl:versionInfo` by at least its change class
- a collection whose sources changed bumps its version
- changes to `shapes/` or `standards/` include an ADR

The change class is detected from the RDF diff (table in [doc 7 §7.3](07-change-management.md#73-the-checks)). An indented line summarises each changed module: `<file>: minor change (added: …), version 0.1.0 -> 0.2.0`.

Version findings on **Release** content are `FAIL`; on **Provisional** content they are `WARN`, unless `--strict` is given. A shape or standard change without an ADR always fails. `make changes` runs it for every repository.

**Needs** a git checkout with the base ref present. A shallow clone fails with `git diff against origin/main failed`: run `git fetch --unshallow origin` (or `git fetch origin main`), or use `fetch-depth: 0` in CI.

#### `codeowners` (sub-domains)
Regenerates `CODEOWNERS` from the roles and review teams in `domain-manifest.ttl` (the two-key review; see [doc 2 §2.3](02-enterprise-governance.md#23-two-key-review)). `verify` runs it. Commit the result, or D9 fails.

#### `taxonomy` and `capabilities` (generators, run on the governance repository)
- `taxonomy`: `taxonomy/source/enterprise-taxonomy.md` (nested list) → `taxonomy/enterprise-taxonomy.ttl` (SKOS).
- `capabilities [--source FILE]`: the capability map CSV/XLSX (default `capabilities/source/capability-map.csv`; columns mapped by `capabilities/columns.yaml`) + `curation.yaml` + `taxonomy-crosswalk.csv` → `capabilities/capability-map.ttl` and `data-quality-report.md`. Read the report after every import: it lists excluded mappings with reasons, capability gaps and proposed capabilities.
- **Fails** if the source file or a required column is missing (`adjust capabilities/columns.yaml`).

#### `rebase`
```text
semtool rebase --repo enterprise-semantic-governance --to https://ontology.<company>.com/ [--all]
```
Replaces the base IRI (from governance `semantic.yaml`) in `.ttl`, `.yaml`, `.yml`, `.rq`, `.md`, `.json`, `.jinja`, `.py` and `.csv` files. Without `--all`, only the governance repository changes. With `--all`, it covers every repository, sub-domain, business domain and the domain template, skipping `vendor/`, `build/` and `.git`. Run `make verify` afterwards.

## 8.6 Helper scripts

### `new_domain.py`: generate a sub-domain
```text
python3 domains/domain-template/scripts/new_domain.py --answers <answers.yaml> --out domains/<bd>/<sd> [--no-git]
```
- Renders `domains/domain-template/template/` with the answers (unset answers fall back to the defaults in `copier.yml`). Writes `.copier-answers.yml`.
- Creates the business-domain parent layer from `parent-template/` if it doesn't exist; otherwise it adds the sub-domain to the parent's `semantic.yaml` and prints the lines to add to `domain.ttl`.
- Refuses to write into a non-empty folder. `--no-git` skips `git init` (always use it inside the monorepo).
- Worked answers: `domains/domain-template/answers/rwm-fp.yaml`, `rwm-ia.yaml`. The full procedure, including registry and curation, is in [doc 7, "Add a sub-domain"](07-change-management.md#add-a-sub-domain).
- With Copier installed, `copier copy domains/domain-template domains/<bd>/<sd>` does the same interactively, and `copier update` pulls template improvements later.

### `compare_domain.py`: template alignment
```text
python3 domains/domain-template/scripts/compare_domain.py domains/<bd>/<sd>
```
Regenerates the sub-domain from its own `.copier-answers.yml` in a temporary folder and lists every file as:
- **unchanged**
- **edited**: a domain-owned file, which is expected
- **added**: a new file where the naming conventions allow
- **seed-only**: a template example the domain replaced
- **DRIFTED**: a template-owned file that differs; fix with `copier update` or by re-rendering
- **MISSING**

It exits 1 on DRIFTED or MISSING. `make align` runs it for every sub-domain.

### `fetch-omg-dependencies.sh`
```text
make omg        # the only way you normally need; make also runs it automatically once per FIBO pin
```
Finds every OMG IRI that FIBO imports and downloads the modules, recursively, into `fibo-extensions/vendor/omg/`. It then writes an XML catalog there so `closure` resolves them offline.
- Re-runs reuse files already fetched.
- It stops after one request if www.omg.org can't be reached.
- `make` treats a failure as a warning.

## 8.7 Self-test: testing the checks themselves

```text
make selftest
python3 enterprise-semantic-governance/tools/tests/selftest.py -k D4 E3     # only matching scenarios
```

A check that silently stops failing is worse than no check. The self-test:
1. Copies the repository to a temporary folder, commits it there as a git baseline, and confirms that every command it will use passes on the clean copy.
2. Runs each **scenario**. A scenario seeds one defect, runs one command against one repository, and expects a failure containing specific text.

There are 31 defect scenarios:
- all drift codes, D1–D10 (D10 twice: the FIBO pin, and the known-defects register after a FIBO change)
- E1–E3
- a dependency cycle and a rule without a policy source (G2)
- two structure cases (G1)
- a negative case that no longer trips its rule (G5)
- four pull-request cases

A final scenario makes a *correct* additive change (new class, MINOR bump, collection bump) and expects it to **pass**, which guards against false alarms.

Output is one line per scenario (`CAUGHT`, `MISSED`, `PASSES`, `REJECTED`) and a summary line. It exits 1 if any scenario misbehaves, and 2 (`BASELINE FAILS`) if the unmodified copy doesn't pass. The copy leaves out `fibo-extensions/vendor/`, so the scenarios need neither FIBO nor ROBOT (they exercise the checks, not reasoning; D10 is tested through `.gitmodules`). CI runs it on every pull request and push to `main`.

## 8.8 Build outputs and how to inspect them

Everything under `build/` is regenerated by `verify` and never committed. CI uploads each sub-domain's `build/` as an artifact.

| File | Written by | Contains |
|---|---|---|
| `build/closure.ttl` | `closure` | the merged import closure that was reasoned over |
| `build/closure-unresolved.json` | `closure` | imports that could not be resolved, with counts |
| `build/reasoned.ttl` | `reason` | the classified closure (inferred hierarchy) |
| `build/kg.trig` | `kg` | the knowledge graph: one named graph per partition |
| `build/graphrag/cards.jsonl`, `edges.jsonl` | `cards` | GraphRAG concept cards and edges |
| `build/reports/<command>.json` | every check command (`verify`, `drift`, `changes`, `reason`, ...); `reason` with HermiT writes `reason-hermit.json` | the outcome of the last run: command, repository, start and finish time, git commit, pass/fail, and each step with its gate and every PASS/WARN/FAIL/info message |
| `build/reports/selftest.json` (repository root) | `make selftest` (full runs only) | every scenario with its outcome |

The reports are what [Semantic Studio](../../semantic-studio/README.md)'s Health page shows. They are build output like everything else here: a report from an older commit is shown as such.

Querying the knowledge graph with Python:

```python
from rdflib import Dataset
ds = Dataset(default_union=True)
ds.parse("domains/retail-wealth-management/financial-planning/build/kg.trig", format="trig")
q = """
PREFIX ent-av: <https://ontology.example.com/governance/annotations/>
PREFIX sh: <http://www.w3.org/ns/shacl#>
SELECT ?rule ?id ?statement WHERE {
  GRAPH ?g { ?rule ent-av:ruleIdentifier ?id ; ent-av:ruleStatement ?statement }
} ORDER BY ?id"""
for row in ds.query(q):
    print(row.id, "-", row.statement)
```

Any TriG-capable triple store (Apache Jena Fuseki, GraphDB, Oxigraph and others) can load `kg.trig` directly. Each card in `cards.jsonl` is one JSON object per line with `id`, `type`, `label`, `definition`, `agent_guidance`, `rule_id`, `taxonomy_anchors`, `broader`, `governing_rules`, `served_by_apis`, `data_products`, `text` (what gets embedded) and `citation`.

## 8.9 CI

| Workflow | Runs | Steps |
|---|---|---|
| `.github/workflows/semantic-ci.yml` (monorepo, primary) | push to `main`, every pull request | `make setup` (venv, Java check, ROBOT, FIBO, OMG Commons/LCC; `build/tools` and `vendor/omg` cached per FIBO pin) → `make verify` → on pull requests `make changes BASE=origin/<base>` → `make hermit` → `make align` → `make selftest` → upload `build/` |
| `enterprise-semantic-governance/.github/workflows/semantic-ci.yml` (reusable) | called by repositories split out of the monorepo | `semtool verify` and HermiT for one repository. Inputs: `path` (where the repository sits in the monorepo layout), `governance-ref`, `fibo-extensions-ref` (default `main`), `robot-version` |
| `domains/domain-template/.github/workflows/template-test.yml` | when the template lives in its own repository | `make verify-template` |

Make the CI job a required status check on `main`, together with CODEOWNERS review, so no change merges without passing the gates and the two-key review.

## 8.10 Troubleshooting

| You see | Meaning | Do |
|---|---|---|
| `No semantic.yaml in …` | `--repo` doesn't point at a repository folder | point at `enterprise-semantic-governance`, `fibo-extensions`, `domains/<bd>` or `domains/<bd>/<sd>` |
| `WARN closure: unresolved imports skipped … Commons x20, LCC x1` | FIBO's OMG dependencies aren't downloaded (www.omg.org unreachable when `make` tried) | `make omg` when you have access (optional; every other check is unaffected) |
| `FAIL reason (…): There are N unsatisfiable properties/classes` listing only FIBO/OMG IRIs | a defect in the pinned FIBO/OMG release (often only visible once OMG Commons is downloaded) | follow §8.10 "When reasoning fails on a FIBO or OMG term"; record it in `upstream-issues.yaml` (ADR-0007) |
| `WARN D10 release tag … is not available in the FIBO checkout` | the FIBO tag couldn't be fetched (offline) | run any `make` target with network access; D10 then compares the checkout with the release |
| `FAIL reason (ELK): 'robot' not found …` (or `'java'`) | ROBOT or Java isn't available to a direct `semtool` call | run `make tools` (or any `make` target that reasons) |
| `ERROR: Java not found` / `'java' is on the PATH but does not run` / `Java 8 found; ROBOT needs Java >= 11` (from `make`) | no JDK, a stub `java` without a JDK (macOS), or a JDK that is too old | install a JDK 17 (see §8.2) and open a new shell |
| `ERROR: download failed: https://github.com/ontodev/robot/…` | no network access to GitHub releases | download `robot.jar` elsewhere and use `make verify ROBOT_JAR=/path/robot.jar` |
| `FAIL reason (…): … unsatisfiable …` | contradictory axioms | see `closure` and `reason` in §8.5; check recent parent/restriction changes and cross-sub-domain imports |
| `[violation] … : <message>` then `FAIL meta-shapes` | a standard isn't met | the message says what; standards 01–08 explain each |
| `E1` / `E2` / `E3` | FIBO extension rule broken | see `extensions` in §8.5 and `fibo-extensions/docs/extension-rules.md` |
| `negative case '…': expected [...], fired [...]` | a rule no longer catches its failing example (or catches a different rule) | fix the rule, or update the case and `expectations.yaml` if the rule changed deliberately |
| `cq CQ-nnn …: expected >= N rows, got 0` | the graph can't answer a competency question | usually a renamed term, a missing example, or a partition `sourcePath` that no longer matches; run `semtool kg` and query `build/kg.trig` |
| `… does not follow the naming standard` / `missing required file` | structure standard | rename or restore the file; never rename template files |
| `FAIL D<n> …` | two statements of one fact disagree | make the derived statement match the authoritative one (doc 7 §7.2); for D9 run the named generator |
| `… needs a minor version bump, got 0.1.0 -> 0.1.0` | content changed without a version bump | bump `owl:versionInfo` and `owl:versionIRI` together |
| `collection … was not bumped (graph names must change with content)` | knowledge changed within the same collection version | bump the collection `owl:versionInfo` and every `graphName` `/vX.Y.Z/` |
| `enterprise standard changed … without an ADR` | a shape or the structure standard changed | add `enterprise-semantic-governance/docs/adr/NNNN-….md` |
| `git diff against origin/main failed` | base ref missing (shallow clone, not fetched) | `git fetch origin main` or check out with full history |
| `NOT ALIGNED … template-owned file(s) drifted` (`make align`) | CI, `.gitignore` or `semantic.yaml` wiring edited in a sub-domain | revert, or change the template and re-render / `copier update` |
| `BASELINE FAILS` (`make selftest`) | the repository itself doesn't pass | run `make verify` first; the self-test needs a clean baseline |
| `MISSED <scenario>` (`make selftest`) | a check no longer catches its defect | fix the check (or, if the scenario's mutation no longer applies, update the scenario) |

### When reasoning fails on a FIBO or OMG term

If `reason` lists only `https://spec.edmcouncil.org/…` or `https://www.omg.org/…` terms as unsatisfiable, the defect is in the pinned FIBO/OMG release, not in this repository. `semtool` says so. Rule E1 means we don't edit FIBO, so:

1. **Find the conflict.** Look up the term in `build/closure.ttl` of the failing repository. For a property, compare its `rdfs:domain` and `rdfs:range` with those of its `rdfs:subPropertyOf` parents. For a class, compare its parents and restrictions. Then look for `owl:disjointWith` or `owl:AllDisjointClasses` between the classes involved. Example (UP-001): `hasVestedInIt` has a role as its domain, its parent `hasCapacity` has domain `Party`, and OMG Commons declares `Party` disjoint with `Role`.
2. **Pick the smallest fix.** Choose the one axiom whose removal makes the closure coherent. Confirm it with ROBOT on a copy of the closure, for example `java -jar build/tools/robot-*.jar reason --reasoner HermiT --input <patched copy>`.
3. **Record it** as a new entry in `fibo-extensions/profile/upstream-issues.yaml`: evidence, resolution, upstream report, and the exact `remove` triple(s). The entry needs semantic review.
4. **Run `make verify hermit`**, and report the defect to the EDM Council.

If the unsatisfiable terms are enterprise or domain terms, the problem is ours. Check their parents, restrictions, domains and ranges, and any cross-sub-domain imports.

## 8.11 Extending the tooling

| To add | Do | Then |
|---|---|---|
| **A standard enforced by SHACL** | add a shape to `shapes/meta-*.ttl` with a clear `sh:message`; start at `sh:Warning` if existing domains would fail | ADR; `make verify`; add a `selftest.py` scenario that breaks it |
| **A structure rule** | extend `standards/domain-repo-structure.yaml` and, if needed, `cmd_structure` | bump the standard's `version`; ADR; update the template; `make verify-template`, `make align` |
| **A consistency (drift) check** | add it to `cmd_drift` with the next free D-code, using `check(condition, "Dn", message)`; list the fact in doc 7 §7.2–7.3 | add a scenario to `selftest.py`; `make selftest` |
| **A competency question** | add `competency-questions/cq-1nn-<name>.yaml` (`id`, `question`, `query`, optional `bindings`, `expect`) and its `.rq` | `semtool cq --repo … --show 5` |
| **A negative test** | add `tests/negative/nc-NNN-<name>.ttl` and a case in `expectations.yaml` expecting `{PREFIX}-R-NNN` | `semtool rules` and `semtool structure` |
| **A new gate in `verify`** | write `cmd_<name>(repo, args) -> bool` (print with `ok`/`warn`/`fail`, return `False` on failure) and add it to the step list in `cmd_verify` for the right repository kinds | document it here and in doc 2 §2.4; add scenarios to the self-test |

Every new check needs at least one self-test scenario that proves it fails when it should.
