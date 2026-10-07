// What the framework's vocabulary means for the pages: kinds of things, owners, layers, gates.
import { Data, Repo, RepoKind } from "./data";
import { KG } from "./kg";

export const EXTERNAL = ["https://spec.edmcouncil.org/", "https://www.omg.org/", "http://www.omg.org/"];
export const isExternal = (iri: string) => EXTERNAL.some((p) => iri.startsWith(p));
export const isFibo = (iri: string) => iri.startsWith("https://spec.edmcouncil.org/fibo/");

// ---- kinds ---------------------------------------------------------------------------------------

export interface Kind {
  key: string;
  label: string;
}

// Most specific first. Each entry: [type CURIE, key, label].
const KINDS: [string, string, string][] = [
  ["ent-gov:BusinessRule", "rule", "Business rule"],
  ["ent-gov:EnterpriseRule", "erule", "Enterprise rule"],
  ["ent-gov:ArchitectureDecision", "decision", "Decision (ADR)"],
  ["ent-gov:DomainApi", "api", "Domain API"],
  ["ent-fab:QueryTool", "tool", "Agent tool"],
  ["ent-fab:RulePack", "tool", "Rule pack"],
  ["ent-fab:ProcessModel", "tool", "Process model"],
  ["ent-fab:AgentClass", "fabric", "Agent class"],
  ["ent-fab:ReusableAsset", "fabric", "Reusable asset"],
  ["ent-fab:KnowledgeCollection", "fabric", "Knowledge collection"],
  ["ent-fab:GraphPartition", "fabric", "Graph partition"],
  ["dcat:Dataset", "data", "Data product"],
  ["ent-gov:CriticalDataElement", "data", "Critical data element"],
  ["ent-gov:RecordClass", "record", "Record class"],
  ["ent-proc:BusinessProcess", "process", "Business process"],
  ["ent-proc:ProcessStep", "process", "Process step"],
  ["ent-ctl:AIControl", "control", "AI control"],
  ["ent-ctl:AIRisk", "control", "AI risk"],
  ["ent-ctl:RiskAssessment", "control", "Risk assessment"],
  ["ent-ctl:SensitivityClass", "control", "Sensitivity class"],
  ["ent-gov:DomainManifest", "domain", "Domain manifest"],
  ["ent-gov:ParentDomainManifest", "domain", "Parent domain manifest"],
  ["ent-gov:SubDomain", "domain", "Sub-domain"],
  ["ent-gov:BusinessDomain", "domain", "Business domain"],
  ["ent-gov:OntologyDomain", "domain", "Ontology domain"],
  ["ent-gov:DomainRegistration", "domain", "Domain registration"],
  ["ent-gov:AlignmentDecision", "governance", "Alignment decision"],
  ["ent-gov:TechnologyCapability", "capability", "Technology capability"],
  ["ent-gov:DomainOwner", "role", "Domain owner"],
  ["ent-gov:RuleOwner", "role", "Rule owner"],
  ["ent-gov:ApiOwner", "role", "API owner"],
  ["ent-gov:DataSteward", "role", "Data steward"],
  ["ent-gov:RecordsOwner", "role", "Records owner"],
  ["ent-gov:AIRiskOwner", "role", "AI risk owner"],
  ["sh:NodeShape", "shape", "Shape"],
  ["owl:Ontology", "ontology", "Ontology"],
  ["owl:Class", "class", "Class"],
  ["owl:ObjectProperty", "property", "Relationship"],
  ["owl:DatatypeProperty", "property", "Attribute"],
  ["owl:AnnotationProperty", "property", "Annotation"],
  ["skos:ConceptScheme", "scheme", "Concept scheme"],
];

export function kindOf(kg: KG, s: number): Kind {
  const types = new Set(kg.types(s));
  for (const [curie, key, label] of KINDS) {
    const t = kg.P(curie);
    if (t >= 0 && types.has(t)) return { key, label };
  }
  if (kg.isA(s, "skos:Concept")) {
    const scheme = kg.objects(s, kg.P("skos:inScheme")).map((x) => kg.iri(x));
    if (scheme.some((x) => x.endsWith("CapabilityMap"))) return { key: "capability", label: "Capability" };
    if (scheme.some((x) => x.endsWith("EnterpriseTaxonomy"))) return { key: "taxonomy", label: "Taxonomy concept" };
    return { key: "concept", label: "Concept" };
  }
  if (kg.isA(s, "owl:NamedIndividual") || types.size) {
    const t = [...types].find((x) => !kg.iri(x).startsWith("http://www.w3.org/"));
    if (t !== undefined) return { key: "individual", label: capitalize(kg.label(t)) };
    return { key: "individual", label: "Individual" };
  }
  return { key: "term", label: isExternal(kg.iri(s)) ? "External term" : "Term" };
}

