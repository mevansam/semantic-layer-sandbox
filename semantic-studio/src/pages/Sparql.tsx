// SPARQL over the exported knowledge graph, through the studio server's read-only /sparql endpoint.
import { useEffect, useMemo, useRef, useState } from "react";
import { Empty, Icon, Section } from "../components/ui";
import { useData } from "../data";
import { href } from "../router";
import { applyBindings } from "./Domains";

interface Binding {
  type: "uri" | "literal" | "bnode" | "typed-literal";
  value: string;
  "xml:lang"?: string;
  datatype?: string;
}

type Result =
  | { kind: "select"; vars: string[]; rows: Record<string, Binding>[]; truncated: boolean; ms: number }
  | { kind: "ask"; value: boolean; ms: number }
  | { kind: "graph"; text: string; ms: number };

const EXAMPLES: { title: string; query: string }[] = [
  {
    title: "Classes of every sub-domain and their parents",
    query: `SELECT ?class ?label ?parent WHERE {
  ?class a owl:Class ;
         rdfs:label ?label ;
         rdfs:subClassOf ?parent .
  FILTER(STRSTARTS(STR(?class), "https://ontology.example.com/domain/"))
  FILTER(isIRI(?parent))
}
ORDER BY ?class`,
  },
  {
    title: "Business rules, what they apply to and who owns them",
    query: `SELECT ?ruleId ?statement ?target ?owner WHERE {
  ?rule a ent-gov:BusinessRule ;
        ent-av:ruleIdentifier ?ruleId ;
        ent-av:ruleStatement ?statement ;
        sh:targetClass ?target ;
        ent-gov:hasRuleOwner/ent-gov:heldBy ?owner .
}
ORDER BY ?ruleId`,
  },
  {
    title: "What serves each concept (APIs and data products)",
    query: `SELECT ?concept ?server ?serverType WHERE {
  ?server ent-gov:servesConcept ?concept ;
          a ?serverType .
  FILTER(?serverType IN (ent-gov:DomainApi, dcat:Dataset))
}
ORDER BY ?concept`,
  },
  {
    title: "Capabilities realised by modelled sub-domains",
    query: `SELECT ?subDomain ?capability ?path WHERE {
  ?manifest a ent-gov:DomainManifest ;
            rdfs:label ?subDomain ;
            ent-gov:realizesCapability ?cap .
  ?cap skos:prefLabel ?capability ;
       skos:notation ?path .
}`,
  },
  {
    title: "Number of terms by type",
    query: `SELECT ?type (COUNT(DISTINCT ?s) AS ?n) WHERE {
  ?s a ?type .
}
GROUP BY ?type
ORDER BY DESC(?n)
LIMIT 40`,
  },
  {
    title: "Which file says what about financial goals",
    query: `SELECT ?graph ?p ?o WHERE {
  GRAPH ?graph { fp:FinancialGoal ?p ?o }
}`,
  },
];

