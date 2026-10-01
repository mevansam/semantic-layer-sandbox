import { Component, ReactNode, useEffect, useMemo, useRef, useState } from "react";
import { Icon } from "./components/ui";
import { Data, DataContext, SettingsContext, useData, useSettings } from "./data";
import { CapabilitiesPage } from "./pages/Capabilities";
import { DocPage, DocsPage } from "./pages/Docs";
import { DomainPage, DomainsPage } from "./pages/Domains";
import { FiboPage } from "./pages/Fibo";
import { GovernancePage } from "./pages/Governance";
import { GraphPage } from "./pages/Graph";
import { HealthPage } from "./pages/Health";
import { OverviewPage } from "./pages/Overview";
import { ResourcePage } from "./pages/Resource";
import { SourcePage } from "./pages/Source";
import { SparqlPage } from "./pages/Sparql";
import { TaxonomyPage } from "./pages/Taxonomy";
import { href, Route, useRoute } from "./router";
import { buildIndex, Hit, search } from "./search";

const NAV: { page: string; label: string; icon: string; url: string; also?: string[] }[] = [
  { page: "", label: "Overview", icon: "home", url: href.overview() },
  { page: "domains", label: "Domains", icon: "domain", url: href.domains(), also: ["domain"] },
  { page: "capabilities", label: "Capability map", icon: "cap", url: href.capabilities() },
  { page: "taxonomy", label: "Taxonomy", icon: "tax", url: href.taxonomy() },
  { page: "fibo", label: "FIBO", icon: "fibo", url: href.fibo() },
  { page: "graph", label: "Graph", icon: "graph", url: href.graph() },
  { page: "governance", label: "Governance", icon: "gov", url: href.governance() },
  { page: "health", label: "Health", icon: "health", url: href.health() },
  { page: "docs", label: "Docs", icon: "docs", url: href.docs(), also: ["doc"] },
  { page: "sparql", label: "SPARQL", icon: "sparql", url: href.sparql() },
];

function readTechnical(): boolean {
  try {
    return window.localStorage.getItem("studio.technical") === "1";
  } catch {
    return false;
  }
}

export function App({ data }: { data: Data }) {
  const [technical, setTechnicalState] = useState(readTechnical);
  const setTechnical = (v: boolean) => {
    setTechnicalState(v);
    try {
      window.localStorage.setItem("studio.technical", v ? "1" : "0");
    } catch {
      /* per-browser preference only */
    }
  };
  return (
    <DataContext.Provider value={data}>
      <SettingsContext.Provider value={{ technical, setTechnical }}>
        <Shell />
      </SettingsContext.Provider>
    </DataContext.Provider>
  );
}

function Shell() {
  const route = useRoute();
  const data = useData();
  const [searchOpen, setSearchOpen] = useState(false);
  const [navOpen, setNavOpen] = useState(false);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const typing = /^(INPUT|TEXTAREA|SELECT)$/.test((e.target as HTMLElement).tagName);
      if ((e.key === "k" && (e.metaKey || e.ctrlKey)) || (e.key === "/" && !typing)) {
        e.preventDefault();
        setSearchOpen(true);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    setNavOpen(false);
    window.scrollTo(0, 0);
  }, [route.page, route.rest]);

  useEffect(() => {
    const title = NAV.find((n) => n.page === route.page || n.also?.includes(route.page))?.label;
    document.title = title && route.page ? `${title} · Semantic Studio` : "Semantic Studio";
  }, [route.page]);

  return (
    <div className="app">
      <a className="skip" href="#main" onClick={(e) => { e.preventDefault(); document.getElementById("main")?.focus(); }}>
        Skip to content
      </a>
      <nav className={`side${navOpen ? " open" : ""}`} aria-label="Main navigation">
        <div className="brand">
          Semantic Studio
          <small>Explore &middot; read-only</small>
        </div>
        {NAV.map((n) => {
          const on = n.page === route.page || !!n.also?.includes(route.page);
          return (
            <a key={n.label} className={`navlink${on ? " on" : ""}`} href={n.url} aria-current={on ? "page" : undefined}>
              <Icon name={n.icon} />
              <span>{n.label}</span>
            </a>
          );
        })}
        <div className="navsec">Domains</div>
        {data.meta.repos
          .filter((r) => r.kind === "domain")
          .map((r) => (
            <a key={r.id} className={`navlink sub${route.page === "domain" && route.rest === r.id ? " on" : ""}`} href={href.domain(r.id)}>
              <span className="dot" />
              <span>{r.name}</span>
            </a>
          ))}
        <div className="side-foot">
          {data.meta.branch && <div>{data.meta.branch}</div>}
          <div className="mono">{data.meta.commit_short ?? "uncommitted"}{data.meta.dirty ? " (modified)" : ""}</div>
          <div>FIBO {data.meta.fibo.release_tag}</div>
        </div>
      </nav>
      <div className="main">
        <header className="topbar">
          <button className="icon-btn menu-btn" type="button" aria-label="Open navigation" aria-expanded={navOpen} onClick={() => setNavOpen(!navOpen)}>
            <Icon name="menu" />
          </button>
          <button className="search-btn" type="button" onClick={() => setSearchOpen(true)} aria-label="Search">
            <Icon name="search" />
            <span>Search concepts, rules, APIs, capabilities, docs</span>
            <kbd>Ctrl K</kbd>
          </button>
          <TechnicalToggle />
        </header>
        <main id="main" className="content" tabIndex={-1}>
          <ErrorBoundary key={`${route.page}/${route.rest}`}>
            <Page route={route} />
          </ErrorBoundary>
        </main>
      </div>
      {searchOpen && <SearchDialog onClose={() => setSearchOpen(false)} />}
    </div>
  );
}

