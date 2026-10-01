// The repositories (governance, FIBO extensions, business domains, sub-domains) and each one's contents.
import { ReactNode } from "react";
import { Markdown } from "../components/Markdown";
import { Empty, Icon, KV, Pill, Section, SourceLink, Tabs, Term, TermList, ValueOf } from "../components/ui";
import { Data, Repo, useData } from "../data";
import { capitalize } from "../kg";
import {
  byLabel, declaredIn, filesWithRole, governedFiles, manifestOf, REPO_KIND_LABEL, repoForRegistryEntry, schemeMembers, subDomainsUsing,
} from "../model";
import { href } from "../router";
import { RepoHealth, repoHealthSummary } from "./Health";

export function DomainsPage() {
  const d = useData();
  const { kg } = d;
  const repos = d.meta.repos;
  const enterprise = repos.filter((r) => r.kind === "governance" || r.kind === "fibo-extensions");
  const business = repos.filter((r) => r.kind === "business-domain");
  const ods = kg.instances("ent-gov:OntologyDomain").sort(byLabel(kg));
  const bds = kg.instances("ent-gov:BusinessDomain");
  const inOD = kg.P("ent-gov:inOntologyDomain");
  const capsBy = new Map<number, number>();
  for (const c of schemeMembers(kg, "CapabilityMap")) for (const bd of kg.objects(c, kg.P("ent-gov:accountableDomain"))) capsBy.set(bd, (capsBy.get(bd) ?? 0) + 1);
  const unplaced = bds.filter((b) => !kg.objects(b, inOD).length);
  return (
    <div className="stack">
      <header>
        <h1>Domains</h1>
        <p className="lead">Domains own meaning, rules, data, records and APIs. The enterprise governs how they are represented and how AI uses them.</p>
      </header>
      <Section title="Repositories">
        <div className="grid3">
          {enterprise.map((r) => (
            <RepoCard key={r.id} repo={r} />
          ))}
        </div>
        {business.map((b) => (
          <div key={b.id} className="bd-group">
            <RepoCard repo={b} wide />
            <div className="grid3 nested">
              {b.sub_domains.map((id) => d.repo(id)).filter(Boolean).map((r) => (
                <RepoCard key={r!.id} repo={r!} />
              ))}
            </div>
          </div>
        ))}
      </Section>
      <Section title="Domain register" actions={<span className="small muted">From the curated capability map: {bds.length} business domains in {ods.length} ontology domains</span>}>
        <div className="register">
          {[...ods.map((o) => [o, bds.filter((b) => kg.has(b, inOD, o))] as [number | null, number[]]), [null, unplaced] as [number | null, number[]]]
            .filter(([, list]) => list.length)
            .map(([od, list]) => (
              <div key={od ?? "none"} className="register-col">
                <h3>{od === null ? "Not yet placed" : <Term id={od} />}</h3>
                <ul className="plain">
                  {list.sort(byLabel(kg)).map((b) => {
                    const repo = repoForRegistryEntry(d, b);
                    return (
                      <li key={b} className="between">
                        <Term id={b} />
                        <span className="row small">
                          {repo && <a href={href.domain(repo.id)}><Pill tone="accent">Modelled</Pill></a>}
                          <span className="muted" title="Capabilities accountable to this domain">{capsBy.get(b) ?? 0}</span>
                        </span>
                      </li>
                    );
                  })}
                </ul>
              </div>
            ))}
        </div>
      </Section>
    </div>
  );
}

function RepoCard({ repo, wide }: { repo: Repo; wide?: boolean }) {
  const d = useData();
  const h = repoHealthSummary(d, repo);
  const m = manifestOf(d, repo);
  const def = m?.registry !== undefined ? d.kg.definition(m.registry) : undefined;
  return (
    <a className={`layer${wide ? " wide" : ""}`} href={href.domain(repo.id)}>
      <span className="between">
        <h3>{repo.name}</h3>
        <span className={`pill ${h.tone}`}>{h.label}</span>
      </span>
      <span className="small muted">
        {REPO_KIND_LABEL[repo.kind]}
        {repo.prefix && <> &middot; <span className="mono">{repo.prefix}:</span></>}
      </span>
      {def && <span className="small">{def}</span>}
    </a>
  );
}

