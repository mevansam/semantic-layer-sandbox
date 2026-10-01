import { Icon, Pill, Section, Term } from "../components/ui";
import { useData } from "../data";
import { byLabel, isExternal, isFibo } from "../model";
import { href } from "../router";

// The FIBO modules in the enterprise profile, and which enterprise terms build on each.
export function FiboPage() {
  const d = useData();
  const { kg, meta } = d;
  const rdfType = kg.P("rdf:type");
  const cls = kg.P("owl:Class");
  const objP = kg.P("owl:ObjectProperty"), dtP = kg.P("owl:DatatypeProperty");
  const sub = [kg.P("rdfs:subClassOf"), kg.P("rdfs:subPropertyOf")];
  const enterprise = (s: number) => !kg.isBlank(s) && !isExternal(kg.iri(s));

  const modules = meta.fibo.modules.map((m) => {
    const node = kg.id(m.iri);
    const declared = m.file
      ? kg.nodes.map((_, i) => i).filter((i) => !kg.isBlank(i) && kg.out[i].some((e) => e.p === rdfType && kg.files[e.f] === m.file && (e.o === cls || e.o === objP || e.o === dtP)))
      : [];
    const declaredSet = new Set(declared);
    const builtOn = new Set<number>();
    for (const t of declared) for (const p of sub) for (const s of kg.subjects(p, t)) if (enterprise(s)) builtOn.add(s);
    return {
      ...m,
      node,
      classes: declared.filter((i) => kg.has(i, rdfType, cls)).length,
      props: declared.filter((i) => !kg.has(i, rdfType, cls)).length,
      builtOn: [...builtOn].sort(byLabel(kg)),
      declaredSet,
      area: m.iri.match(/ontology\/(\w+)\//)?.[1] ?? "",
    };
  });

  // every external term an enterprise file mentions
  const used = new Set<number>();
  kg.nodes.forEach((iri, s) => {
    if (!enterprise(s)) return;
    for (const e of kg.out[s]) if (e.o >= 0 && !kg.isBlank(e.o) && isFibo(kg.iri(e.o)) && e.p !== kg.P("owl:imports") && e.p !== kg.P("fibo-fnd-utl-av:hasMaturityLevel")) used.add(e.o);
  });
  const moduleOf = (t: number) => modules.find((m) => m.declaredSet.has(t));
  const usedList = [...used].sort(byLabel(kg));
  const outside = usedList.filter((t) => !moduleOf(t));

  return (
    <div className="stack">
      <header className="between top">
        <div>
          <h1>FIBO {meta.fibo.release_tag}</h1>
          <p className="lead">
            The Financial Industry Business Ontology is the upper ontology every domain builds on. Domains may import only the modules in the enterprise
            profile (rule E3); FIBO itself is read-only (rule E1).
          </p>
          <p className="small muted">
            Pinned commit <span className="mono">{meta.fibo.pin?.slice(0, 12) ?? "unknown"}</span>
            {!meta.fibo.available && " - the FIBO checkout was not available when this site was built (run make fibo), so module contents are missing."}
          </p>
        </div>
        <div className="row actions">
          <a className="btn" href={`${meta.fibo.repository}/tree/${meta.fibo.release_tag}`} target="_blank" rel="noopener noreferrer">
            <Icon name="ext" size={16} /> FIBO repository
          </a>
          <a className="btn" href={href.resource(meta.base_iri + "fibo-ext/profile/")}>Enterprise profile</a>
        </div>
      </header>
      <Section title="Modules in the enterprise profile" actions={<span className="small muted">{modules.length} modules</span>}>
        <div className="scroll-x">
          <table>
            <thead>
              <tr>
                <th>Module</th>
                <th>Area</th>
                <th className="num">Classes</th>
                <th className="num">Properties</th>
                <th>Enterprise terms built on it</th>
                <th>Source</th>
              </tr>
            </thead>
            <tbody>
              {modules.map((m) => (
                <tr key={m.iri}>
                  <td>{m.node !== undefined ? <Term id={m.node} /> : <span className="mono small">{m.iri}</span>}</td>
                  <td>
                    <Pill tone="mute">{m.area}</Pill>
                  </td>
                  <td className="num">{m.available ? m.classes : "-"}</td>
                  <td className="num">{m.available ? m.props : "-"}</td>
                  <td>
                    {m.builtOn.length ? (
                      <ul className="chips">
                        {m.builtOn.map((x) => (
                          <li key={x} className="chip">
                            <Term id={x} />
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <span className="muted small">not yet</span>
                    )}
                  </td>
                  <td>
                    {m.url ? (
                      <a className="small" href={m.url} target="_blank" rel="noopener noreferrer">
                        GitHub <Icon name="ext" size={12} />
                      </a>
                    ) : (
                      <span className="muted small">not checked out</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Section>
      <Section title="FIBO terms the enterprise uses" actions={<span className="small muted">{usedList.length} terms</span>}>
        <table>
          <thead>
            <tr>
              <th>Term</th>
              <th>Module</th>
              <th className="num">Used by</th>
            </tr>
          </thead>
          <tbody>
            {usedList.map((t) => {
              const m = moduleOf(t);
              const users = new Set(kg.inc[t].filter((e) => enterprise(e.s)).map((e) => e.s)).size;
              return (
                <tr key={t}>
                  <td>
                    <Term id={t} />
                  </td>
                  <td>{m?.node !== undefined ? <Term id={m.node} /> : <span className="muted small">imported by a profile module</span>}</td>
                  <td className="num">{users}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {outside.length > 0 && (
          <p className="small muted">
            {outside.length} of these are defined in FIBO modules that the profile modules import, not in the profile modules themselves.
          </p>
        )}
      </Section>
    </div>
  );
}