function capitalize(s: string) {
  return s ? s[0].toUpperCase() + s.slice(1) : s;
}

// ---- where things live ---------------------------------------------------------------------------

export function repoOfNode(d: Data, s: number): Repo | undefined {
  const files = d.kg.definingFiles(s);
  for (const f of files) {
    const r = d.repoOfFile(f);
    if (r) return r;
  }
  return undefined;
}

/** subjects declared (rdf:type) in the given files, excluding blank nodes */
export function declaredIn(kg: KG, files: Set<string>, ...types: string[]): number[] {
  const rdfType = kg.P("rdf:type");
  const want = new Set(types.map((t) => kg.P(t)).filter((x) => x >= 0));
  const out: number[] = [];
  kg.nodes.forEach((_, s) => {
    if (kg.isBlank(s)) return;
    const hit = kg.out[s].some((e) => e.p === rdfType && files.has(kg.files[e.f]) && (!want.size || want.has(e.o)));
    if (hit) out.push(s);
  });
  return out;
}

export function filesWithRole(repo: Repo, ...roles: string[]): Set<string> {
  return new Set(repo.files.filter((f) => f.role && roles.includes(f.role)).map((f) => f.path));
}

export function governedFiles(repo: Repo): Set<string> {
  return new Set(repo.files.filter((f) => f.role && !f.role.startsWith("examples")).map((f) => f.path));
}

export const byLabel = (kg: KG) => (a: number, b: number) => kg.label(a).localeCompare(kg.label(b));

// ---- domains -------------------------------------------------------------------------------------

export interface Role {
  node: number;
  kind: string;
  heldBy: string;
  reviewTeam: string;
  accountableFor: string;
  placeholder: boolean;
}

export interface Manifest {
  node: number;
  registry?: number; // the capability-map entry this repository realises (ent-gov:describesDomain)
  roles: Role[];
  anchors: number[];
  capabilities: number[];
  modules: number[];
  dependsOn: number[];
  includes: number[];
}

export function manifestOf(d: Data, repo: Repo): Manifest | undefined {
  const kg = d.kg;
  const files = new Set(repo.files.map((f) => f.path));
  const m = declaredIn(kg, files, "ent-gov:DomainManifest", "ent-gov:ParentDomainManifest")[0];
  if (m === undefined) return undefined;
  const roleProps = ["ent-gov:hasDomainOwner", "ent-gov:hasRuleOwner", "ent-gov:hasApiOwner", "ent-gov:hasDataSteward", "ent-gov:hasRecordsOwner"];
  const roleNodes = new Set<number>();
  for (const p of roleProps) kg.objects(m, kg.P(p)).forEach((r) => roleNodes.add(r));
  // other roles declared in the manifest file (e.g. the AI risk approver)
  for (const r of declaredIn(kg, files, "ent-gov:AIRiskOwner")) roleNodes.add(r);
  const roles = [...roleNodes].map((r) => {
    const held = kg.text(r, kg.P("ent-gov:heldBy")) ?? "";
    return {
      node: r,
      kind: kindOf(kg, r).label,
      heldBy: held.replace(/\s*\(placeholder\)\s*$/i, ""),
      reviewTeam: kg.text(r, kg.P("ent-gov:reviewTeam")) ?? "",
      accountableFor: kg.objects(r, kg.P("ent-gov:accountableFor")).map((x) => kg.label(x)).join(", "),
      placeholder: /placeholder/i.test(held),
    };
  });
  return {
    node: m,
    registry: kg.object(m, kg.P("ent-gov:describesDomain")),
    roles,
    anchors: kg.objects(m, kg.P("ent-gov:anchoredTo")),
    capabilities: kg.objects(m, kg.P("ent-gov:realizesCapability")),
    modules: kg.objects(m, kg.P("ent-gov:hasOntologyModule")),
    dependsOn: kg.objects(m, kg.P("ent-gov:dependsOnSubDomain")),
    includes: kg.objects(m, kg.P("ent-gov:includesSubDomain")),
  };
}

/** the repository whose manifest describes this capability-map domain entry */
export function repoForRegistryEntry(d: Data, entry: number): Repo | undefined {
  for (const r of d.meta.repos) {
    if (r.kind !== "domain" && r.kind !== "business-domain") continue;
    if (manifestOf(d, r)?.registry === entry) return r;
  }
  return undefined;
}

