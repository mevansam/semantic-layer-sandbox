// Interactive graphs (Cytoscape.js, loaded on demand): how ontologies import each other, and the
// neighbourhood of any term.
import type { Core, ElementDefinition } from "cytoscape";
import { useEffect, useMemo, useRef, useState } from "react";
import { Icon, KV, Pill, Section, Term } from "../components/ui";
import { Data, useData } from "../data";
import { capitalize } from "../kg";
import { isExternal, kindOf, REPO_KIND_LABEL, repoOfNode } from "../model";
import { repoHealthSummary } from "./Health";
import { go, href } from "../router";

const LAYER_COLOR: Record<string, { bg: string; border: string; text: string }> = {
  governance: { bg: "#E6ECF2", border: "#4D6A85", text: "#15191E" },
  "fibo-extensions": { bg: "#E8EEE6", border: "#4F6E48", text: "#15191E" },
  "business-domain": { bg: "#DCE8F3", border: "#1D5C8C", text: "#15191E" },
  domain: { bg: "#FFFFFF", border: "#1D5C8C", text: "#15191E" },
  fibo: { bg: "#ECEEEA", border: "#8A918A", text: "#2B3238" },
  other: { bg: "#F3F4F1", border: "#B5BAB3", text: "#4A525B" },
};

const LAYER_LABEL: Record<string, string> = {
  governance: "Enterprise governance",
  "fibo-extensions": "FIBO extensions",
  "business-domain": "Business domain",
  domain: "Sub-domain",
  fibo: "FIBO profile module",
  other: "Other FIBO / OMG",
};

function layerOf(d: Data, s: number): string {
  const iri = d.kg.iri(s);
  if (isExternal(iri)) return d.meta.fibo.modules.some((m) => m.iri === iri) ? "fibo" : "other";
  return repoOfNode(d, s)?.kind ?? "other";
}

function importsElements(d: Data, opts: { governance: boolean; fiboInternal: boolean }): ElementDefinition[] {
  const { kg } = d;
  const imp = kg.P("owl:imports");
  const onts = kg.instances("owl:Ontology").filter((o) => !kg.isBlank(o));
  const keep = new Set(onts.filter((o) => opts.governance || layerOf(d, o) !== "governance"));
  const els: ElementDefinition[] = [];
  const nodes = new Set<number>();
  let other = 0;
  const otherTargets = new Set<number>();
  for (const o of keep) {
    const layer = layerOf(d, o);
    for (const t of kg.objects(o, imp)) {
      if (layer === "fibo" && !opts.fiboInternal && !keep.has(t)) continue;
      if (keep.has(t)) {
        nodes.add(o);
        nodes.add(t);
        els.push({ data: { id: `e${o}-${t}`, source: String(o), target: String(t), kind: "imports" } });
      } else if (layer !== "fibo" || opts.fiboInternal) {
        nodes.add(o);
        otherTargets.add(t);
        if (!els.some((e) => e.data.id === `o${o}`)) {
          els.push({ data: { id: `o${o}`, source: String(o), target: "other", kind: "imports-other" } });
        }
        other++;
      }
    }
  }
  // the profile modules always show, imported or not
  for (const m of d.meta.fibo.modules) {
    const id = kg.id(m.iri);
    if (id !== undefined) nodes.add(id);
  }
  for (const n of nodes) {
    els.push({ data: { id: String(n), label: wrap(capitalize(kg.label(n))), layer: layerOf(d, n), iri: kg.iri(n) } });
  }
  if (other) els.push({ data: { id: "other", label: wrap(`Other FIBO / OMG modules (${otherTargets.size})`), layer: "other" } });
  return els;
}

/** Ontologies grouped by the repository that owns them; FIBO modules on their own. Positions are laid out
 * in rows: business domains, sub-domains, enterprise repositories, FIBO profile modules, everything else. */
