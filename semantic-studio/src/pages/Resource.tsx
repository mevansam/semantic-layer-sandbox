// Any term of the semantic layer: classes, properties, rules, APIs, capabilities, FIBO terms, ...
import { ReactNode, useState } from "react";
import { Empty, Icon, KV, Pill, Section, SourceLink, Term, TermList, ValueOf } from "../components/ui";
import { useData, useSettings } from "../data";
import { capitalize, KG } from "../kg";
import { byLabel, isExternal, kindOf, repoOfNode } from "../model";
import { href } from "../router";

// predicates shown in the header or in dedicated sections, not again under "Facts"
const SHOWN = [
  "rdf:type", "rdfs:label", "skos:prefLabel", "skos:definition", "dct:description", "dct:abstract", "rdfs:comment",
  "ent-av:ruleStatement", "ent-av:agentGuidance", "ent-av:businessExample", "skos:editorialNote", "skos:scopeNote",
  "rdfs:subClassOf", "skos:broader", "owl:versionInfo", "fibo-fnd-utl-av:hasMaturityLevel", "rdfs:domain", "rdfs:range",
];

export function ResourcePage({ iri }: { iri: string }) {
  const d = useData();
  const { kg } = d;
  const { technical } = useSettings();
  const s = kg.id(iri);
  if (s === undefined) {
    return (
      <div className="stack">
        <h1>Not in the semantic layer</h1>
        <p className="mono small">{iri}</p>
        <p>
          This IRI is not mentioned by any governed file or by the 12 FIBO profile modules.{" "}
          <a href={href.sparql(`DESCRIBE <${iri}>`)}>Ask the SPARQL endpoint</a>
        </p>
      </div>
    );
  }
  const kind = kindOf(kg, s);
  const repo = repoOfNode(d, s);
  const files = kg.definingFiles(s);
  const fiboModule = d.meta.fibo.modules.find((m) => m.file && files.includes(m.file));
  const label = capitalize(kg.label(s));
  const def = kg.definition(s);
  const card = d.cardOf(iri);
  const t = (c: string) => kg.P(c);
  const maturity = kg.object(s, t("fibo-fnd-utl-av:hasMaturityLevel"));
  const version = kg.text(s, t("owl:versionInfo"));
  const status = kg.text(s, t("ent-gov:capabilityStatus"));
  const ruleId = kg.text(s, t("ent-av:ruleIdentifier"));

  return (
    <div className="stack">
      <div className="crumbs">
        {repo ? (
          <>
            <a href={href.domains()}>Domains</a> / <a href={href.domain(repo.id)}>{repo.name}</a>
          </>
        ) : fiboModule ? (
          <>
            <a href={href.fibo()}>FIBO</a> / <Term id={kg.id(fiboModule.iri)!} />
          </>
        ) : isExternal(iri) ? (
          <a href={href.fibo()}>FIBO and OMG</a>
        ) : (
          <a href={href.overview()}>Overview</a>
        )}
      </div>
      <header className="between top">
        <div className="title-block">
          <div className="row">
            <h1>{label}</h1>
            <Pill tone="info">{kind.label}</Pill>
            {ruleId && <Pill tone="mute">{ruleId}</Pill>}
            {status && <Pill tone={status === "Proposed" ? "warn" : "mute"}>{status}</Pill>}
            {maturity !== undefined && <Pill tone="mute">{kg.label(maturity)}</Pill>}
            {version && <Pill tone="mute">v{version}</Pill>}
          </div>
          {(technical || label.toLowerCase() !== kg.curie(iri).toLowerCase()) && <div className="mono small muted iri">{technical ? iri : kg.curie(iri)}</div>}
          {def && <p className="lead">{def}</p>}
        </div>
        <div className="row actions">
          <a className="btn" href={href.graph("neighbourhood", iri)}>
            <Icon name="graph" size={16} /> Neighbourhood
          </a>
          <a className="btn" href={href.sparql(`DESCRIBE <${iri}>`)}>
            <Icon name="sparql" size={16} /> Query
          </a>
        </div>
      </header>

      <Guidance s={s} />
      <KindSections s={s} kindKey={kind.key} />
      <Facts s={s} />
      <ReferencedBy s={s} />
      {card && <AgentCard card={card} />}

      <Section title="Where it is defined">
        <ul className="plain">
          {files.map((f) => (
            <li key={f}>
              <SourceLink path={f} />
              {f.includes("/build/") && <span className="muted small"> (labels and parents from a reasoning closure)</span>}
            </li>
          ))}
        </ul>
        {fiboModule?.url && (
          <p className="small">
            <a href={fiboModule.url} target="_blank" rel="noopener noreferrer">
              Open the module in the FIBO repository at {d.meta.fibo.release_tag} <Icon name="ext" size={14} />
            </a>
          </p>
        )}
      </Section>
      {technical && <RawTriples s={s} />}
    </div>
  );
}

