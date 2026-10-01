import { Empty, Pill, Section, Term, TermList } from "../components/ui";
import { useData } from "../data";
import { byLabel, GATES } from "../model";
import { href } from "../router";
import { UpstreamIssues } from "./Health";

// How the enterprise governs representation and AI use: gates, decisions, controls, alignment, defects.
export function GovernancePage() {
  const d = useData();
  const { kg } = d;
  const P = (c: string) => kg.P(c);
  const adrs = d.docs.filter((x) => x.group === "adr").sort((a, b) => a.path.localeCompare(b.path));
  const standards = d.docs.filter((x) => x.group === "standards").sort((a, b) => a.path.localeCompare(b.path));
  const framework = d.docs.filter((x) => x.group === "framework").sort((a, b) => a.path.localeCompare(b.path));
  const controls = kg.instances("ent-ctl:AIControl").sort(byLabel(kg));
  const risks = kg.instances("ent-ctl:AIRisk").sort(byLabel(kg));
  const alignment = kg.instances("ent-gov:AlignmentDecision").sort(byLabel(kg));
  const shapesRepo = d.meta.repos.find((r) => r.kind === "governance");
  const shapeFiles = new Set(shapesRepo?.files.filter((f) => f.role === "shapes").map((f) => f.path) ?? []);
  const rdfType = P("rdf:type");
  const metaShapes = kg.instances("sh:NodeShape").filter((s) => kg.out[s].some((e) => e.p === rdfType && shapeFiles.has(kg.files[e.f]))).sort(byLabel(kg));
  return (
    <div className="stack">
      <header>
        <h1>Governance</h1>
        <p className="lead">
          The enterprise governs how meaning is represented and how AI consumes it; domains own the meaning itself. Changes go through two-key review
          (ADR-0002) and the gates below, locally with <code>make verify</code> and in CI.
        </p>
      </header>
      <div className="grid2">
        <Section title="Gates" actions={<a className="small" href={href.doc("docs/framework/02-enterprise-governance.md")}>How gates work</a>}>
          <table>
            <tbody>
              {GATES.map((g) => (
                <tr key={g.id}>
                  <td className="mono">{g.id}</td>
                  <td>{g.name}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="small">
            <a href={href.health()}>Current results</a> &middot; <a href={href.doc("docs/framework/08-validation-tooling.md")}>Tooling reference</a> &middot;{" "}
            <a href={href.doc("docs/framework/07-change-management.md")}>Changing things without drift</a>
          </p>
        </Section>
        <Section title="Decisions" actions={<span className="small muted">{adrs.length} records</span>}>
          <ul className="list">
            {adrs.map((a) => (
              <li key={a.path} className="li">
                <a href={href.doc(a.path)}>{a.title}</a>
                {a.status && <Pill tone={/accept/i.test(a.status) ? "pass" : "mute"}>{a.status}</Pill>}
              </li>
            ))}
          </ul>
        </Section>
      </div>
      <div className="grid2">
        <Section title="Framework guide">
          <ul className="list">
            {framework.map((x) => (
              <li key={x.path} className="li">
                <a href={href.doc(x.path)}>{x.title}</a>
              </li>
            ))}
          </ul>
        </Section>
        <Section title="Standards">
          <ul className="list">
            {standards.map((x) => (
              <li key={x.path} className="li">
                <a href={href.doc(x.path)}>{x.title}</a>
              </li>
            ))}
          </ul>
        </Section>
      </div>
      <Section title="AI controls" actions={<span className="small muted">{controls.length} controls, {risks.length} risks</span>}>
        <table>
          <thead>
            <tr>
              <th>Control</th>
              <th>What it requires</th>
              <th>Mitigates</th>
            </tr>
          </thead>
          <tbody>
            {controls.map((c) => (
              <tr key={c}>
                <td>
                  <Term id={c} />
                </td>
                <td className="small">{kg.definition(c)}</td>
                <td>
                  <TermList ids={kg.objects(c, P("ent-ctl:mitigates"))} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <h3 className="sub-h">Risks</h3>
        <TermList ids={risks} />
      </Section>
      <Section title="Cross-domain alignment decisions" actions={<a className="small" href={href.doc("enterprise-governance/docs/standards/07-cross-domain-alignment.md")}>Standard</a>}>
        {alignment.length ? (
          <table>
            <thead>
              <tr>
                <th>Decision</th>
                <th>Terms</th>
                <th>Type</th>
                <th>Domains consulted</th>
              </tr>
            </thead>
            <tbody>
              {alignment.map((a) => (
                <tr key={a}>
                  <td>
                    <Term id={a} />
                    <div className="small muted">{kg.definition(a)}</div>
                  </td>
                  <td>
                    <TermList ids={kg.objects(a, P("ent-gov:alignsTerm"))} />
                  </td>
                  <td>
                    <TermList ids={kg.objects(a, P("ent-gov:alignmentType"))} />
                  </td>
                  <td>
                    <TermList ids={kg.objects(a, P("ent-gov:consultedDomain"))} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <Empty>No alignment decisions recorded.</Empty>
        )}
      </Section>
      <Section title="Machine-checked standards" actions={<span className="small muted">Meta-shapes run by gate G2 over every governed asset</span>}>
        <TermList ids={metaShapes} />
      </Section>
      <UpstreamIssues />
    </div>
  );
}