function TechnicalToggle() {
  const { technical, setTechnical } = useSettings();
  return (
    <label className="switch" title="Show IRIs, prefixes and raw triples">
      <input type="checkbox" aria-label="Technical detail" checked={technical} onChange={(e) => setTechnical(e.target.checked)} />
      <span className="track" aria-hidden="true"><span className="thumb" /></span>
      <span>Technical detail</span>
    </label>
  );
}


/** One broken page must not take the whole studio down. */
class ErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  state = { error: null as Error | null };
  static getDerivedStateFromError(error: Error) {
    return { error };
  }
  render() {
    if (this.state.error)
      return (
        <div className="notice fail" role="alert">
          <strong>This page could not be shown.</strong>
          <pre className="plain-pre">{String(this.state.error.message ?? this.state.error)}</pre>
          <p>
            <a href={href.overview()}>Back to the overview</a>
          </p>
        </div>
      );
    return this.props.children;
  }
}

function Page({ route }: { route: Route }) {
  switch (route.page) {
    case "":
      return <OverviewPage />;
    case "domains":
      return <DomainsPage />;
    case "domain":
      return <DomainPage id={route.rest} tab={route.query.get("tab") ?? "overview"} />;
    case "r":
      return <ResourcePage iri={route.rest} />;
    case "capabilities":
      return <CapabilitiesPage focus={route.query.get("focus")} />;
    case "taxonomy":
      return <TaxonomyPage focus={route.query.get("focus")} />;
    case "fibo":
      return <FiboPage />;
    case "graph":
      return <GraphPage mode={route.query.get("mode") ?? "imports"} focus={route.query.get("focus")} />;
    case "governance":
      return <GovernancePage />;
    case "health":
      return <HealthPage repo={route.query.get("repo")} section={route.query.get("h")} />;
    case "docs":
      return <DocsPage />;
    case "doc":
      return <DocPage path={route.rest} anchor={route.query.get("h")} />;
    case "sparql":
      return <SparqlPage initial={route.query.get("q")} />;
    case "source":
      return <SourcePage path={route.rest} line={Number(route.query.get("line")) || undefined} />;
    default:
      return (
        <div className="card">
          <h1>Page not found</h1>
          <p>
            <a href={href.overview()}>Back to the overview</a>
          </p>
        </div>
      );
  }
}

function SearchDialog({ onClose }: { onClose: () => void }) {
  const data = useData();
  const index = useMemo(() => buildIndex(data), [data]);
  const [q, setQ] = useState("");
  const [sel, setSel] = useState(0);
  const hits: Hit[] = useMemo(() => search(index, q), [index, q]);
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => input.current?.focus(), []);
  useEffect(() => setSel(0), [q]);
  const open = (h: Hit) => {
    window.location.hash = h.url.slice(1);
    onClose();
  };
  return (
    <div className="overlay" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="dialog" role="dialog" aria-modal="true" aria-label="Search">
        <div className="search-field">
          <Icon name="search" />
          <input
            ref={input}
            type="search"
            value={q}
            placeholder="Search concepts, rules, APIs, capabilities, docs, files"
            aria-label="Search"
            aria-controls="search-results"
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Escape") onClose();
              else if (e.key === "ArrowDown") { e.preventDefault(); setSel((s) => Math.min(s + 1, hits.length - 1)); }
              else if (e.key === "ArrowUp") { e.preventDefault(); setSel((s) => Math.max(s - 1, 0)); }
              else if (e.key === "Enter" && hits[sel]) open(hits[sel]);
            }}
          />
          <button className="icon-btn" type="button" aria-label="Close search" onClick={onClose}>
            <Icon name="close" />
          </button>
        </div>
        <ul id="search-results" className="results" role="listbox" aria-label="Results">
          {q && !hits.length && <li className="empty">Nothing matches &ldquo;{q}&rdquo;.</li>}
          {!q && <li className="empty">Type a name, a rule id like FP-R-001, a prefix like fp:, or a document title.</li>}
          {hits.map((h, i) => (
            <li key={h.url + i} role="option" aria-selected={i === sel}>
              <a href={h.url} className={i === sel ? "sel" : ""} onClick={(e) => { e.preventDefault(); open(h); }} onMouseEnter={() => setSel(i)}>
                <span className="r-title">{h.title}</span>
                <span className="r-kind">{h.kind}</span>
                <span className="r-detail">{h.detail}</span>
              </a>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