// ---- one repository --------------------------------------------------------------------------------

const DOMAIN_TABS = [
  ["overview", "Overview"], ["meaning", "Meaning"], ["rules", "Rules"], ["processes", "Processes"], ["apis", "APIs and tools"],
  ["data", "Data"], ["records", "Records"], ["fabric", "Fabric"], ["questions", "Questions"], ["health", "Health"], ["files", "Files"],
];
const OTHER_TABS = [["overview", "Overview"], ["health", "Health"], ["files", "Files"]];

export function DomainPage({ id, tab }: { id: string; tab: string }) {
  const d = useData();
  const repo = d.repo(id);
  if (!repo) {
    return (
      <div className="stack">
        <h1>No such repository</h1>
        <p>
          <a href={href.domains()}>All domains</a>
        </p>
      </div>
    );
  }
  const tabs = (repo.kind === "domain" ? DOMAIN_TABS : OTHER_TABS).map(([key, label]) => ({ key, label }));
  const current = tabs.some((t) => t.key === tab) ? tab : "overview";
  const parent = repo.parent ? d.repo(repo.parent) : undefined;
  const h = repoHealthSummary(d, repo);
  return (
    <div className="stack">
      <div className="crumbs">
        <a href={href.domains()}>Domains</a>
        {parent && (
          <>
            {" "}/ <a href={href.domain(parent.id)}>{parent.name}</a>
          </>
        )}
      </div>
      <header className="between top">
        <div className="title-block">
          <div className="row">
            <h1>{repo.name}</h1>
            <a href={href.domain(repo.id, "health")} className={`pill ${h.tone}`}>{h.label}</a>
            {repo.code && <Pill tone="mute">{repo.code}</Pill>}
          </div>
          <p className="lead small">
            {REPO_KIND_LABEL[repo.kind]}
            {parent && <> of {parent.name}</>}
            {repo.prefix && <> &middot; prefix <span className="mono">{repo.prefix}:</span></>}
            {" "}&middot; <span className="mono">{repo.id}/</span>
          </p>
        </div>
        <div className="row actions">
          <a className="btn" href={href.graph("imports", undefined)}>
            <Icon name="graph" size={16} /> Graph
          </a>
        </div>
      </header>
      <Tabs tabs={tabs} current={current} link={(k) => href.domain(repo.id, k)} />
      <DomainTab repo={repo} tab={current} />
    </div>
  );
}

function DomainTab({ repo, tab }: { repo: Repo; tab: string }) {
  const d = useData();
  switch (tab) {
    case "health":
      return <RepoHealth repo={repo} />;
    case "files":
      return <FilesTab repo={repo} />;
    case "meaning":
      return <MeaningTab repo={repo} />;
    case "rules":
      return <RulesTab repo={repo} />;
    case "processes":
      return <ProcessesTab repo={repo} />;
    case "apis":
      return <ApisTab repo={repo} />;
    case "data":
      return <DataTab repo={repo} />;
    case "records":
      return <RecordsTab repo={repo} />;
    case "fabric":
      return <FabricTab repo={repo} />;
    case "questions":
      return <QuestionsTab repo={repo} />;
    default:
      return repo.kind === "domain" ? <SubDomainOverview repo={repo} /> : <RepoOverview repo={repo} d={d} />;
  }
}