function repositoryElements(d: Data, opts: { governance: boolean }): ElementDefinition[] {
  const { kg } = d;
  const imp = kg.P("owl:imports");
  const groupOf = (o: number): string => {
    const iri = kg.iri(o);
    if (isExternal(iri)) return d.meta.fibo.modules.some((m) => m.iri === iri) ? `m:${iri}` : "other";
    return `r:${repoOfNode(d, o)?.id ?? "other"}`;
  };
  const counts = new Map<string, number>();
  const groups = new Set<string>();
  for (const o of kg.instances("owl:Ontology")) {
    if (kg.isBlank(o)) continue;
    const a = groupOf(o);
    if (isExternal(kg.iri(o))) continue; // FIBO's own imports are not shown in this view
    for (const t of kg.objects(o, imp)) {
      const b = groupOf(t);
      if (a === b) continue;
      const key = `${a}|${b}`;
      counts.set(key, (counts.get(key) ?? 0) + 1);
      groups.add(a);
      groups.add(b);
    }
  }
  for (const m of d.meta.fibo.modules) groups.add(`m:${m.iri}`);
  for (const r of d.meta.repos) if (r.kind !== "governance") groups.add(`r:${r.id}`);
  if (!opts.governance) for (const g of [...groups]) if (d.repo(g.slice(2))?.kind === "governance") groups.delete(g);
  const row = (g: string): number => {
    if (g === "other") return 5;
    if (g.startsWith("m:")) return 3;
    const kind = d.repo(g.slice(2))?.kind;
    return kind === "business-domain" ? 0 : kind === "domain" ? 1 : 2;
  };
  const rows = new Map<number, string[]>();
  for (const g of groups) rows.set(row(g), [...(rows.get(row(g)) ?? []), g]);
  const pos = new Map<string, { x: number; y: number }>();
  const W = 200, H = 120, PER = 4;
  let y = 0;
  for (const r of [0, 1, 2, 3, 5]) {
    const list = (rows.get(r) ?? []).sort();
    for (let i = 0; i < list.length; i += r === 3 ? PER : list.length || 1) {
      const chunk = list.slice(i, i + (r === 3 ? PER : list.length));
      chunk.forEach((g, j) => pos.set(g, { x: (j - (chunk.length - 1) / 2) * W, y }));
      y += r === 3 ? 90 : H;
    }
    if (r === 3) y += 30;
  }
  const label = (g: string) => {
    if (g === "other") return "Other FIBO / OMG modules";
    if (g.startsWith("m:")) return capitalize(kg.label(kg.id(g.slice(2))!));
    return d.repo(g.slice(2))?.name ?? g;
  };
  const layer = (g: string) => (g === "other" ? "other" : g.startsWith("m:") ? "fibo" : d.repo(g.slice(2))?.kind ?? "other");
  const target = (g: string) => (g.startsWith("m:") ? g.slice(2) : undefined);
  const els: ElementDefinition[] = [...groups].map((g) => ({
    data: { id: g, label: wrap(label(g)), layer: layer(g), iri: target(g), repo: g.startsWith("r:") ? g.slice(2) : undefined },
    position: pos.get(g),
  }));
  for (const [key, n] of counts) {
    const [a, b] = key.split("|");
    if (!groups.has(a) || !groups.has(b)) continue;
    els.push({ data: { id: key, source: a, target: b, kind: d.repo(a.slice(2))?.kind === "domain" && d.repo(b.slice(2))?.kind === "domain" ? "depends" : "imports", weight: n } });
  }
  return els;
}