export function subDomainsUsing(d: Data, repo: Repo): Repo[] {
  return d.meta.repos.filter((r) => r.dependencies.includes(repo.id));
}

export const REPO_KIND_LABEL: Record<RepoKind, string> = {
  governance: "Enterprise governance",
  "fibo-extensions": "Shared FIBO extensions",
  "business-domain": "Business domain",
  domain: "Sub-domain",
};

// ---- gates ---------------------------------------------------------------------------------------
// Gate names and which repository kinds they apply to: docs/framework/02-enterprise-governance.md

export const GATES: { id: string; name: string; kinds: RepoKind[] }[] = [
  { id: "G1", name: "Syntax and structure", kinds: ["governance", "fibo-extensions", "business-domain", "domain"] },
  { id: "G2", name: "Standards (meta-shapes)", kinds: ["governance", "fibo-extensions", "business-domain", "domain"] },
  { id: "G3", name: "FIBO extension rules", kinds: ["fibo-extensions", "business-domain", "domain"] },
  { id: "G4", name: "Logical coherence", kinds: ["fibo-extensions", "business-domain", "domain"] },
  { id: "G5", name: "Business rules", kinds: ["domain"] },
  { id: "G6", name: "Competency questions", kinds: ["domain"] },
  { id: "G7", name: "Publishable", kinds: ["domain"] },
  { id: "G8", name: "Consistency (no drift)", kinds: ["governance", "fibo-extensions", "business-domain", "domain"] },
];

export type Status = "pass" | "warn" | "fail" | "none" | "na";

export function gateStatus(d: Data, repo: Repo, gate: string): { status: Status; messages: { level: string; text: string }[]; stale: boolean } {
  const g = GATES.find((x) => x.id === gate);
  if (g && !g.kinds.includes(repo.kind)) return { status: "na", messages: [], stale: false };
  const verify = d.health.repos[repo.id]?.reports?.verify;
  if (!verify) return { status: "none", messages: [], stale: false };
  const steps = verify.steps.filter((s) => s.gate === gate);
  if (!steps.length) return { status: "none", messages: [], stale: !!verify.stale };
  const messages = steps.flatMap((s) => s.messages);
  const status: Status = steps.some((s) => !s.passed) ? "fail" : messages.some((m) => m.level === "warn") ? "warn" : "pass";
  return { status, messages, stale: !!verify.stale };
}

export function statusOfMessages(passed: boolean, messages: { level: string }[]): Status {
  return !passed ? "fail" : messages.some((m) => m.level === "warn") ? "warn" : "pass";
}

// ---- capability map and taxonomy -----------------------------------------------------------------

export function schemeMembers(kg: KG, schemeSuffix: string): number[] {
  const inScheme = kg.P("skos:inScheme");
  return kg.instances("skos:Concept").filter((c) => kg.objects(c, inScheme).some((s) => kg.iri(s).endsWith(schemeSuffix)));
}

export function narrower(kg: KG, members: Set<number>): Map<number, number[]> {
  const broader = kg.P("skos:broader");
  const m = new Map<number, number[]>();
  for (const c of members) for (const b of kg.objects(c, broader)) if (members.has(b)) m.set(b, [...(m.get(b) ?? []), c]);
  for (const v of m.values()) v.sort(byLabel(kg));
  return m;
}

export function roots(kg: KG, members: Set<number>): number[] {
  const broader = kg.P("skos:broader");
  return [...members].filter((c) => !kg.objects(c, broader).some((b) => members.has(b))).sort(byLabel(kg));
}

/** Warnings and failures worth listing: warn/fail messages, plus SHACL result lines semtool prints as info
 * ("[warning] ...", "[violation] ..."). A summary like "conforms (1 warning(s))" is dropped when its detail is there. */
export function findings(messages: { level: string; text: string }[]): { level: "warn" | "fail"; text: string }[] {
  const detail = messages
    .filter((m) => m.level === "info" && /^\[(warning|violation)\]/i.test(m.text))
    .map((m) => ({ level: (/^\[violation\]/i.test(m.text) ? "fail" : "warn") as "warn" | "fail", text: m.text.replace(/^\[(warning|violation)\]\s*/i, "") }));
  const direct = messages
    .filter((m) => m.level === "warn" || m.level === "fail")
    .filter((m) => !(detail.length && /\(\d+ warning\(s\)\)$/.test(m.text)))
    .map((m) => ({ level: m.level as "warn" | "fail", text: m.text }));
  return [...detail, ...direct];
}