export function SparqlPage({ initial }: { initial: string | null }) {
  const d = useData();
  const endpoint = d.config.sparqlEndpoint;
  const cqs = useMemo(
    () =>
      d.meta.repos.flatMap((r) =>
        r.competency_questions.filter((q) => q.query).map((q) => ({ title: `${r.name} ${q.id}: ${q.question}`, query: applyBindings(q.query!, q.bindings).trim() })),
      ),
    [d],
  );
  const [query, setQuery] = useState(initial ?? EXAMPLES[0].query);
  const [result, setResult] = useState<Result | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [added, setAdded] = useState<string[]>([]);
  const lastRun = useRef<string | null>(null);

  // a query in the URL (a link from a domain page, a "Query" button) runs once when it arrives
  useEffect(() => {
    if (initial && initial !== lastRun.current) {
      lastRun.current = initial;
      setQuery(initial);
      void run(initial);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initial]);

  /** add PREFIX declarations for every known prefix the query uses but doesn't declare */
  const withPrefixes = (q: string): [string, string[]] => {
    const declared = new Set([...q.matchAll(/PREFIX\s+([\w-]*):/gi)].map((m) => m[1]));
    const body = q.replace(/<[^>]*>/g, " ").replace(/"(?:[^"\\]|\\.)*"/g, " ").replace(/#[^\n]*/g, " ");
    const used = new Set([...body.matchAll(/(?:^|[\s(,;/^|!])([A-Za-z][\w-]*):(?=[\w-]|\s)/g)].map((m) => m[1]));
    const all = { rdf: "http://www.w3.org/1999/02/22-rdf-syntax-ns#", ...d.meta.prefixes };
    const missing = [...used].filter((p) => !declared.has(p) && p in all);
    const head = missing.map((p) => `PREFIX ${p}: <${all[p as keyof typeof all]}>`).join("\n");
    return [missing.length ? `${head}\n${q}` : q, missing];
  };

  async function run(q = query) {
    if (!endpoint) return;
    const [full, missing] = withPrefixes(q);
    setAdded(missing);
    setBusy(true);
    setError(null);
    const t0 = performance.now();
    try {
      const r = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/sparql-results+json, text/turtle" },
        body: new URLSearchParams({ query: full }).toString(),
      });
      const text = await r.text();
      const ms = Math.round(performance.now() - t0);
      if (!r.ok) throw new Error(text || `HTTP ${r.status}`);
      if ((r.headers.get("Content-Type") ?? "").includes("json")) {
        const j = JSON.parse(text);
        if ("boolean" in j) setResult({ kind: "ask", value: j.boolean, ms });
        else setResult({ kind: "select", vars: j.head.vars, rows: j.results.bindings, truncated: !!j.truncated, ms });
      } else setResult({ kind: "graph", text, ms });
    } catch (e) {
      setResult(null);
      setError(e instanceof TypeError ? `Could not reach the SPARQL endpoint (${endpoint}). Is the studio server running?` : String((e as Error).message ?? e));
    } finally {
      setBusy(false);
    }
  }

  if (!endpoint) {
    return (
      <div className="stack">
        <h1>SPARQL</h1>
        <div className="notice">
          This site has no SPARQL endpoint configured. Queries need the studio server: run <code>make studio-serve</code> or{" "}
          <code>make studio-docker</code>, or set <code>sparqlEndpoint</code> in <code>config.json</code> to a running server.
        </div>
      </div>
    );
  }

  return (
    <div className="stack">
      <header>
        <h1>SPARQL</h1>
        <p className="lead">
          Query the whole semantic layer: every governed file and the FIBO profile modules. The default graph is everything; each source file is also a
          named graph (<span className="mono small">{d.meta.graph_prefix}&lt;path&gt;</span>). Read-only.
        </p>
      </header>
      <Section>
        <div className="row sparql-tools">
          <label className="row small">
            Examples
            <select
              value=""
              onChange={(e) => {
                const all = [...EXAMPLES, ...cqs];
                const ex = all[Number(e.target.value)];
                if (ex) {
                  setQuery(ex.query);
                  setResult(null);
                  setError(null);
                }
              }}
            >
              <option value="">Choose a query&hellip;</option>
              <optgroup label="Exploring">
                {EXAMPLES.map((x, i) => (
                  <option key={i} value={i}>{x.title}</option>
                ))}
              </optgroup>
              <optgroup label="Competency questions">
                {cqs.map((x, i) => (
                  <option key={i} value={EXAMPLES.length + i}>{x.title}</option>
                ))}
              </optgroup>
            </select>
          </label>
          <span className="small muted">Known prefixes are added for you. Ctrl+Enter runs.</span>
        </div>
        <label className="sr-only" htmlFor="sparql-q">Query</label>
        <textarea
          id="sparql-q"
          className="query"
          spellCheck={false}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
              e.preventDefault();
              void run();
            }
          }}
          rows={Math.min(24, Math.max(8, query.split("\n").length + 1))}
        />
        <div className="row">
          <button type="button" className="btn primary" onClick={() => void run()} disabled={busy}>
            <Icon name="play" size={14} /> {busy ? "Running" : "Run query"}
          </button>
          {result?.kind === "select" && (
            <>
              <button type="button" className="btn" onClick={() => download("results.csv", toCsv(result.vars, result.rows), "text/csv")}>
                <Icon name="download" size={14} /> CSV
              </button>
              <button type="button" className="btn" onClick={() => download("results.json", JSON.stringify(result.rows, null, 1), "application/json")}>
                <Icon name="download" size={14} /> JSON
              </button>
            </>
          )}
          {added.length > 0 && <span className="small muted">Added prefixes: {added.join(", ")}</span>}
        </div>
      </Section>
      {error && (
        <div className="notice fail" role="alert">
          <pre className="plain-pre">{error}</pre>
        </div>
      )}
      {result && <Results result={result} />}
    </div>
  );
}

function Results({ result }: { result: Result }) {
  const { kg } = useData();
  if (result.kind === "ask") return <Section title="Answer">{result.value ? "Yes" : "No"}</Section>;
  if (result.kind === "graph")
    return (
      <Section title="Result" actions={<span className="small muted">{result.ms} ms</span>}>
        <pre className="code">{result.text}</pre>
      </Section>
    );
  const cell = (b?: Binding) => {
    if (!b) return null;
    if (b.type === "uri") {
      const known = kg.id(b.value) !== undefined;
      const text = kg.curie(b.value);
      return known ? <a href={href.resource(b.value)} className="mono small">{text}</a> : <span className="mono small">{text}</span>;
    }
    if (b.type === "bnode") return <span className="muted small">_:{b.value}</span>;
    return <span>{b.value}{b["xml:lang"] && b["xml:lang"] !== "en" && <span className="curie">@{b["xml:lang"]}</span>}</span>;
  };
  return (
    <Section title="Results" actions={<span className="small muted">{result.rows.length} rows{result.truncated ? " (capped)" : ""}, {result.ms} ms</span>}>
      {result.rows.length ? (
        <div className="scroll-x">
          <table>
            <thead>
              <tr>
                {result.vars.map((v) => (
                  <th key={v}>{v}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {result.rows.map((r, i) => (
                <tr key={i}>
                  {result.vars.map((v) => (
                    <td key={v}>{cell(r[v])}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <Empty>No results.</Empty>
      )}
    </Section>
  );
}

function toCsv(vars: string[], rows: Record<string, Binding>[]): string {
  const esc = (s: string) => (/[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s);
  return [vars.join(","), ...rows.map((r) => vars.map((v) => esc(r[v]?.value ?? "")).join(","))].join("\n") + "\n";
}

function download(name: string, text: string, type: string) {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}