function neighbourhoodElements(d: Data, focus: number, depth: number): ElementDefinition[] {
  const { kg } = d;
  const skip = new Set(["rdf:type", "skos:inScheme", "rdfs:isDefinedBy", "fibo-fnd-utl-av:hasMaturityLevel"].map((c) => kg.P(c)));
  const nodes = new Set([focus]);
  const dist = new Map([[focus, 0]]);
  const edges = new Map<string, ElementDefinition>();
  let frontier = [focus];
  for (let i = 0; i < depth; i++) {
    const next: number[] = [];
    for (const s of frontier) {
      const add = (a: number, p: number, b: number) => {
        if (kg.isBlank(a) || kg.isBlank(b) || skip.has(p) || nodes.size > 90) return;
        const id = `${a}-${p}-${b}`;
        if (!edges.has(id)) edges.set(id, { data: { id, source: String(a), target: String(b), label: kg.label(p), kind: "rel" } });
        for (const x of [a, b]) if (!nodes.has(x)) { nodes.add(x); dist.set(x, i + 1); next.push(x); }
      };
      for (const e of kg.out[s]) if (e.o >= 0) add(s, e.p, e.o);
      for (const e of kg.inc[s]) add(e.s, e.p, s);
    }
    frontier = next;
  }
  const els: ElementDefinition[] = [...nodes].map((n) => ({
    data: { id: String(n), label: wrap(capitalize(kg.label(n))), layer: layerOf(d, n), iri: kg.iri(n), focus: n === focus ? 1 : 0, ring: depth - (dist.get(n) ?? depth) },
  }));
  return [...els, ...edges.values()];
}

function wrap(s: string, width = 22): string {
  const words = s.split(/\s+/);
  const lines: string[] = [];
  let cur = "";
  for (const w of words) {
    if ((cur + " " + w).trim().length > width && cur) {
      lines.push(cur);
      cur = w;
    } else cur = (cur + " " + w).trim();
  }
  if (cur) lines.push(cur);
  return lines.slice(0, 3).join("\n");
}

