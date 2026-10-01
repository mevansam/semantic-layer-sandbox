// The knowledge graph exported by exporter/export_site_data.py (data/graph.json), indexed for browsing.
// Terms are numbers: a node id (IRI or blank node "_:...") or, for objects, a literal (negative id).

export interface GraphJson {
  nodes: string[];
  literals: [string, string | null, string | null][];
  files: string[];
  triples: [number, number, number, number][];
}

export interface Literal {
  value: string;
  lang: string | null;
  datatype: string | null;
}

export interface Edge {
  p: number;
  o: number; // >= 0 node, < 0 literal
  f: number; // file index
}

export interface InEdge {
  s: number;
  p: number;
  f: number;
}

export const NS = {
  rdf: "http://www.w3.org/1999/02/22-rdf-syntax-ns#",
  rdfs: "http://www.w3.org/2000/01/rdf-schema#",
  owl: "http://www.w3.org/2002/07/owl#",
  skos: "http://www.w3.org/2004/02/skos/core#",
  sh: "http://www.w3.org/ns/shacl#",
  dct: "http://purl.org/dc/terms/",
  dcat: "http://www.w3.org/ns/dcat#",
  xsd: "http://www.w3.org/2001/XMLSchema#",
};

export class KG {
  readonly nodes: string[];
  readonly literals: Literal[];
  readonly files: string[];
  readonly out: Edge[][];
  readonly inc: InEdge[][];
  private readonly ix = new Map<string, number>();
  private readonly prefixList: [string, string][];
  private labelCache = new Map<number, string>();

  constructor(json: GraphJson, prefixes: Record<string, string>) {
    this.nodes = json.nodes;
    this.literals = json.literals.map(([value, lang, datatype]) => ({ value, lang, datatype }));
    this.files = json.files;
    this.nodes.forEach((n, i) => this.ix.set(n, i));
    this.out = this.nodes.map(() => []);
    this.inc = this.nodes.map(() => []);
    const seen = new Set<string>();
    for (const [s, p, o, f] of json.triples) {
      // the same triple can come from more than one file (e.g. a label in a closure): keep the first
      const key = `${s} ${p} ${o}`;
      if (seen.has(key)) continue;
      seen.add(key);
      this.out[s].push({ p, o, f });
      if (o >= 0) this.inc[o].push({ s, p, f });
    }
    const all = { ...NS, ...prefixes };
    this.prefixList = Object.entries(all)
      .map(([k, v]) => [k, v] as [string, string])
      .sort((a, b) => b[1].length - a[1].length);
  }

  id(iri: string): number | undefined {
    return this.ix.get(iri);
  }

  iri(id: number): string {
    return this.nodes[id];
  }

  lit(o: number): Literal {
    return this.literals[-o - 1];
  }

  isBlank(id: number): boolean {
    return this.nodes[id]?.startsWith("_:");
  }

  P(curie: string): number {
    // predicate/term id for a CURIE or IRI (-1 when the graph never mentions it)
    const iri = this.expand(curie);
    return this.ix.get(iri) ?? -1;
  }

  expand(curie: string): string {
    if (/^https?:|^urn:/.test(curie)) return curie;
    const i = curie.indexOf(":");
    const ns = this.prefixList.find(([k]) => k === curie.slice(0, i));
    return ns ? ns[1] + curie.slice(i + 1) : curie;
  }

  curie(iri: string): string {
    for (const [k, ns] of this.prefixList) {
      if (iri.startsWith(ns) && iri.length > ns.length) {
        const local = iri.slice(ns.length);
        if (/^[\w.-]*$/.test(local)) return `${k}:${local}`;
      }
    }
    return iri;
  }