function Guidance({ s }: { s: number }) {
  const { kg } = useData();
  const t = (c: string) => kg.P(c);
  const example = kg.texts(s, t("ent-av:businessExample"));
  const guidance = kg.text(s, t("ent-av:agentGuidance"));
  const notes = [...kg.texts(s, t("skos:editorialNote")), ...kg.texts(s, t("skos:scopeNote"))];
  if (!example.length && !guidance && !notes.length) return null;
  return (
    <div className="grid2">
      {example.length > 0 && (
        <Section title="Example">
          {example.map((e, i) => (
            <p key={i} className="quote">{e}</p>
          ))}
        </Section>
      )}
      {guidance && (
        <Section title="Guidance for AI agents">
          <p>{guidance}</p>
        </Section>
      )}
      {notes.length > 0 && (
        <Section title="Notes">
          {notes.map((n, i) => (
            <p key={i}>{n}</p>
          ))}
        </Section>
      )}
    </div>
  );
}

function KindSections({ s, kindKey }: { s: number; kindKey: string }) {
  switch (kindKey) {
    case "class":
      return <ClassSections s={s} />;
    case "property":
      return <PropertySections s={s} />;
    case "taxonomy":
    case "capability":
    case "concept":
      return <ConceptSections s={s} />;
    case "ontology":
      return <OntologySections s={s} />;
    case "rule":
      return <RuleSections s={s} />;
    default:
      return null;
  }
}