export function GraphPage({ mode, focus }: { mode: string; focus: string | null }) {
  const d = useData();
  const { kg } = d;
  const host = useRef<HTMLDivElement>(null);
  const cy = useRef<Core | null>(null);
  const [selected, setSelected] = useState<number | null>(null);
  const [selectedRepo, setSelectedRepo] = useState<string | null>(null);
  const [governance, setGovernance] = useState(false);
  const [fiboInternal, setFiboInternal] = useState(false);
  const [byOntology, setByOntology] = useState(false);
  const [depth, setDepth] = useState(1);
  const [loadError, setLoadError] = useState<string | null>(null);
  const focusId = focus ? kg.id(focus) : undefined;
  const isNeighbourhood = mode === "neighbourhood" && focusId !== undefined;

  const elements = useMemo(
    () =>
      isNeighbourhood
        ? neighbourhoodElements(d, focusId!, depth)
        : byOntology
          ? importsElements(d, { governance, fiboInternal })
          : repositoryElements(d, { governance }),
    [d, isNeighbourhood, focusId, depth, governance, fiboInternal, byOntology],
  );

  useEffect(() => {
    let disposed = false;
    import("cytoscape")
      .then(({ default: cytoscape }) => {
        if (disposed || !host.current) return;
        cy.current?.destroy();
        const c = cytoscape({
          container: host.current,
          elements,
          style: [
            {
              selector: "node",
              style: {
                shape: "round-rectangle",
                width: 170,
                height: 54,
                "background-color": (n: { data: (k: string) => string }) => LAYER_COLOR[n.data("layer")]?.bg ?? "#fff",
                "border-width": 1.5,
                "border-color": (n: { data: (k: string) => string }) => LAYER_COLOR[n.data("layer")]?.border ?? "#999",
                label: "data(label)",
                "text-wrap": "wrap",
                "text-max-width": "160px",
                "text-valign": "center",
                "font-size": 12,
                "font-family": "IBM Plex Sans, system-ui, sans-serif",
                color: (n: { data: (k: string) => string }) => LAYER_COLOR[n.data("layer")]?.text ?? "#15191E",
              },
            },
            { selector: "node[focus = 1]", style: { "border-width": 3, "border-color": "#1D5C8C", "background-color": "#DCE8F3" } },
            { selector: "node:selected", style: { "border-width": 3, "border-color": "#9A5A05" } },
            {
              selector: "edge",
              style: {
                width: 1.4,
                "line-color": "#8A918A",
                "target-arrow-color": "#8A918A",
                "target-arrow-shape": "triangle",
                "curve-style": "bezier",
                "arrow-scale": 0.9,
              },
            },
            { selector: "edge[kind = 'imports-other']", style: { "line-style": "dashed" } },
            { selector: "edge[kind = 'depends']", style: { "line-color": "#1D5C8C", "target-arrow-color": "#1D5C8C", width: 2.5 } },
            {
              selector: "edge[label]",
              style: { label: "data(label)", "font-size": 10, color: "#4A525B", "text-rotation": "autorotate", "text-background-color": "#F8F9F6", "text-background-opacity": 1, "text-background-padding": "2px" },
            },
          ],
          layout: isNeighbourhood
            ? { name: "concentric", concentric: (n: { data: (k: string) => number }) => n.data("ring"), levelWidth: () => 1, minNodeSpacing: 36, padding: 30, animate: false }
            : byOntology
              ? { name: "cose", animate: false, nodeRepulsion: () => 12000, idealEdgeLength: () => 150, padding: 30 }
              : { name: "preset", padding: 30 },
        });
        c.on("tap", "node", (e) => {
          const repo = e.target.data("repo");
          if (repo) {
            setSelected(null);
            setSelectedRepo(repo);
            return;
          }
          const iri = e.target.data("iri");
          const id = iri ? kg.id(iri) : Number(e.target.id());
          setSelectedRepo(null);
          setSelected(id === undefined || Number.isNaN(id) ? null : id);
        });
        c.on("tap", (e) => {
          if (e.target === c) {
            setSelected(null);
            setSelectedRepo(null);
          }
        });
        c.on("dbltap", "node", (e) => {
          const iri = e.target.data("iri");
          const repo = e.target.data("repo");
          if (iri) go(href.graph("neighbourhood", iri));
          else if (repo) go(href.domain(repo));
        });
        cy.current = c;
      })
      .catch((e) => setLoadError(String(e)));
    return () => {
      disposed = true;
    };
  }, [elements, isNeighbourhood, byOntology]);

  useEffect(() => () => cy.current?.destroy(), []);
  useEffect(() => setSelected(isNeighbourhood ? focusId! : null), [isNeighbourhood, focusId]);

  const layers = [...new Set(elements.filter((e) => e.data.layer).map((e) => e.data.layer as string))];

  return (
    <div className="stack">
      <header className="between top">
        <div>
          <h1>Graph</h1>
          <p className="lead">
            {isNeighbourhood ? (
              <>
                Everything directly connected to <Term id={focusId!} />. Double-click a node to move to it.
              </>
            ) : (
              <>How domains build on each other and on FIBO: an arrow from A to B means A imports ontologies of B. Blue arrows are dependencies between sub-domains. Double-click to open.</>
            )}
          </p>
        </div>
        <div className="row actions" role="group" aria-label="Graph view">
          <a className={`btn${!isNeighbourhood ? " primary" : ""}`} href={href.graph("imports")}>Imports</a>
          <a className={`btn${isNeighbourhood ? " primary" : ""}`} href={href.graph("neighbourhood", focus ?? kg.iri(selected ?? kg.id(d.meta.base_iri + "fibo-ext/core/") ?? 0))}>
            Neighbourhood
          </a>
        </div>
      </header>
      <div className="graph-layout">
        <Section className="graph-card">
          <div className="row graph-tools">
            {isNeighbourhood ? (
              <label className="row small">
                Depth
                <select value={depth} onChange={(e) => setDepth(Number(e.target.value))}>
                  <option value={1}>1 step</option>
                  <option value={2}>2 steps</option>
                </select>
              </label>
            ) : (
              <>
                <label className="row small">
                  <input type="checkbox" checked={byOntology} onChange={(e) => setByOntology(e.target.checked)} /> Each ontology separately
                </label>
                <label className="row small">
                  <input type="checkbox" checked={governance} onChange={(e) => setGovernance(e.target.checked)} /> Governance ontologies
                </label>
                {byOntology && (
                  <label className="row small">
                    <input type="checkbox" checked={fiboInternal} onChange={(e) => setFiboInternal(e.target.checked)} /> FIBO&rsquo;s own imports
                  </label>
                )}
              </>
            )}
            <button type="button" className="btn" onClick={() => cy.current?.fit(undefined, 30)}>Fit</button>
            <span className="legend small">
              {layers.map((l) => (
                <span key={l} className="row">
                  <span className="swatch" style={{ background: LAYER_COLOR[l]?.bg, borderColor: LAYER_COLOR[l]?.border }} />
                  {LAYER_LABEL[l] ?? l}
                </span>
              ))}
            </span>
          </div>
          {loadError ? <p className="empty">Could not load the graph library: {loadError}</p> : <div ref={host} className="graph-host" role="img" aria-label="Graph of ontologies and their relationships" />}
          <p className="small muted">{elements.filter((e) => !e.data.source).length} nodes, {elements.filter((e) => e.data.source).length} edges. Scroll to zoom, drag to pan.</p>
        </Section>
        {selectedRepo ? <RepoInspector id={selectedRepo} /> : <Inspector id={selected} />}
      </div>
    </div>
  );
}

