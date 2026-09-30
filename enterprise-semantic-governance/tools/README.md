# semtool

The one command-line tool that validates the semantic model and the ontology in every repository, locally and in CI.

**Full reference:** [`docs/framework/08-validation-tooling.md`](../../docs/framework/08-validation-tooling.md). It covers setup, every command and option, output, build files, CI, troubleshooting, and how to extend the tooling.

```bash
pip install -r enterprise-semantic-governance/requirements.txt
export ROBOT_JAR=/path/to/robot.jar                      # Java 17 + ROBOT 1.9.10, for reasoning (G4)

make                                                     # list the make targets
make verify                                              # all gates G1-G8, every repository
make changes BASE=origin/main                            # version bumps vs change classes (before a PR)
make selftest                                            # the checks still catch what they should

python3 enterprise-semantic-governance/tools/semtool.py -h
python3 enterprise-semantic-governance/tools/semtool.py verify --repo domains/<business-domain>/<sub-domain>
python3 enterprise-semantic-governance/tools/semtool.py <command> --repo <folder> [options]
```

| Command | Gate | Purpose |
|---|---|---|
| `verify` | all | every check that applies to the repository kind |
| `syntax` · `structure` | G1 | RDF parses; sub-domain follows the structure standard |
| `meta` | G2 | enterprise meta-shapes (standards 01–08) |
| `extensions` | G3 | FIBO extension rules E1–E3 |
| `closure` · `reason [--reasoner ELK\|HermiT]` | G4 | import closure; coherence with FIBO |
| `rules` | G5 | business rules on positive and negative examples |
| `cq [--show N]` | G6 | competency questions over the knowledge graph |
| `kg` · `cards` | G7 | knowledge graph (TriG) and GraphRAG cards |
| `drift` | G8 | facts repeated across files agree; generated files current |
| `changes --base REF [--strict]` | PR | version bumps match the change class |
| `codeowners` · `taxonomy` · `capabilities [--source FILE]` | generators | CODEOWNERS, SKOS taxonomy, capability map |
| `rebase --to IRI [--all]` | | change the enterprise base IRI everywhere |

`tests/selftest.py` seeds one defect at a time into a temporary copy of the repository and checks that the intended command catches it (`make selftest`).
