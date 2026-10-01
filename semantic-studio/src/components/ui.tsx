import { ReactNode } from "react";
import { useData, useSettings } from "../data";
import { capitalize, formatLiteral } from "../kg";
import { isExternal, kindOf, Status } from "../model";
import { href } from "../router";

// ---- icons (inline stroke SVG) ---------------------------------------------------------------------

const PATHS: Record<string, string> = {
  home: "M3 10l7-6 7 6v7H3z",
  domain: "M3 3h6v6H3zM11 3h6v6h-6zM3 11h6v6H3zM11 11h6v6h-6z",
  concept: "M10 4a6 6 0 1 0 0 12a6 6 0 1 0 0-12M10 4v12M4 10h12",
  cap: "M3 5h14M3 10h10M3 15h6",
  tax: "M4 3v14M4 6h5M4 11h5M4 16h5M11 4h6v4h-6zM11 9h6v4h-6zM11 14h6v4h-6z",
  fibo: "M10 2l7 4v8l-7 4-7-4V6zM10 10l7-4M10 10v8M10 10L3 6",
  graph: "M5 3a2 2 0 1 0 0 4a2 2 0 1 0 0-4M15 3a2 2 0 1 0 0 4a2 2 0 1 0 0-4M10 13a2 2 0 1 0 0 4a2 2 0 1 0 0-4M6.5 6.5l2.5 7M13.5 6.5l-2.5 7M7 5h6",
  gov: "M10 3l7 3v4c0 4-3 6-7 7-4-1-7-3-7-7V6z",
  health: "M2 10h4l2-5 4 10 2-5h4",
  docs: "M5 2h7l4 4v12H5zM12 2v4h4",
  sparql: "M7 6l-4 4 4 4M13 6l4 4-4 4M11 4l-2 12",
  search: "M9 4a5 5 0 1 0 0 10a5 5 0 1 0 0-10M13 13l4 4",
  ext: "M8 4H4v12h12v-4M11 3h6v6M17 3l-8 8",
  file: "M5 2h7l4 4v12H5zM12 2v4h4M8 10h5M8 13h5",
  menu: "M3 5h14M3 10h14M3 15h14",
  close: "M5 5l10 10M15 5L5 15",
  chevron: "M8 5l5 5-5 5",
  copy: "M7 7h9v10H7zM4 13V3h9",
  play: "M6 4l10 6-10 6z",
  download: "M10 3v10M6 9l4 4 4-4M4 17h12",
  warn: "M10 3l8 14H2zM10 8v4M10 14.5v.5",
  check: "M4 10l4 4 8-8",
};

export function Icon({ name, size = 18, label }: { name: string; size?: number; label?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round" aria-hidden={label ? undefined : true} role={label ? "img" : undefined} aria-label={label}>
      <path d={PATHS[name] ?? ""} />
    </svg>
  );
}

// ---- building blocks -------------------------------------------------------------------------------

export function Pill({ tone = "mute", children, title }: { tone?: "pass" | "warn" | "fail" | "info" | "mute" | "accent"; children: ReactNode; title?: string }) {
  return (
    <span className={`pill ${tone}`} title={title}>
      {children}
    </span>
  );
}

export function Section({ title, id, anchor, actions, children, className }: { title?: ReactNode; id?: string; anchor?: string; actions?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={`card ${className ?? ""}`} aria-labelledby={id} id={anchor}>
      {(title || actions) && (
        <div className="between">
          {title && <h2 id={id}>{title}</h2>}
          {actions}
        </div>
      )}
      {children}
    </section>
  );
}

export function Empty({ children }: { children: ReactNode }) {
  return <p className="empty">{children}</p>;
}

export function Tabs({ tabs, current, link }: { tabs: { key: string; label: string; count?: number }[]; current: string; link: (key: string) => string }) {
  return (
    <nav className="tabs" aria-label="Sections">
      {tabs.map((t) => (
        <a key={t.key} className={`tab${t.key === current ? " on" : ""}`} href={link(t.key)} aria-current={t.key === current ? "page" : undefined}>
          {t.label}
          {t.count !== undefined && <span className="count">{t.count}</span>}
        </a>
      ))}
    </nav>
  );
}

