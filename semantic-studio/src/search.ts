// A small in-memory search over terms, documents, domains and files (no dependencies).
import { Data } from "./data";
import { capitalize } from "./kg";
import { kindOf, repoOfNode } from "./model";
import { href } from "./router";

export interface Hit {
  title: string;
  kind: string;
  detail: string;
  url: string;
  score: number;
}

interface Entry {
  title: string;
  kind: string;
  detail: string;
  url: string;
  words: string; // lower-cased searchable text: title first
  extra: string; // lower-cased secondary text (definitions, CURIEs, body)
  boost: number;
}

const norm = (s: string) => s.toLowerCase().normalize("NFKD").replace(/[̀-ͯ]/g, "");

export function buildIndex(d: Data): Entry[] {
  const { kg } = d;
  const entries: Entry[] = [];
  const rdfType = kg.P("rdf:type");
  kg.nodes.forEach((iri, s) => {
    if (kg.isBlank(s)) return;
    const typed = kg.out[s].some((e) => e.p === rdfType);
    if (!typed) return;
    const kind = kindOf(kg, s);
    const label = capitalize(kg.label(s));
    const repo = repoOfNode(d, s);
    const curie = kg.curie(iri);
    const def = kg.definition(s) ?? "";
    const notation = kg.text(s, kg.P("skos:notation"), kg.P("ent-av:ruleIdentifier")) ?? "";
    const boost =
      { class: 3, property: 2, rule: 3, api: 3, tool: 3, data: 2, record: 2, process: 2, domain: 2, capability: 1, taxonomy: 1, ontology: 2 }[kind.key] ?? 1;
    entries.push({
      title: label,
      kind: kind.label,
      detail: [repo?.name ?? (iri.includes("edmcouncil") ? "FIBO" : ""), notation].filter(Boolean).join(" · "),
      url: href.resource(iri),
      words: norm(`${label} ${notation}`),
      extra: norm(`${curie} ${def}`),
      boost,
    });
  });
  for (const doc of d.docs) {
    const heads = [...doc.text.matchAll(/^#{1,3}\s+(.+)$/gm)].map((m) => m[1]).join(" ");
    entries.push({
      title: doc.title,
      kind: doc.group === "adr" ? "Decision (ADR)" : "Document",
      detail: doc.path,
      url: href.doc(doc.path),
      words: norm(doc.title),
      extra: norm(`${doc.path} ${heads} ${doc.text.slice(0, 4000)}`),
      boost: 2,
    });
  }
  for (const r of d.meta.repos) {
    entries.push({ title: r.name, kind: "Repository", detail: r.id, url: href.domain(r.id), words: norm(`${r.name} ${r.code ?? ""} ${r.prefix ?? ""}`), extra: norm(r.id), boost: 4 });
    for (const f of r.files) {
      entries.push({ title: f.path.split("/").pop()!, kind: "File", detail: f.path, url: href.source(f.path), words: norm(f.path.split("/").pop()!), extra: norm(f.path), boost: 0 });
    }
  }
  return entries;
}

export function search(index: Entry[], query: string, limit = 30): Hit[] {
  const q = norm(query.trim());
  if (!q) return [];
  const terms = q.split(/\s+/).filter(Boolean);
  const hits: Hit[] = [];
  for (const e of index) {
    let score = 0;
    let all = true;
    for (const t of terms) {
      const iw = e.words.indexOf(t);
      if (iw === 0) score += 10;
      else if (iw > 0) score += e.words[iw - 1] === " " || e.words[iw - 1] === "-" ? 7 : 4;
      else if (e.extra.includes(t)) score += 1.5;
      else {
        all = false;
        break;
      }
    }
    if (!all) continue;
    if (e.words === q) score += 15;
    score += e.boost * 0.8;
    hits.push({ title: e.title, kind: e.kind, detail: e.detail, url: e.url, score });
  }
  hits.sort((a, b) => b.score - a.score || a.title.localeCompare(b.title));
  return hits.slice(0, limit);
}
