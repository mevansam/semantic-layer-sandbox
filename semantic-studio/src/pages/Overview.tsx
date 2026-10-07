import { Icon, Pill, Section, Term } from "../components/ui";
import { Repo, useData } from "../data";
import { byLabel, declaredIn, filesWithRole, findings, schemeMembers } from "../model";
import { href } from "../router";
import { DecisionChip, decisions } from "../components/Decisions";
import { repoHealthSummary } from "./Health";

export function OverviewPage() {
  const d = useData();
  const { kg, meta } = d;
  const ods = kg.instances("ent-gov:OntologyDomain").sort(byLabel(kg));
  const bds = kg.instances("ent-gov:BusinessDomain");
  const caps = schemeMembers(kg, "CapabilityMap");
  const proposed = caps.filter((c) => kg.text(c, kg.P("ent-gov:capabilityStatus")) === "Proposed");
  const tax = schemeMembers(kg, "EnterpriseTaxonomy");
  const subs = meta.repos.filter((r) => r.kind === "domain");
  const rules = kg.instances("ent-gov:BusinessRule");
  const cards = Object.values(d.cards).reduce((n, c) => n + c.cards.length, 0);
  const edges = Object.values(d.cards).reduce((n, c) => n + c.edges.length, 0);
  const inOD = kg.P("ent-gov:inOntologyDomain");
  const perOD = ods.map((o) => [o, bds.filter((b) => kg.has(b, inOD, o)).length] as [number, number]).sort((a, b) => b[1] - a[1]);
  const unplaced = bds.filter((b) => !kg.objects(b, inOD).length).length;
  const max = Math.max(1, ...perOD.map(([, n]) => n), unplaced);
  const adrs = decisions(kg).reverse();
  const gov = meta.repos.find((r) => r.kind === "governance");
  const fx = meta.repos.find((r) => r.kind === "fibo-extensions");
  const business = meta.repos.filter((r) => r.kind === "business-domain");

  return (
    <div className="stack">
      <header className="between top">
        <div>
          <h1>Semantic layer overview</h1>
          <p className="lead">What the enterprise governs, what each domain owns, and whether it all still lines up.</p>
        </div>
        <div className="row actions">
          <a className="btn" href={href.doc("docs/framework/README.md")}>
            <Icon name="docs" size={16} /> Framework guide
          </a>
          <a className="btn primary" href={href.health()}>
            <Icon name="health" size={16} /> Health
          </a>
        </div>
      </header>

      <div className="tiles">
        <a className="tile" href={href.domains()}><b>{ods.length}</b><span>ontology domains</span></a>
        <a className="tile" href={href.domains()}><b>{bds.length}</b><span>business domains</span></a>
        <a className="tile" href={href.capabilities()}><b>{caps.length - proposed.length}</b><span>capabilities{proposed.length ? ` (+${proposed.length} proposed)` : ""}</span></a>
        <a className="tile" href={href.taxonomy()}><b>{tax.length}</b><span>taxonomy concepts</span></a>
        <a className="tile" href={href.domains()}><b>{subs.length}</b><span>modelled sub-domains</span></a>
        <a className="tile" href={href.governance()}><b>{rules.length}</b><span>business rules</span></a>
        <div className="tile"><b>{cards}</b><span>agent cards ({edges} edges)</span></div>
      </div>

      <Section title="Layers" actions={<span className="small muted">Select a layer to open it</span>}>
        <div className="lane">
          <div className="lanelab">Enterprise</div>
          <div className="grid3">
            <a className="layer" href={href.taxonomy()}>
              <h3>Taxonomy</h3>
              <span className="small muted">{tax.length} business subject areas; every class names the one that governs it</span>
            </a>
            <a className="layer" href={href.capabilities()}>
              <h3>Capability map</h3>
              <span className="small muted">{ods.length} ontology domains, {bds.length} business domains, {caps.length} capabilities</span>
            </a>
            {gov && (
              <a className="layer" href={href.governance()}>
                <h3>Governance model and decisions</h3>
                <span className="small muted">Gates G1-G8, AI controls, {adrs.length} decisions</span>
              </a>
            )}
          </div>
        </div>
        <div className="lane">
          <div className="lanelab">Shared extensions</div>
          <div className="grid3">
            {fx && (
              <a className="layer" href={href.domain(fx.id)}>
                <h3>FIBO extensions</h3>
                <span className="small muted">Enterprise core, alignment, domain registry, FIBO profile</span>
              </a>
            )}
            <a className="layer" href={href.fibo()}>
              <h3>FIBO {meta.fibo.release_tag}</h3>
              <span className="small muted">{meta.fibo.modules.length} modules in the enterprise profile{meta.fibo.pin ? `, pinned ${meta.fibo.pin.slice(0, 7)}` : ""}</span>
            </a>
            <a className="layer" href={href.health(undefined, "upstream")}>
              <h3>Known upstream defects</h3>
              <span className="small muted">{d.health.upstream_issues.length} registered (ADR-0007)</span>
            </a>
          </div>
        </div>
        {business.map((b) => (
          <div className="lane" key={b.id}>
            <div className="lanelab">Domains</div>
            <div className="grid3">
              <LayerRepo repo={b} accent />
              {b.sub_domains.map((id) => d.repo(id)).filter(Boolean).map((r) => (
                <LayerRepo key={r!.id} repo={r!} />
              ))}
            </div>
          </div>
        ))}
      </Section>

      <div className="grid2">
        <Section title="Business domains by ontology domain" actions={<a className="small" href={href.domains()}>Domain register</a>}>
          <ul className="bars">
            {[...perOD, ...(unplaced ? [[null, unplaced] as [number | null, number]] : [])].map(([o, n]) => (
              <li key={o ?? "none"}>
                <span className="bar-label">{o === null ? <span className="muted">Not yet placed</span> : <Term id={o} />}</span>
                <span className="bar" aria-hidden="true">
                  <i style={{ width: `${(n / max) * 100}%` }} />
                </span>
                <span className="mono small bar-n">{n}</span>
              </li>
            ))}
          </ul>
        </Section>
        <div className="stack">
          <Section title="Needs attention">
            <Attention proposed={proposed.length} />
          </Section>
          <Section title="Decisions" actions={<a className="small" href={href.governance()}>All decisions</a>}>
            <ul className="list">
              {adrs.slice(0, 5).map((a) => (
                <li key={a} className="li">
                  <span>
                    <DecisionChip id={a} /> <a href={href.resource(kg.iri(a))}>{kg.label(a)}</a>
                  </span>
                  <span className="small muted">{kg.subjects(kg.P("ent-gov:justifiedBy"), a).length} linked</span>
                </li>
              ))}
            </ul>
          </Section>
        </div>
      </div>
    </div>
  );
}

