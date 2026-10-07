// Enterprise rules and the decisions (ADRs) that justify them (ADR-0010): ent-gov:justifiedBy, ent-gov:definedIn.
import { Data, useData } from "../data";
import { slug } from "./Markdown";
import { capitalize, KG } from "../kg";
import { href } from "../router";
import { Empty, Icon, KV, Pill, Section, Term } from "./ui";

/** link for a repository path with an optional #section: a rendered document when there is one, else the source */
export function pathLink(d: Data, path: string): string {
  const [file, frag] = path.split("#");
  return d.docs.some((x) => x.path === file) ? href.doc(file, frag) : href.source(file);
}

/** "GOVERNANCE.md, Release gates (CI, all mandatory)": the file name and, for a #section, its heading as written */
export function pathLabel(d: Data, path: string): string {
  const [file, frag] = path.split("#");
  const name = file.split("/").pop() ?? file;
  if (!frag) return name;
  const doc = d.docs.find((x) => x.path === file);
  const heading = doc && [...doc.text.matchAll(/^#{1,6}\s+(.+?)\s*$/gm)].map((m) => m[1].replace(/[`*]/g, "")).find((h) => slug(h) === frag);
  return `${name}, ${heading ?? frag.replace(/-/g, " ")}`;
}

export function decisions(kg: KG): number[] {
  return kg
    .instances("ent-gov:ArchitectureDecision")
    .sort((a, b) => (kg.text(a, kg.P("skos:notation")) ?? "").localeCompare(kg.text(b, kg.P("skos:notation")) ?? ""));
}

export function enterpriseRules(kg: KG): number[] {
  const order = "GEDCRKUA";
  const code = (r: number) => kg.text(r, kg.P("ent-gov:ruleCode")) ?? "";
  return kg.instances("ent-gov:EnterpriseRule").sort((a, b) => {
    const [x, y] = [code(a), code(b)];
    return order.indexOf(x[0]) - order.indexOf(y[0]) || Number(x.slice(1)) - Number(y.slice(1));
  });
}

export function DecisionChip({ id }: { id: number }) {
  const d = useData();
  const { kg } = d;
  const status = kg.text(id, kg.P("ent-gov:decisionStatus")) ?? "";
  return (
    <span className="term">
      <a href={href.resource(kg.iri(id))}>{kg.text(id, kg.P("skos:notation")) ?? kg.label(id)}</a>
      {status && status !== "Accepted" && <Pill tone="warn">{status}</Pill>}
    </span>
  );
}

export function DefinedInLinks({ s }: { s: number }) {
  const d = useData();
  const paths = d.kg.texts(s, d.kg.P("ent-gov:definedIn"));
  if (!paths.length) return null;
  return (
    <span className="link-list">
      {paths.map((p) => (
        <a key={p} href={pathLink(d, p)} className="small">
          {pathLabel(d, p)}
        </a>
      ))}
    </span>
  );
}

/** On a rule or meta-shape: which decisions justify it and where it is defined. */
export function WhySection({ s }: { s: number }) {
  const d = useData();
  const { kg } = d;
  const why = kg.objects(s, kg.P("ent-gov:justifiedBy"));
  const defined = kg.texts(s, kg.P("ent-gov:definedIn"));
  if (!why.length && !defined.length) return null;
  return (
    <Section title="Why this rule exists">
      {why.length ? (
        <ul className="list">
          {why.map((w) => {
            const record = kg.text(w, kg.P("ent-gov:decisionRecord"));
            return (
              <li key={w} className="li">
                <div>
                  <div className="row">
                    <DecisionChip id={w} />
                    <span>{capitalize(kg.label(w))}</span>
                  </div>
                </div>
                {record && (
                  <a className="btn" href={pathLink(d, record)}>
                    <Icon name="docs" size={14} /> Read the decision
                  </a>
                )}
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="small muted">No decision record: this rule comes from the standard below, without a separate decision.</p>
      )}
      <KV rows={[["Defined in", <DefinedInLinks key="d" s={s} />], ["Enforced by", kg.text(s, kg.P("ent-gov:enforcedBy"))]]} />
    </Section>
  );
}

/** On a decision: its record, status, what it supersedes, and the rules it justifies. */
export function DecisionSections({ s }: { s: number }) {
  const d = useData();
  const { kg } = d;
  const record = kg.text(s, kg.P("ent-gov:decisionRecord"));
  const supersedes = kg.objects(s, kg.P("ent-gov:supersedesDecision"));
  const supersededBy = kg.subjects(kg.P("ent-gov:supersedesDecision"), s);
  const justified = kg.subjects(kg.P("ent-gov:justifiedBy"), s);
  const rules = enterpriseRules(kg).filter((x) => justified.includes(x));
  const shapes = justified.filter((x) => !kg.isA(x, "ent-gov:EnterpriseRule"));
  return (
    <>
      <Section
        title="Decision record"
        actions={
          record && (
            <a className="btn primary" href={pathLink(d, record)}>
              <Icon name="docs" size={14} /> Read the decision
            </a>
          )
        }
      >
        <KV
          rows={[
            ["Status", kg.text(s, kg.P("ent-gov:decisionStatus"))],
            ["Date", kg.text(s, kg.P("dct:date"))],
            ["Supersedes", supersedes.length ? <span>{supersedes.map((x) => <DecisionChip key={x} id={x} />)}</span> : null],
            ["Superseded by", supersededBy.length ? <span>{supersededBy.map((x) => <DecisionChip key={x} id={x} />)}</span> : null],
          ]}
        />
      </Section>
      <Section title="Rules it justifies" actions={<span className="small muted">{rules.length} rules, {shapes.length} meta-shapes</span>}>
        {rules.length ? <RuleTable rules={rules} showWhy={false} /> : <Empty>No enterprise rule cites this decision.</Empty>}
        {shapes.length > 0 && (
          <>
            <h3 className="sub-h">Meta-shapes</h3>
            <ul className="chips">
              {shapes.map((x) => (
                <li key={x} className="chip">
                  <Term id={x} />
                </li>
              ))}
            </ul>
          </>
        )}
      </Section>
    </>
  );
}

export function RuleTable({ rules, showWhy = true }: { rules: number[]; showWhy?: boolean }) {
  const { kg } = useData();
  return (
    <div className="scroll-x">
      <table>
        <thead>
          <tr>
            <th>Rule</th>
            <th>What it requires</th>
            <th>Enforced by</th>
            {showWhy && <th>Why</th>}
            <th>Defined in</th>
          </tr>
        </thead>
        <tbody>
          {rules.map((r) => (
            <tr key={r}>
              <td>
                <span className="mono small">{kg.text(r, kg.P("ent-gov:ruleCode"))}</span>{" "}
                <Term id={r} />
              </td>
              <td className="small">{kg.definition(r)}</td>
              <td className="small muted">{kg.text(r, kg.P("ent-gov:enforcedBy"))}</td>
              {showWhy && (
                <td>
                  <span className="link-list">
                    {kg.objects(r, kg.P("ent-gov:justifiedBy")).map((w) => (
                      <DecisionChip key={w} id={w} />
                    ))}
                    {!kg.objects(r, kg.P("ent-gov:justifiedBy")).length && <span className="muted small">standard only</span>}
                  </span>
                </td>
              )}
              <td>
                <DefinedInLinks s={r} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