  localName(iri: string): string {
    const m = iri.match(/[#/]([^#/]+)\/?$/);
    if (!m) return iri;
    try {
      return decodeURIComponent(m[1]);
    } catch {
      return m[1];
    }
  }

  // ---- reading ---------------------------------------------------------------------------------

  objects(s: number, p: number): number[] {
    if (s < 0 || p < 0) return [];
    return this.out[s].filter((e) => e.p === p).map((e) => e.o);
  }

  object(s: number, p: number): number | undefined {
    return this.objects(s, p)[0];
  }

  subjects(p: number, o: number): number[] {
    if (o < 0 || p < 0) return [];
    return this.inc[o].filter((e) => e.p === p).map((e) => e.s);
  }

  has(s: number, p: number, o: number): boolean {
    return s >= 0 && this.out[s].some((e) => e.p === p && e.o === o);
  }

  /** literal value of s p, preferring English, or undefined */
  text(s: number, ...preds: number[]): string | undefined {
    for (const p of preds) {
      const lits = this.objects(s, p).filter((o) => o < 0).map((o) => this.lit(o));
      if (!lits.length) continue;
      const en = lits.find((l) => l.lang === "en") ?? lits.find((l) => !l.lang) ?? lits[0];
      return en.value;
    }
    return undefined;
  }

  texts(s: number, p: number): string[] {
    return this.objects(s, p).filter((o) => o < 0).map((o) => this.lit(o).value);
  }

  types(s: number): number[] {
    return this.objects(s, this.P("rdf:type"));
  }

  isA(s: number, type: string): boolean {
    const t = this.P(type);
    return t >= 0 && this.has(s, this.P("rdf:type"), t);
  }

  instances(type: string): number[] {
    const t = this.P(type);
    return t < 0 ? [] : this.subjects(this.P("rdf:type"), t);
  }

  label(s: number): string {
    const hit = this.labelCache.get(s);
    if (hit !== undefined) return hit;
    let l = this.text(s, this.P("skos:prefLabel"), this.P("rdfs:label"));
    if (!l) l = this.isBlank(s) ? "(anonymous)" : this.localName(this.nodes[s]);
    this.labelCache.set(s, l);
    return l;
  }

  definition(s: number): string | undefined {
    return this.text(
      s,
      this.P("skos:definition"),
      this.P("ent-av:ruleStatement"),
      this.P("dct:description"),
      this.P("dct:abstract"),
      this.P("rdfs:comment"),
    );
  }

  /** files where s is declared (has an rdf:type), else any file that says something about it */
  definingFiles(s: number): string[] {
    const t = this.P("rdf:type");
    const typed = [...new Set(this.out[s].filter((e) => e.p === t).map((e) => this.files[e.f]))];
    if (typed.length) return typed;
    return [...new Set(this.out[s].map((e) => this.files[e.f]))];
  }

  /** named ancestors through p (e.g. rdfs:subClassOf), nearest first, no cycles */
  ancestors(s: number, p: number): number[] {
    const res: number[] = [];
    const seen = new Set([s]);
    let frontier = [s];
    while (frontier.length) {
      const next: number[] = [];
      for (const x of frontier)
        for (const o of this.objects(x, p))
          if (o >= 0 && !this.isBlank(o) && !seen.has(o)) {
            seen.add(o);
            res.push(o);
            next.push(o);
          }
      frontier = next;
    }
    return res;
  }

  /** first parent chain (s, parent, grandparent, ...) through p */
  chain(s: number, p: number): number[] {
    const res = [s];
    const seen = new Set([s]);
    let cur: number | undefined = s;
    while (cur !== undefined) {
      const parent: number | undefined = this.objects(cur, p).find((o) => o >= 0 && !this.isBlank(o) && !seen.has(o));
      if (parent === undefined) break;
      res.push(parent);
      seen.add(parent);
      cur = parent;
    }
    return res;
  }

  /** an rdf:List starting at node -> its members */
  list(head: number): number[] | undefined {
    const first = this.P("rdf:first"), rest = this.P("rdf:rest"), nil = this.P("rdf:nil");
    const items: number[] = [];
    let cur = head;
    for (let guard = 0; guard < 1000; guard++) {
      if (cur === nil) return items;
      const f = this.object(cur, first);
      const r = this.object(cur, rest);
      if (f === undefined || r === undefined) return undefined;
      items.push(f);
      cur = r;
    }
    return undefined;
  }
}

export function formatLiteral(l: Literal): string {
  if (l.datatype?.endsWith("#duration")) {
    const m = l.value.match(/^P(?:(\d+)Y)?(?:(\d+)M)?(?:(\d+)D)?$/);
    if (m) {
      const parts = [m[1] && `${m[1]} year${m[1] === "1" ? "" : "s"}`, m[2] && `${m[2]} month${m[2] === "1" ? "" : "s"}`, m[3] && `${m[3]} days`].filter(Boolean);
      if (parts.length) return `${parts.join(" ")} (${l.value})`;
    }
  }
  return l.value;
}

export function capitalize(s: string): string {
  return s ? s[0].toUpperCase() + s.slice(1) : s;
}
