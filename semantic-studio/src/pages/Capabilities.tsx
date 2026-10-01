import { useCallback, useMemo } from "react";
import { Tree } from "../components/Tree";
import { Pill, Section, Term } from "../components/ui";
import { useData } from "../data";
import { capitalize } from "../kg";
import { byLabel, narrower, repoForRegistryEntry, roots, schemeMembers } from "../model";
import { href } from "../router";

// Ontology domain -> business domain -> capability hierarchy (skos:broader), with what realises each.
export function CapabilitiesPage({ focus }: { focus: string | null }) {
  const d = useData();
  const { kg } = d;
  const model = useMemo(() => {
    const caps = new Set(schemeMembers(kg, "CapabilityMap"));
    const kids = narrower(kg, caps);
    const capRoots = roots(kg, caps);
    const acc = kg.P("ent-gov:accountableDomain");
    const inOD = kg.P("ent-gov:inOntologyDomain");
    const ods = kg.instances("ent-gov:OntologyDomain").sort(byLabel(kg));
    const bds = kg.instances("ent-gov:BusinessDomain").sort(byLabel(kg));
    const childMap = new Map<number, number[]>();
    for (const od of ods) childMap.set(od, bds.filter((b) => kg.has(b, inOD, od)));
    for (const bd of bds) childMap.set(bd, capRoots.filter((c) => kg.has(c, acc, bd)));
    for (const [k, v] of kids) childMap.set(k, v);
    const unplacedBds = bds.filter((b) => !kg.objects(b, inOD).length);
    const orphanCaps = capRoots.filter((c) => !kg.objects(c, acc).some((b) => bds.includes(b)));
    return { caps, ods, childMap, unplacedBds, orphanCaps };
  }, [kg]);

  const realisers = [kg.P("ent-gov:realizesCapability"), kg.P("ent-av:realizesCapability"), kg.P("ent-gov:participatesInCapability")];
  const childrenOf = useCallback((id: number) => model.childMap.get(id) ?? [], [model]);
  const text = useCallback((id: number) => kg.label(id), [kg]);
  const focusId = focus ? kg.id(focus) : undefined;
  const proposed = [...model.caps].filter((c) => kg.text(c, kg.P("ent-gov:capabilityStatus")) === "Proposed");
  const rootsList = [...model.ods, ...model.unplacedBds, ...model.orphanCaps];

  return (
    <div className="stack">
      <header>
        <h1>Capability map</h1>
        <p className="lead">
          What the business does, grouped into ontology domains and business domains. Each capability is accountable to one business domain;
          sub-domains say which capabilities they realise.
        </p>
      </header>
      {proposed.length > 0 && (
        <div className="notice">
          <strong>{proposed.length} proposed capabilities</strong> are awaiting review (ADR-0004):{" "}
          {proposed.map((c, i) => (
            <span key={c}>
              {i > 0 && ", "}
              <Term id={c} />
            </span>
          ))}
        </div>
      )}
      <Section>
        <Tree
          label="capabilities"
          roots={rootsList}
          childrenOf={childrenOf}
          text={text}
          focus={focusId}
          render={(id) => {
            const isOD = kg.isA(id, "ent-gov:OntologyDomain");
            const isBD = kg.isA(id, "ent-gov:BusinessDomain");
            const status = kg.text(id, kg.P("ent-gov:capabilityStatus"));
            const by = [...new Set(realisers.flatMap((p) => kg.subjects(p, id)))];
            const repo = isBD ? repoForRegistryEntry(d, id) : undefined;
            return (
              <span className="tree-item">
                <a href={href.resource(kg.iri(id))} className={isOD ? "strong" : ""}>
                  {capitalize(kg.label(id))}
                </a>
                {isOD && <span className="kind">Ontology domain</span>}
                {isBD && <span className="kind">Business domain</span>}
                {status === "Proposed" && <Pill tone="warn">Proposed</Pill>}
                {repo && (
                  <a href={href.domain(repo.id)}>
                    <Pill tone="accent">Modelled</Pill>
                  </a>
                )}
                {by.length > 0 && (
                  <span className="realised">
                    realised by{" "}
                    {by.map((b, i) => (
                      <span key={b}>
                        {i > 0 && ", "}
                        <Term id={b} />
                      </span>
                    ))}
                  </span>
                )}
              </span>
            );
          }}
        />
      </Section>
    </div>
  );
}