function LayerRepo({ repo, accent }: { repo: Repo; accent?: boolean }) {
  const d = useData();
  const { kg } = d;
  const h = repoHealthSummary(d, repo);
  const classes = declaredIn(kg, filesWithRole(repo, "ontology"), "owl:Class").length;
  const rules = declaredIn(kg, filesWithRole(repo, "rules"), "ent-gov:BusinessRule").length;
  return (
    <a className={`layer${accent ? " accent" : ""}`} href={href.domain(repo.id)}>
      <span className="between">
        <h3>{repo.name}</h3>
        <span className={`pill ${h.tone}`}>{h.label}</span>
      </span>
      <span className="small muted">
        {repo.kind === "business-domain"
          ? `Business domain, ${repo.sub_domains.length} sub-domains`
          : `${classes} classes, ${rules} rules, ${d.cards[repo.id]?.cards.length ?? 0} agent cards`}
      </span>
    </a>
  );
}

function Attention({ proposed }: { proposed: number }) {
  const d = useData();
  const items: { tone: "fail" | "warn" | "info" | "mute"; tag: string; text: string; url: string }[] = [];
  for (const r of d.meta.repos) {
    const h = d.health.repos[r.id];
    const all = [...Object.values(h?.reports ?? {}), ...(h?.drift ? [h.drift] : [])];
    const msgs = new Set<string>();
    for (const rep of all) for (const s of rep.steps) for (const m of findings(s.messages)) msgs.add(`${m.level}|${m.text}`);
    for (const k of msgs) {
      const [level, text] = [k.slice(0, k.indexOf("|")), k.slice(k.indexOf("|") + 1)];
      items.push({ tone: level === "fail" ? "fail" : "warn", tag: level === "fail" ? "Failure" : "Warning", text: `${r.name}: ${text}`, url: href.domain(r.id, "health") });
    }
    if (h?.align && !h.align.passed) items.push({ tone: "fail", tag: "Template drift", text: `${r.name}: ${h.align.summary}`, url: href.domain(r.id, "health") });
  }
  for (const u of d.health.upstream_issues) items.push({ tone: "info", tag: "Known defect", text: `${u.id} ${u.title}`, url: href.health(undefined, "upstream") });
  if (proposed) items.push({ tone: "mute", tag: "Proposed", text: `${proposed} capabilities awaiting review`, url: href.capabilities() });
  const unverified = d.meta.repos.filter((r) => !d.health.repos[r.id]?.reports?.verify).length;
  if (unverified) items.push({ tone: "mute", tag: "Not verified", text: `${unverified} repositories have no gate results in this build (run make verify, then make studio)`, url: href.health() });
  if (!items.length) return <p className="small muted">Nothing needs attention.</p>;
  return (
    <ul className="list">
      {items.slice(0, 8).map((x, i) => (
        <li key={i} className="li">
          <span>
            <Pill tone={x.tone}>{x.tag}</Pill> <span className="small">{x.text}</span>
          </span>
          <a className="small" href={x.url}>Open</a>
        </li>
      ))}
      {items.length > 8 && (
        <li className="li">
          <a className="small" href={href.health()}>{items.length - 8} more on the Health page</a>
        </li>
      )}
    </ul>
  );
}