function RepoInspector({ id }: { id: string }) {
  const d = useData();
  const repo = d.repo(id);
  if (!repo) return null;
  const h = repoHealthSummary(d, repo);
  const users = d.meta.repos.filter((r) => r.dependencies.includes(repo.id));
  return (
    <aside className="card inspector" aria-live="polite">
      <div className="between">
        <h2>{repo.name}</h2>
        <span className={`pill ${h.tone}`}>{h.label}</span>
      </div>
      <KV
        rows={[
          ["Kind", REPO_KIND_LABEL[repo.kind]],
          ["Prefix", repo.prefix ? <span className="mono">{repo.prefix}:</span> : null],
          ["Builds on", repo.dependencies.map((x) => d.repo(x)?.name).join(", ") || null],
          ["Used by", users.map((r) => r.name).join(", ") || null],
          ["Agent cards", d.cards[repo.id]?.cards.length ?? null],
        ]}
      />
      <div className="row">
        <a className="btn primary" href={href.domain(repo.id)}>Open</a>
      </div>
    </aside>
  );
}

function Inspector({ id }: { id: number | null }) {
  const d = useData();
  const { kg } = d;
  if (id === null) {
    return (
      <aside className="card inspector">
        <h2>Details</h2>
        <p className="small muted">Select a node to see what it is.</p>
      </aside>
    );
  }
  const repo = repoOfNode(d, id);
  return (
    <aside className="card inspector" aria-live="polite">
      <div className="between">
        <h2>{capitalize(kg.label(id))}</h2>
        <Pill tone="info">{kindOf(kg, id).label}</Pill>
      </div>
      {kg.definition(id) && <p className="small">{kg.definition(id)}</p>}
      <KV
        rows={[
          ["Owned by", repo ? <a href={href.domain(repo.id)}>{repo.name}</a> : isExternal(kg.iri(id)) ? "FIBO / OMG" : null],
          ["Version", kg.text(id, kg.P("owl:versionInfo"))],
          ["Imports", kg.objects(id, kg.P("owl:imports")).length || null],
          ["Imported by", kg.subjects(kg.P("owl:imports"), id).length || null],
          ["Connections", kg.out[id].length + kg.inc[id].length],
        ]}
      />
      <div className="row">
        <a className="btn primary" href={href.resource(kg.iri(id))}>Open</a>
        <a className="btn" href={href.graph("neighbourhood", kg.iri(id))}>
          <Icon name="graph" size={16} /> Neighbourhood
        </a>
      </div>
    </aside>
  );
}