function ClassSections({ s }: { s: number }) {
  const { kg } = useData();
  const sub = kg.P("rdfs:subClassOf");
  const chain = kg.chain(s, sub).reverse();
  const children = kg.subjects(sub, s).filter((c) => !kg.isBlank(c)).sort(byLabel(kg));
  const lineage = [s, ...kg.ancestors(s, sub)];
  const domain = kg.P("rdfs:domain"), range = kg.P("rdfs:range");
  const props = lineage.flatMap((c) => kg.subjects(domain, c).map((p) => ({ p, from: c })));
  const rangeOf = kg.subjects(range, s).filter((p) => !kg.isBlank(p));
  const restrictions = kg.objects(s, sub).filter((o) => kg.isBlank(o));
  const rules = lineage.flatMap((c) => kg.subjects(kg.P("sh:targetClass"), c).map((r) => ({ r, from: c })));
  return (
    <>
      <Section title="Lineage">
        <ol className="lineage">
          {chain.map((c, i) => (
            <li key={c} className={c === s ? "here" : ""}>
              {i > 0 && <Icon name="chevron" size={16} />}
              {c === s ? <strong>{capitalize(kg.label(c))}</strong> : <Term id={c} />}
            </li>
          ))}
        </ol>
        {children.length > 0 && (
          <div>
            <h3 className="sub-h">Specialisations</h3>
            <TermList ids={children} />
          </div>
        )}
        {restrictions.length > 0 && (
          <div>
            <h3 className="sub-h">Restrictions</h3>
            <ul className="plain">
              {restrictions.map((r) => (
                <li key={r}>
                  <ValueOf o={r} />
                </li>
              ))}
            </ul>
          </div>
        )}
      </Section>
      <Section title="Properties" actions={<span className="small muted">{props.length} with this class (or a parent) as domain</span>}>
        {props.length ? (
          <table>
            <thead>
              <tr>
                <th>Property</th>
                <th>Value</th>
                <th>Inherited from</th>
              </tr>
            </thead>
            <tbody>
              {props.map(({ p, from }) => (
                <tr key={`${p}-${from}`}>
                  <td>
                    <Term id={p} />
                  </td>
                  <td>{kg.objects(p, range).map((r) => <ValueOf key={r} o={r} />)}</td>
                  <td>{from === s ? <span className="muted">-</span> : <Term id={from} />}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <Empty>No property declares this class (or its parents) as its domain.</Empty>
        )}
        {rangeOf.length > 0 && (
          <div>
            <h3 className="sub-h">Referenced by properties</h3>
            <TermList ids={rangeOf} showKind />
          </div>
        )}
      </Section>
      {rules.length > 0 && (
        <Section title="Business rules">
          <RuleList items={rules.map((x) => x.r)} />
        </Section>
      )}
    </>
  );
}

export function RuleList({ items }: { items: number[] }) {
  const { kg } = useData();
  return (
    <ul className="list">
      {[...new Set(items)].map((r) => (
        <li key={r} className="li">
          <div>
            <div className="row">
              <span className="mono small">{kg.text(r, kg.P("ent-av:ruleIdentifier"))}</span>
              <Term id={r} />
            </div>
            <div className="small muted">{kg.text(r, kg.P("ent-av:ruleStatement"))}</div>
          </div>
        </li>
      ))}
    </ul>
  );
}

function PropertySections({ s }: { s: number }) {
  const { kg } = useData();
  const rows: [ReactNode, ReactNode][] = [
    ["Domain", <TermList key="d" ids={kg.objects(s, kg.P("rdfs:domain"))} empty="not stated" />],
    ["Range", <span key="r">{kg.objects(s, kg.P("rdfs:range")).map((r) => <ValueOf key={r} o={r} />)}</span>],
    ["Specialises", kg.objects(s, kg.P("rdfs:subPropertyOf")).length ? <TermList ids={kg.objects(s, kg.P("rdfs:subPropertyOf"))} /> : null],
    ["Inverse of", kg.objects(s, kg.P("owl:inverseOf")).length ? <TermList ids={kg.objects(s, kg.P("owl:inverseOf"))} /> : null],
  ];
  return (
    <Section title="Shape">
      <KV rows={rows} />
    </Section>
  );
}

function ConceptSections({ s }: { s: number }) {
  const { kg } = useData();
  const broader = kg.P("skos:broader");
  const chain = kg.chain(s, broader).reverse();
  const narrower = kg.subjects(broader, s).sort(byLabel(kg));
  const isCap = kindOf(kg, s).key === "capability";
  return (
    <Section
      title={isCap ? "Place in the capability map" : "Place in the taxonomy"}
      actions={<a className="small" href={isCap ? href.capabilities(kg.iri(s)) : href.taxonomy(kg.iri(s))}>Open in the tree</a>}
    >
      <ol className="lineage">
        {chain.map((c, i) => (
          <li key={c} className={c === s ? "here" : ""}>
            {i > 0 && <Icon name="chevron" size={16} />}
            {c === s ? <strong>{capitalize(kg.label(c))}</strong> : <Term id={c} />}
          </li>
        ))}
      </ol>
      {narrower.length > 0 && (
        <div>
          <h3 className="sub-h">Narrower ({narrower.length})</h3>
          <TermList ids={narrower} />
        </div>
      )}
    </Section>
  );
}

function OntologySections({ s }: { s: number }) {
  const d = useData();
  const { kg } = d;
  const imports = kg.objects(s, kg.P("owl:imports"));
  const importedBy = kg.subjects(kg.P("owl:imports"), s);
  const files = new Set(kg.definingFiles(s));
  const rdfType = kg.P("rdf:type");
  const decl = new Set(["owl:Class", "owl:ObjectProperty", "owl:DatatypeProperty", "owl:AnnotationProperty", "owl:NamedIndividual"].map((c) => kg.P(c)));
  const terms = kg.nodes
    .map((_, i) => i)
    .filter((i) => !kg.isBlank(i) && i !== s && kg.out[i].some((e) => e.p === rdfType && decl.has(e.o) && files.has(kg.files[e.f])));
  const classes = terms.filter((i) => kg.isA(i, "owl:Class")).sort(byLabel(kg));
  const props = terms.filter((i) => !kg.isA(i, "owl:Class") && !kg.isA(i, "owl:NamedIndividual")).sort(byLabel(kg));
  const inds = terms.filter((i) => kg.isA(i, "owl:NamedIndividual") && !kg.isA(i, "owl:Class")).sort(byLabel(kg));
  return (
    <>
      <div className="grid2">
        <Section title="Imports">
          <TermList ids={imports} empty="Imports nothing." />
        </Section>
        <Section title="Imported by">
          <TermList ids={importedBy} empty="Not imported by any loaded ontology." />
        </Section>
      </div>
      <Section title="Defines" actions={<span className="small muted">{classes.length} classes, {props.length} properties, {inds.length} individuals</span>}>
        {classes.length > 0 && (
          <>
            <h3 className="sub-h">Classes</h3>
            <TermList ids={classes} />
          </>
        )}
        {props.length > 0 && (
          <>
            <h3 className="sub-h">Properties</h3>
            <TermList ids={props} />
          </>
        )}
        {inds.length > 0 && (
          <>
            <h3 className="sub-h">Individuals</h3>
            <TermList ids={inds} />
          </>
        )}
        {!terms.length && <Empty>This ontology declares no classes or properties of its own.</Empty>}
      </Section>
    </>
  );
}

function RuleSections({ s }: { s: number }) {
  const d = useData();
  const { kg } = d;
  const repo = repoOfNode(d, s);
  const id = kg.text(s, kg.P("ent-av:ruleIdentifier")) ?? "";
  const tests = repo?.negative_tests.filter((t) => t.expect_violations?.includes(id)) ?? [];
  const props = kg.objects(s, kg.P("sh:property"));
  const sparql = kg.objects(s, kg.P("sh:sparql"));
  return (
    <>
      <Section title="What it checks">
        <KV
          rows={[
            ["Applies to", <TermList key="t" ids={kg.objects(s, kg.P("sh:targetClass"))} empty="no target class" />],
            ["Owner", <TermList key="o" ids={kg.objects(s, kg.P("ent-gov:hasRuleOwner"))} empty="not stated" />],
            ["Severity", kg.objects(s, kg.P("sh:severity")).length ? <TermList ids={kg.objects(s, kg.P("sh:severity"))} /> : null],
          ]}
        />
        {props.length > 0 && (
          <>
            <h3 className="sub-h">Constraints</h3>
            <ul className="plain constraints">
              {props.map((p) => (
                <li key={p}>
                  <ValueOf o={p} />
                </li>
              ))}
            </ul>
          </>
        )}
        {sparql.length > 0 && (
          <>
            <h3 className="sub-h">SPARQL constraint</h3>
            {sparql.map((x) => (
              <pre key={x}>{kg.text(x, kg.P("sh:select")) ?? kg.text(x, kg.P("sh:ask")) ?? ""}</pre>
            ))}
          </>
        )}
      </Section>
      <Section title="Tests" actions={<span className="small muted">Gate G5: positive examples conform, each negative case trips its rules</span>}>
        {tests.length ? (
          <ul className="list">
            {tests.map((t) => (
              <li key={t.path} className="li">
                <span>{capitalize(t.name)}</span>
                <SourceLink path={t.path} label={t.file} />
              </li>
            ))}
          </ul>
        ) : (
          <Empty>No negative test case lists this rule.</Empty>
        )}
      </Section>
    </>
  );
}

/** Everything else this term says, grouped by predicate. */
function Facts({ s }: { s: number }) {
  const { kg } = useData();
  const skip = new Set(SHOWN.map((c) => kg.P(c)));
  const kindKey = kindOf(kg, s).key;
  if (kindKey === "rule") ["sh:property", "sh:targetClass", "ent-gov:hasRuleOwner", "sh:severity", "sh:sparql", "ent-av:ruleIdentifier"].forEach((c) => skip.add(kg.P(c)));
  if (kindKey === "ontology") skip.add(kg.P("owl:imports"));
  if (kindKey === "property") ["rdfs:subPropertyOf", "owl:inverseOf"].forEach((c) => skip.add(kg.P(c)));
  const groups = groupBy(kg, kg.out[s].filter((e) => !skip.has(e.p)), (e) => e.p);
  if (!groups.length) return null;
  return (
    <Section title="Facts">
      <dl className="kv">
        {groups.map(([p, edges]) => (
          <div key={p}>
            <dt>
              <PredicateLabel p={p} />
            </dt>
            <dd>
              {edges.map((e, i) => (
                <div key={i}>
                  <ValueOf o={e.o} />
                </div>
              ))}
            </dd>
          </div>
        ))}
      </dl>
    </Section>
  );
}

function ReferencedBy({ s }: { s: number }) {
  const { kg } = useData();
  const skip = new Set(["rdfs:subClassOf", "skos:broader", "rdf:type", "rdfs:domain", "rdfs:range", "sh:targetClass", "skos:inScheme", "owl:imports"].map((c) => kg.P(c)));
  const all = kg.inc[s].filter((e) => !skip.has(e.p));
  const [showAll, setShowAll] = useState(false);
  if (!all.length) return null;
  const groups = groupBy(kg, all, (e) => e.p);
  const limit = showAll ? Infinity : 12;
  return (
    <Section title="Used by" actions={<span className="small muted">{all.length} references</span>}>
      <dl className="kv">
        {groups.map(([p, edges]) => {
          const subs = [...new Set(edges.map((e) => blankOwner(kg, e.s)))];
          return (
            <div key={p}>
              <dt>
                as <PredicateLabel p={p} />
              </dt>
              <dd>
                <ul className="chips">
                  {subs.slice(0, limit).map((x) => (
                    <li key={x} className="chip">
                      <Term id={x} showKind />
                    </li>
                  ))}
                  {subs.length > limit && (
                    <li>
                      <button className="link" type="button" onClick={() => setShowAll(true)}>
                        {subs.length - limit} more
                      </button>
                    </li>
                  )}
                </ul>
              </dd>
            </div>
          );
        })}
      </dl>
    </Section>
  );
}

/** a blank node's nearest named owner (e.g. the rule a property shape belongs to) */
function blankOwner(kg: KG, s: number): number {
  let cur = s;
  for (let i = 0; i < 6 && kg.isBlank(cur); i++) {
    const up = kg.inc[cur][0];
    if (!up) break;
    cur = up.s;
  }
  return cur;
}

function PredicateLabel({ p }: { p: number }) {
  const { kg } = useData();
  const { technical } = useSettings();
  return (
    <a href={href.resource(kg.iri(p))} className="pred" title={kg.curie(kg.iri(p))}>
      {technical ? kg.curie(kg.iri(p)) : kg.label(p)}
    </a>
  );
}

function groupBy<T>(kg: KG, items: T[], key: (x: T) => number): [number, T[]][] {
  const m = new Map<number, T[]>();
  for (const x of items) m.set(key(x), [...(m.get(key(x)) ?? []), x]);
  return [...m.entries()].sort((a, b) => kg.label(a[0]).localeCompare(kg.label(b[0])));
}

function AgentCard({ card }: { card: object }) {
  const [copied, setCopied] = useState(false);
  const text = JSON.stringify(card, null, 2);
  return (
    <Section
      title="Agent view"
      actions={
        <button
          className="btn"
          type="button"
          onClick={() => {
            navigator.clipboard?.writeText(text).then(() => setCopied(true), () => setCopied(false));
          }}
        >
          <Icon name="copy" size={16} /> {copied ? "Copied" : "Copy JSON"}
        </button>
      }
    >
      <p className="small muted">The GraphRAG concept card an AI agent retrieves for this term (semtool cards), as published.</p>
      <pre className="code">{text}</pre>
    </Section>
  );
}

function RawTriples({ s }: { s: number }) {
  const { kg } = useData();
  return (
    <Section title="Triples" actions={<span className="small muted">{kg.out[s].length} outgoing, {kg.inc[s].length} incoming</span>}>
      <div className="scroll-x">
        <table className="mono small">
          <thead>
            <tr>
              <th>Subject</th>
              <th>Predicate</th>
              <th>Object</th>
              <th>File</th>
            </tr>
          </thead>
          <tbody>
            {kg.out[s].map((e, i) => (
              <tr key={"o" + i}>
                <td>this</td>
                <td>{kg.curie(kg.iri(e.p))}</td>
                <td>{e.o < 0 ? JSON.stringify(kg.lit(e.o).value) : kg.curie(kg.iri(e.o))}</td>
                <td>{kg.files[e.f]}</td>
              </tr>
            ))}
            {kg.inc[s].map((e, i) => (
              <tr key={"i" + i}>
                <td>{kg.curie(kg.iri(e.s))}</td>
                <td>{kg.curie(kg.iri(e.p))}</td>
                <td>this</td>
                <td>{kg.files[e.f]}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Section>
  );
}
