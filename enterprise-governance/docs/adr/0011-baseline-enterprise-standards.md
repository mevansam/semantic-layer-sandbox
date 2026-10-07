# ADR-0011: The baseline enterprise standards for ontologies, processes and the semantic fabric

- **Status:** Accepted
- **Date:** 2026-10-06
- **Deciders:** Semantic review board

<!-- Records decisions taken with the baseline on 2026-09-28 that had no record of their own. -->

## Context
The standards the enterprise adopted with the baseline (2026-09-28) cover how ontologies are written, how processes are modelled, how knowledge is published to AI and how AI exposure is risk-assessed. They bind every domain but had no decision record, unlike the rules that came from ADR-0001, 0002 and 0004–0007. Without one, nobody can tell which of them are deliberate and hard to reverse, or why they were chosen.

## Decision
These standards are the enterprise baseline:
- **Ontology headers.** Every module has a label, an abstract, a semantic version with a matching version IRI, and a FIBO maturity level.
- **Term documentation.** Every term has a language-tagged label and exactly one definition (genus and differentia), following FIBO's conventions.
- **Naming.** Classes are UpperCamelCase and properties lowerCamelCase, as in FIBO and OWL practice.
- **Taxonomy nodes.** A term is anchored only to a node of the enterprise taxonomy.
- **Processes.** Processes are modelled in the graph, with ordered steps, performers, the concepts used and produced, and the rules, APIs and records involved.
- **Semantic fabric.** AI consumes only governed knowledge collections, which have:
  - a sensitivity
  - a usage policy
  - controls
  - a risk assessment
  - versioned named-graph partitions

  Tools for agents are published as execution models, derived from rules and subject to controls.
- **Risk assessments.** Every collection and execution model exposed to AI has a risk assessment approved by the AI risk office.
- **OWL for meaning, SHACL for rules (E7).** OWL axioms express what things are. Business policy is a SHACL rule owned by a rule owner.

## Why
- **Headers and versions** make every piece of knowledge citable: a version IRI names exactly one content (enforced by ADR-0006), and maturity decides whether findings fail or warn.
- **Definitions** are what agents ground on. One definition per term avoids two meanings under one IRI. Following FIBO's conventions keeps our terms consistent with the upper ontology they extend.
- **Naming** is mechanical, but one convention across all domains makes terms predictable for people and tools.
- **Processes in the graph** let an agent answer "what happens next, who does it, which rules apply" from the same knowledge it uses for meaning.
- **The fabric** puts policy, provenance and versions between the repositories and AI. An agent can then cite where an answer came from, and the enterprise can control what is exposed.
- **Risk assessments at publication time** make AI risk a gate rather than a separate review that can be skipped.
- **Keeping policy out of OWL** keeps rule owners in charge of their rules, avoids open-world surprises from axioms meant as checks, and keeps reasoning fast and stable.

## Alternatives rejected
- **Optional documentation and unversioned modules.** Agents would get terms without meaning, and consumers could not cite a version.
- **Per-domain conventions.** Every cross-domain query and review would have to learn each domain's style.
- **Processes in a separate BPMN tool.** They are not queryable alongside meaning, and drift from it.
- **Agents querying the repositories or the raw graph directly.** There would be no usage policy, sensitivity, provenance or version to cite.
- **Business thresholds as OWL axioms.** Reasoning changes when a policy changes. Inconsistencies appear instead of rule violations. Rule owners lose ownership of their rules.

## Where the rules are
- [`docs/standards/01-ontology-standards.md`](../standards/01-ontology-standards.md): headers, documentation, naming, annotations.
- [`docs/standards/03-processes.md`](../standards/03-processes.md): processes.
- [`docs/standards/06-ai-risk-and-controls.md`](../standards/06-ai-risk-and-controls.md): risk assessments.
- [`docs/standards/08-semantic-fabric.md`](../standards/08-semantic-fabric.md): collections, partitions, policies, execution models.
- [`fibo-extensions/docs/extension-rules.md`](../../../fibo-extensions/docs/extension-rules.md): E7.
