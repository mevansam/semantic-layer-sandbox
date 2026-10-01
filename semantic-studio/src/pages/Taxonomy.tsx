import { useCallback, useMemo } from "react";
import { Tree } from "../components/Tree";
import { Section } from "../components/ui";
import { useData } from "../data";
import { capitalize } from "../kg";
import { narrower, roots, schemeMembers } from "../model";
import { href } from "../router";

// The enterprise taxonomy (SKOS), with how many terms each subject area governs or anchors.
export function TaxonomyPage({ focus }: { focus: string | null }) {
  const { kg } = useData();
  const { members, kids, top } = useMemo(() => {
    const members = new Set(schemeMembers(kg, "EnterpriseTaxonomy"));
    return { members, kids: narrower(kg, members), top: roots(kg, members) };
  }, [kg]);
  const links = [kg.P("ent-av:governedBy"), kg.P("ent-gov:anchoredTo")];
  const childrenOf = useCallback((id: number) => kids.get(id) ?? [], [kids]);
  const text = useCallback((id: number) => `${kg.label(id)} ${kg.text(id, kg.P("skos:definition")) ?? ""}`, [kg]);
  const focusId = focus ? kg.id(focus) : undefined;
  const used = [...members].filter((m) => links.some((p) => kg.subjects(p, m).length)).length;
  return (
    <div className="stack">
      <header>
        <h1>Taxonomy</h1>
        <p className="lead">
          The enterprise&rsquo;s business subject areas ({members.size} concepts). Every class, rule, API and data product names the subject area that
          governs it; {used} subject areas are used so far.
        </p>
      </header>
      <Section>
        <Tree
          label="taxonomy"
          roots={top}
          childrenOf={childrenOf}
          text={text}
          focus={focusId}
          render={(id) => {
            const n = new Set(links.flatMap((p) => kg.subjects(p, id))).size;
            return (
              <span className="tree-item">
                <a href={href.resource(kg.iri(id))}>{capitalize(kg.label(id))}</a>
                {n > 0 && (
                  <span className="pill accent" title="Terms governed by or anchored to this subject area">
                    {n} governed
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