export function StatusMark({ status, title }: { status: Status; title?: string }) {
  const text = { pass: "Pass", warn: "Warning", fail: "Fail", none: "Not run", na: "Does not apply" }[status];
  const sym = { pass: "✓", warn: "!", fail: "✕", none: "?", na: "–" }[status];
  return (
    <span className={`cell c-${status}`} title={title ? `${text}: ${title}` : text} aria-label={text}>
      {sym}
    </span>
  );
}

export function statusTone(s: Status): "pass" | "warn" | "fail" | "mute" {
  return s === "pass" ? "pass" : s === "warn" ? "warn" : s === "fail" ? "fail" : "mute";
}

export function Mono({ children }: { children: ReactNode }) {
  return <span className="mono">{children}</span>;
}

export function SourceLink({ path, label }: { path: string; label?: string }) {
  return (
    <a className="mono small" href={href.source(path)}>
      {label ?? path}
    </a>
  );
}

// ---- terms -----------------------------------------------------------------------------------------

/** A link to a node's page, labelled for people; technical mode adds the CURIE. */
export function Term({ id, showKind, plain }: { id: number; showKind?: boolean; plain?: boolean }) {
  const { kg } = useData();
  const { technical } = useSettings();
  if (id < 0) return <span>{formatLiteral(kg.lit(id))}</span>;
  if (kg.isBlank(id)) return <BlankNode id={id} />;
  const iri = kg.iri(id);
  const label = capitalize(kg.label(id));
  const curie = kg.curie(iri);
  const kind = showKind ? kindOf(kg, id) : undefined;
  return (
    <span className="term">
      {plain ? <span>{label}</span> : <a href={href.resource(iri)} title={curie}>{label}</a>}
      {technical && curie !== label && <span className="curie">{curie}</span>}
      {isExternal(iri) && <span className="ext-badge" title="Defined outside the enterprise (FIBO / OMG)">{iri.includes("edmcouncil") ? "FIBO" : "OMG"}</span>}
      {kind && <span className="kind">{kind.label}</span>}
    </span>
  );
}

/** Blank nodes (OWL restrictions, SHACL property shapes, RDF lists) shown inline. */
export function BlankNode({ id, depth = 0 }: { id: number; depth?: number }) {
  const { kg } = useData();
  const list = kg.list(id);
  if (list) {
    return (
      <span className="inline-list">
        {list.map((x, i) => (
          <span key={i}>
            {i > 0 && ", "}
            <ValueOf o={x} depth={depth + 1} />
          </span>
        ))}
      </span>
    );
  }
  if (depth > 3) return <span className="muted">(nested)</span>;
  const edges = kg.out[id];
  return (
    <span className="bnode">
      {edges.map((e, i) => (
        <span key={i} className="bnode-row">
          <span className="bnode-p">{kg.label(e.p)}</span> <ValueOf o={e.o} depth={depth + 1} />
        </span>
      ))}
    </span>
  );
}

export function ValueOf({ o, depth = 0 }: { o: number; depth?: number }) {
  const { kg } = useData();
  if (o < 0) {
    const l = kg.lit(o);
    return (
      <span className="literal">
        {formatLiteral(l)}
        {l.lang && l.lang !== "en" && <span className="curie">@{l.lang}</span>}
      </span>
    );
  }
  if (kg.isBlank(o)) return <BlankNode id={o} depth={depth} />;
  return <Term id={o} />;
}

export function TermList({ ids, empty, showKind }: { ids: number[]; empty?: string; showKind?: boolean }) {
  if (!ids.length) return empty ? <span className="muted">{empty}</span> : null;
  return (
    <ul className="chips">
      {ids.map((x) => (
        <li key={x} className="chip">
          <Term id={x} showKind={showKind} />
        </li>
      ))}
    </ul>
  );
}

export function KV({ rows }: { rows: [ReactNode, ReactNode][] }) {
  const shown = rows.filter(([, v]) => v !== undefined && v !== null && v !== false && v !== "");
  if (!shown.length) return null;
  return (
    <dl className="kv">
      {shown.map(([k, v], i) => (
        <div key={i}>
          <dt>{k}</dt>
          <dd>{v}</dd>
        </div>
      ))}
    </dl>
  );
}

export function fmtDate(iso?: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  return isNaN(d.getTime()) ? iso : d.toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
}