function Readme({ repo }: { repo: Repo }) {
  const d = useData();
  const doc = d.docs.find((x) => x.path === repo.readme);
  if (!doc) return null;
  return (
    <Section title="README" actions={<a className="small" href={href.doc(doc.path)}>Open as a document</a>}>
      <Markdown text={doc.text.replace(/^#\s+.*\n/, "")} path={doc.path} />
    </Section>
  );
}

function SubDomainOverview({ repo }: { repo: Repo }) {
  const d = useData();
  const { kg } = d;
  const m = manifestOf(d, repo);
  const deps = repo.dependencies.map((id) => d.repo(id)).filter(Boolean) as Repo[];
  const users = subDomainsUsing(d, repo);
  return (
    <>
      <div className="grid2">
        <Section title="Ownership" actions={m?.roles.some((r) => r.placeholder) ? <Pill tone="warn">Placeholder names</Pill> : undefined}>
          {m ? (
            <table>
              <tbody>
                {m.roles.map((r) => (
                  <tr key={r.node}>
                    <td className="muted">
                      <a href={href.resource(kg.iri(r.node))}>{r.kind}</a>
                      {r.accountableFor && <div className="small">for {r.accountableFor}</div>}
                    </td>
                    <td>
                      {r.heldBy}
                      {r.reviewTeam && <div className="mono small muted">{r.reviewTeam}</div>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <Empty>No domain manifest.</Empty>
          )}
        </Section>
        <Section title="Anchors and dependencies">
          <KV
            rows={[
              ["Registered as", m?.registry !== undefined ? <Term id={m.registry} /> : null],
              ["Taxonomy anchors", <TermList key="a" ids={m?.anchors ?? []} empty="none" />],
              ["Realises capabilities", <TermList key="c" ids={m?.capabilities ?? []} empty="none" />],
              ["Ontology modules", <TermList key="o" ids={m?.modules ?? []} empty="none" />],
              ["Builds on", deps.length ? <span>{deps.map((r) => <a key={r.id} className="chip-link" href={href.domain(r.id)}>{r.name}</a>)}</span> : <span className="muted">no other sub-domain</span>],
              ["Used by", users.length ? <span>{users.map((r) => <a key={r.id} className="chip-link" href={href.domain(r.id)}>{r.name}</a>)}</span> : <span className="muted">no other sub-domain</span>],
            ]}
          />
        </Section>
      </div>
      <ContentsSummary repo={repo} />
      <Readme repo={repo} />
    </>
  );
}

function ContentsSummary({ repo }: { repo: Repo }) {
  const { kg } = useData();
  const n = (role: string, ...types: string[]) => declaredIn(kg, filesWithRole(repo, role), ...types).length;
  const items: [string, string, number][] = [
    ["meaning", "Classes", n("ontology", "owl:Class")],
    ["meaning", "Properties", n("ontology", "owl:ObjectProperty", "owl:DatatypeProperty")],
    ["rules", "Business rules", n("rules", "ent-gov:BusinessRule")],
    ["processes", "Processes", n("processes", "ent-proc:BusinessProcess")],
    ["apis", "APIs", n("apis", "ent-gov:DomainApi")],
    ["apis", "Agent tools", n("execution", "ent-fab:QueryTool", "ent-fab:RulePack", "ent-fab:ProcessModel")],
    ["data", "Data products", n("stewardship", "dcat:Dataset")],
    ["records", "Record classes", n("records", "ent-gov:RecordClass")],
    ["questions", "Competency questions", repo.competency_questions.length],
  ];
  return (
    <div className="tiles">
      {items.map(([tab, label, count]) => (
        <a key={label} className="tile" href={href.domain(repo.id, tab)}>
          <b>{count}</b>
          <span>{label}</span>
        </a>
      ))}
    </div>
  );
}

function RepoOverview({ repo, d }: { repo: Repo; d: Data }) {
  const { kg } = d;
  const ontologies = declaredIn(kg, governedFiles(repo), "owl:Ontology").sort(byLabel(kg));
  const m = manifestOf(d, repo);
  const extra: ReactNode[] = [];
  if (repo.kind === "business-domain") {
    extra.push(
      <Section key="subs" title="Sub-domains">
        <div className="grid3">
          {repo.sub_domains.map((id) => d.repo(id)).filter(Boolean).map((r) => (
            <RepoCard key={r!.id} repo={r!} />
          ))}
        </div>
      </Section>,
    );
  }
  if (repo.kind === "governance") {
    const caps = schemeMembers(kg, "CapabilityMap");
    const tax = schemeMembers(kg, "EnterpriseTaxonomy");
    extra.push(
      <div key="gov" className="tiles">
        <a className="tile" href={href.taxonomy()}><b>{tax.length}</b><span>taxonomy concepts</span></a>
        <a className="tile" href={href.capabilities()}><b>{caps.length}</b><span>capabilities</span></a>
        <a className="tile" href={href.domains()}><b>{kg.instances("ent-gov:BusinessDomain").length}</b><span>business domains</span></a>
        <a className="tile" href={href.governance()}><b>{kg.instances("ent-ctl:AIControl").length}</b><span>AI controls</span></a>
        <a className="tile" href={href.governance()}><b>{d.docs.filter((x) => x.group === "adr").length}</b><span>decisions (ADRs)</span></a>
      </div>,
    );
  }
  if (repo.kind === "fibo-extensions") {
    const regs = kg.instances("ent-gov:DomainRegistration").sort(byLabel(kg));
    extra.push(
      <Section key="reg" title="Domain registry" actions={<span className="small muted">Namespaces and codes reserved for domains (rule E2)</span>}>
        <table>
          <thead>
            <tr><th>Registration</th><th>Code</th><th>Status</th><th>Published modules</th></tr>
          </thead>
          <tbody>
            {regs.map((r) => (
              <tr key={r}>
                <td><Term id={r} /></td>
                <td className="mono small">{kg.text(r, kg.P("ent-gov:domainCode"))}</td>
                <td>{kg.text(r, kg.P("ent-gov:registrationStatus"))}</td>
                <td><TermList ids={kg.objects(r, kg.P("ent-gov:publishedModule"))} empty="-" /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </Section>,
    );
  }
  return (
    <>
      {extra}
      {m && (
        <Section title="Ownership">
          <table>
            <tbody>
              {m.roles.map((r) => (
                <tr key={r.node}>
                  <td className="muted">{r.kind}</td>
                  <td>{r.heldBy}<div className="mono small muted">{r.reviewTeam}</div></td>
                </tr>
              ))}
            </tbody>
          </table>
        </Section>
      )}
      <Section title="Ontologies" actions={<span className="small muted">{ontologies.length}</span>}>
        <table>
          <thead>
            <tr><th>Ontology</th><th>Version</th><th>About</th></tr>
          </thead>
          <tbody>
            {ontologies.map((o) => (
              <tr key={o}>
                <td><Term id={o} /></td>
                <td className="mono small">{kg.text(o, kg.P("owl:versionInfo"))}</td>
                <td className="small">{kg.definition(o)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Section>
      <Readme repo={repo} />
    </>
  );
}

function MeaningTab({ repo }: { repo: Repo }) {
  const { kg } = useData();
  const files = filesWithRole(repo, "ontology");
  const classes = declaredIn(kg, files, "owl:Class").sort(byLabel(kg));
  const props = declaredIn(kg, files, "owl:ObjectProperty", "owl:DatatypeProperty").sort(byLabel(kg));
  const inds = declaredIn(kg, files, "owl:NamedIndividual").filter((x) => !kg.isA(x, "owl:Class")).sort(byLabel(kg));
  const sub = kg.P("rdfs:subClassOf");
  return (
    <>
      <Section title="Classes" actions={<span className="small muted">{classes.length}</span>}>
        <table>
          <thead>
            <tr><th>Class</th><th>Parent</th><th>Definition</th></tr>
          </thead>
          <tbody>
            {classes.map((c) => (
              <tr key={c}>
                <td><Term id={c} /></td>
                <td>{kg.objects(c, sub).filter((x) => !kg.isBlank(x)).map((p) => <div key={p}><Term id={p} /></div>)}</td>
                <td className="small">{kg.definition(c)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Section>
      <Section title="Properties" actions={<span className="small muted">{props.length}</span>}>
        <table>
          <thead>
            <tr><th>Property</th><th>From</th><th>To</th><th>Definition</th></tr>
          </thead>
          <tbody>
            {props.map((p) => (
              <tr key={p}>
                <td><Term id={p} /></td>
                <td>{kg.objects(p, kg.P("rdfs:domain")).map((x) => <div key={x}><ValueOf o={x} /></div>)}</td>
                <td>{kg.objects(p, kg.P("rdfs:range")).map((x) => <div key={x}><ValueOf o={x} /></div>)}</td>
                <td className="small">{kg.definition(p)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Section>
      {inds.length > 0 && (
        <Section title="Reference values">
          <TermList ids={inds} showKind />
        </Section>
      )}
    </>
  );
}

function RulesTab({ repo }: { repo: Repo }) {
  const { kg } = useData();
  const rules = declaredIn(kg, filesWithRole(repo, "rules"), "ent-gov:BusinessRule").sort((a, b) =>
    (kg.text(a, kg.P("ent-av:ruleIdentifier")) ?? "").localeCompare(kg.text(b, kg.P("ent-av:ruleIdentifier")) ?? ""),
  );
  return (
    <>
      <Section title="Business rules" actions={<span className="small muted">Each rule is a SHACL shape, tested by gate G5</span>}>
        <table>
          <thead>
            <tr><th>Rule</th><th>Statement</th><th>Applies to</th><th>Negative tests</th></tr>
          </thead>
          <tbody>
            {rules.map((r) => {
              const id = kg.text(r, kg.P("ent-av:ruleIdentifier")) ?? "";
              const tests = repo.negative_tests.filter((t) => t.expect_violations?.includes(id));
              return (
                <tr key={r}>
                  <td>
                    <div className="mono small">{id}</div>
                    <Term id={r} />
                  </td>
                  <td className="small">{kg.text(r, kg.P("ent-av:ruleStatement"))}</td>
                  <td><TermList ids={kg.objects(r, kg.P("sh:targetClass"))} /></td>
                  <td className="small">{tests.length ? tests.map((t) => <div key={t.path}><a href={href.source(t.path)}>{t.file}</a></div>) : <span className="muted">none</span>}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </Section>
      <Section title="Negative test cases" actions={<span className="small muted">Each file must trip the rules listed</span>}>
        {repo.negative_tests.length ? (
          <ul className="list">
            {repo.negative_tests.map((t) => (
              <li key={t.path} className="li">
                <div>
                  <div>{capitalize(t.name)}</div>
                  <SourceLink path={t.path} label={t.file} />
                </div>
                <span className="row">{(t.expect_violations ?? []).map((v) => <Pill key={v} tone="mute">{v}</Pill>)}</span>
              </li>
            ))}
          </ul>
        ) : (
          <Empty>No negative test cases.</Empty>
        )}
      </Section>
    </>
  );
}

function ProcessesTab({ repo }: { repo: Repo }) {
  const { kg } = useData();
  const files = filesWithRole(repo, "processes");
  const processes = declaredIn(kg, files, "ent-proc:BusinessProcess").sort(byLabel(kg));
  const P = (c: string) => kg.P(c);
  if (!processes.length) return <Empty>No processes modelled.</Empty>;
  return (
    <>
      {processes.map((p) => {
        const steps = kg.objects(p, P("ent-proc:hasStep")).sort((a, b) => Number(kg.text(a, P("ent-proc:stepOrder")) ?? 0) - Number(kg.text(b, P("ent-proc:stepOrder")) ?? 0));
        return (
          <Section key={p} title={<Term id={p} />}>
            <p>{kg.definition(p)}</p>
            <KV rows={[["Realises", <TermList key="r" ids={kg.objects(p, P("ent-av:realizesCapability"))} empty="-" />]]} />
            <ol className="steps">
              {steps.map((s) => (
                <li key={s} className="step">
                  <div className="step-head">
                    <span className="step-n">{kg.text(s, P("ent-proc:stepOrder"))}</span>
                    <Term id={s} />
                    {kg.objects(s, P("ent-proc:automationLevel")).map((a) => <Pill key={a} tone="mute">{capitalize(kg.label(a))}</Pill>)}
                  </div>
                  <KV
                    rows={[
                      ["Performed by", kg.objects(s, P("ent-proc:performedBy")).map((x) => <ValueOf key={x} o={x} />)],
                      ["Uses", kg.objects(s, P("ent-proc:usesConcept")).length ? <TermList ids={kg.objects(s, P("ent-proc:usesConcept"))} /> : null],
                      ["Produces", kg.objects(s, P("ent-proc:producesConcept")).length ? <TermList ids={kg.objects(s, P("ent-proc:producesConcept"))} /> : null],
                      ["Applies rules", kg.objects(s, P("ent-proc:appliesRule")).length ? <TermList ids={kg.objects(s, P("ent-proc:appliesRule"))} /> : null],
                      ["Calls APIs", kg.objects(s, P("ent-proc:invokesApi")).length ? <TermList ids={kg.objects(s, P("ent-proc:invokesApi"))} /> : null],
                      ["Creates records", kg.objects(s, P("ent-proc:createsRecord")).length ? <TermList ids={kg.objects(s, P("ent-proc:createsRecord"))} /> : null],
                      ["Note", kg.text(s, P("skos:editorialNote"))],
                    ]}
                  />
                </li>
              ))}
            </ol>
          </Section>
        );
      })}
    </>
  );
}

function ApisTab({ repo }: { repo: Repo }) {
  const { kg } = useData();
  const apis = declaredIn(kg, filesWithRole(repo, "apis"), "ent-gov:DomainApi").sort(byLabel(kg));
  const tools = declaredIn(kg, filesWithRole(repo, "execution"), "ent-fab:QueryTool", "ent-fab:RulePack", "ent-fab:ProcessModel").sort(byLabel(kg));
  const P = (c: string) => kg.P(c);
  const repoPath = (p?: string) => (p ? `${repo.id}/${p}` : undefined);
  return (
    <>
      <Section title="Domain APIs">
        {apis.length ? (
          apis.map((a) => {
            const spec = repoPath(kg.text(a, P("ent-gov:apiSpecification")));
            return (
              <div key={a} className="item">
                <div className="between">
                  <h3><Term id={a} /></h3>
                  {spec && <SourceLink path={spec} label="OpenAPI specification" />}
                </div>
                <p className="small">{kg.definition(a)}</p>
                <KV rows={[["Serves", <TermList key="s" ids={kg.objects(a, P("ent-gov:servesConcept"))} />], ["Owner", <TermList key="o" ids={kg.objects(a, P("ent-gov:hasApiOwner"))} />]]} />
              </div>
            );
          })
        ) : (
          <Empty>No domain APIs.</Empty>
        )}
      </Section>
      <Section title="Agent tools (execution models)">
        {tools.length ? (
          tools.map((t) => {
            const art = repoPath(kg.text(t, P("ent-fab:artifactPath")));
            const schema = repoPath(kg.text(t, P("ent-fab:inputSchemaPath")));
            return (
              <div key={t} className="item">
                <div className="between">
                  <h3><Term id={t} /> <span className="mono small">{kg.text(t, P("ent-fab:toolName"))}</span></h3>
                  <span className="row">{art && <SourceLink path={art} label="Query" />}{schema && <SourceLink path={schema} label="Input schema" />}</span>
                </div>
                <p className="small">{kg.definition(t)}</p>
                <KV
                  rows={[
                    ["Guidance for agents", kg.text(t, P("ent-av:agentGuidance"))],
                    ["Derived from rules", kg.objects(t, P("ent-fab:derivedFromRule")).length ? <TermList ids={kg.objects(t, P("ent-fab:derivedFromRule"))} /> : null],
                    ["Implements", kg.objects(t, P("ent-fab:implementsProcess")).length ? <TermList ids={kg.objects(t, P("ent-fab:implementsProcess"))} /> : null],
                    ["Controls", kg.objects(t, P("ent-fab:subjectToControl")).length ? <TermList ids={kg.objects(t, P("ent-fab:subjectToControl"))} /> : null],
                    ["Risk assessment", kg.objects(t, P("ent-fab:hasRiskAssessment")).length ? <TermList ids={kg.objects(t, P("ent-fab:hasRiskAssessment"))} /> : null],
                  ]}
                />
              </div>
            );
          })
        ) : (
          <Empty>No agent tools published.</Empty>
        )}
      </Section>
    </>
  );
}

function DataTab({ repo }: { repo: Repo }) {
  const { kg } = useData();
  const files = filesWithRole(repo, "stewardship");
  const products = declaredIn(kg, files, "dcat:Dataset").sort(byLabel(kg));
  const cdes = declaredIn(kg, files, "ent-gov:CriticalDataElement").sort(byLabel(kg));
  const P = (c: string) => kg.P(c);
  return (
    <>
      <Section title="Data products">
        {products.length ? products.map((p) => (
          <div key={p} className="item">
            <h3><Term id={p} /></h3>
            <p className="small">{kg.definition(p)}</p>
            <KV rows={[
              ["Serves", <TermList key="s" ids={kg.objects(p, P("ent-gov:servesConcept"))} />],
              ["Steward", <TermList key="o" ids={kg.objects(p, P("ent-gov:hasDataSteward"))} />],
              ["Sensitivity", kg.objects(p, P("ent-av:sensitivity")).length ? <TermList ids={kg.objects(p, P("ent-av:sensitivity"))} /> : null],
            ]} />
          </div>
        )) : <Empty>No data products.</Empty>}
      </Section>
      <Section title="Critical data elements">
        {cdes.length ? (
          <table>
            <thead><tr><th>Element</th><th>Of</th><th>Quality rules</th></tr></thead>
            <tbody>
              {cdes.map((c) => (
                <tr key={c}>
                  <td><Term id={c} /></td>
                  <td><TermList ids={kg.objects(c, P("ent-gov:elementOf"))} /></td>
                  <td><TermList ids={kg.objects(c, P("ent-gov:hasQualityRule"))} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : <Empty>No critical data elements.</Empty>}
      </Section>
    </>
  );
}

function RecordsTab({ repo }: { repo: Repo }) {
  const { kg } = useData();
  const recs = declaredIn(kg, filesWithRole(repo, "records"), "ent-gov:RecordClass").sort(byLabel(kg));
  const P = (c: string) => kg.P(c);
  if (!recs.length) return <Empty>No record classes.</Empty>;
  return (
    <>
      {recs.map((r) => (
        <Section key={r} title={<Term id={r} />}>
          <p>{kg.definition(r)}</p>
          <KV
            rows={[
              ["Record of", <TermList key="o" ids={kg.objects(r, P("ent-gov:recordOf"))} />],
              ["Retention", kg.objects(r, P("ent-gov:retentionPeriod")).map((x) => <ValueOf key={x} o={x} />)],
              ["Starts when", kg.text(r, P("ent-gov:retentionTrigger"))],
              ["Legal hold applies", kg.text(r, P("ent-gov:legalHoldApplicable"))],
              ["Disposal", kg.text(r, P("ent-gov:dispositionMethod"))],
              ["Regulatory citation", kg.text(r, P("ent-av:regulatoryCitation"))],
              ["Owner", <TermList key="w" ids={kg.objects(r, P("ent-gov:hasRecordsOwner"))} />],
            ]}
          />
        </Section>
      ))}
    </>
  );
}

function FabricTab({ repo }: { repo: Repo }) {
  const d = useData();
  const { kg } = d;
  const files = new Set([...filesWithRole(repo, "collections"), ...filesWithRole(repo, "execution")]);
  const colls = declaredIn(kg, files, "ent-fab:KnowledgeCollection").sort(byLabel(kg));
  const assessments = declaredIn(kg, files, "ent-ctl:RiskAssessment").sort(byLabel(kg));
  const cards = d.cards[repo.id]?.cards ?? [];
  const P = (c: string) => kg.P(c);
  return (
    <>
      {colls.map((c) => (
        <Section key={c} title={<Term id={c} />} actions={<Pill tone="mute">v{kg.text(c, P("owl:versionInfo"))}</Pill>}>
          <p>{kg.definition(c)}</p>
          <KV
            rows={[
              ["Sensitivity", <TermList key="s" ids={kg.objects(c, P("ent-fab:sensitivity"))} />],
              ["Usage policy", <TermList key="p" ids={kg.objects(c, P("ent-fab:usagePolicy"))} />],
              ["Controls", <TermList key="c" ids={kg.objects(c, P("ent-fab:subjectToControl"))} />],
              ["Risk assessment", <TermList key="r" ids={kg.objects(c, P("ent-fab:hasRiskAssessment"))} />],
            ]}
          />
          <h3 className="sub-h">Named-graph partitions</h3>
          <table>
            <thead><tr><th>Kind</th><th>Graph</th><th>From files</th></tr></thead>
            <tbody>
              {kg.objects(c, P("ent-fab:hasPartition")).map((p) => (
                <tr key={p}>
                  <td>{kg.objects(p, P("ent-fab:partitionKind")).map((k) => <Term key={k} id={k} />)}</td>
                  <td className="mono small">{kg.text(p, P("ent-fab:graphName"))}</td>
                  <td className="mono small">{kg.texts(p, P("ent-fab:sourcePath")).join(", ")}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Section>
      ))}
      <Section title="AI risk assessments">
        {assessments.length ? (
          <table>
            <thead><tr><th>Assessment</th><th>Of</th><th>Risks</th><th>Residual</th><th>Approved by</th></tr></thead>
            <tbody>
              {assessments.map((a) => (
                <tr key={a}>
                  <td><Term id={a} /><div className="small muted">{kg.text(a, P("ent-ctl:assessmentDate"))}</div></td>
                  <td><TermList ids={kg.objects(a, P("ent-ctl:assesses"))} /></td>
                  <td><TermList ids={kg.objects(a, P("ent-ctl:identifiedRisk"))} /></td>
                  <td><TermList ids={kg.objects(a, P("ent-ctl:residualRiskRating"))} /></td>
                  <td><TermList ids={kg.objects(a, P("ent-ctl:approvedBy"))} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : <Empty>No risk assessments.</Empty>}
      </Section>
      <Section title="Agent cards" actions={<span className="small muted">{cards.length} cards, {d.cards[repo.id]?.edges.length ?? 0} edges (GraphRAG export, gate G7)</span>}>
        {cards.length ? (
          <ul className="chips">
            {cards.map((c) => (
              <li key={c.id} className="chip">
                <a href={href.resource(c.id)}>{capitalize(c.label)}</a>
                <span className="kind">{c.type.map((t) => t.split(":").pop()).join(", ")}</span>
              </li>
            ))}
          </ul>
        ) : <Empty>No cards exported.</Empty>}
      </Section>
    </>
  );
}

export function applyBindings(query: string, bindings: Record<string, string>): string {
  let q = query;
  for (const [k, v] of Object.entries(bindings)) q = q.split("$" + k).join(v);
  return q;
}

function QuestionsTab({ repo }: { repo: Repo }) {
  if (!repo.competency_questions.length) return <Empty>No competency questions.</Empty>;
  return (
    <Section title="Competency questions" actions={<span className="small muted">Questions the knowledge graph must answer (gate G6)</span>}>
      <ul className="list">
        {repo.competency_questions.map((q) => (
          <li key={q.path} className="li cq">
            <div>
              <div className="row">
                <span className="mono small">{q.id}</span>
                <strong>{q.question}</strong>
              </div>
              <div className="small muted">
                Expects at least {q.expect.min_rows ?? 1} row(s)
                {q.expect.contains && Object.entries(q.expect.contains).map(([k, v]) => <span key={k}>; {k} contains &ldquo;{v}&rdquo;</span>)}
              </div>
              {q.query_path && <SourceLink path={q.query_path} />}
            </div>
            {q.query && (
              <a className="btn" href={href.sparql(applyBindings(q.query, q.bindings))}>
                <Icon name="play" size={14} /> Run
              </a>
            )}
          </li>
        ))}
      </ul>
    </Section>
  );
}

function FilesTab({ repo }: { repo: Repo }) {
  const groups = new Map<string, typeof repo.files>();
  for (const f of repo.files) groups.set(f.role ?? "other", [...(groups.get(f.role ?? "other") ?? []), f]);
  const order = [...groups.keys()].sort((a, b) => (a === "other" ? 1 : b === "other" ? -1 : a.localeCompare(b)));
  return (
    <Section title="Files" actions={<span className="small muted">{repo.files.length} files; roles from semantic.yaml</span>}>
      <div className="file-groups">
        {order.map((role) => (
          <div key={role}>
            <h3 className="sub-h">{role === "other" ? "Other files" : capitalize(role.replace("examples-", "examples: "))}</h3>
            <ul className="plain">
              {groups.get(role)!.map((f) => (
                <li key={f.path} className="between">
                  <SourceLink path={f.path} label={f.path.slice(repo.id.length + 1)} />
                  <span className="small muted">{(f.size / 1024).toFixed(1)} KB</span>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </Section>
  );
}

