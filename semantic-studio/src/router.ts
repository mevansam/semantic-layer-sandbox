// Hash routes, so the site works from any static host and from a file server without rewrites.
import { useEffect, useState } from "react";

export interface Route {
  page: string; // first path segment ("" = overview)
  rest: string; // everything after it, decoded
  query: URLSearchParams;
}

export function parseHash(hash: string): Route {
  const h = hash.replace(/^#\/?/, "");
  const [path, qs = ""] = h.split("?");
  const i = path.indexOf("/");
  const page = i < 0 ? path : path.slice(0, i);
  const rest = i < 0 ? "" : path.slice(i + 1);
  let decoded = rest;
  try {
    decoded = decodeURIComponent(rest);
  } catch {
    /* keep raw */
  }
  return { page, rest: decoded, query: new URLSearchParams(qs) };
}

export function useRoute(): Route {
  const [route, setRoute] = useState(() => parseHash(window.location.hash));
  useEffect(() => {
    const on = () => {
      setRoute(parseHash(window.location.hash));
    };
    window.addEventListener("hashchange", on);
    return () => window.removeEventListener("hashchange", on);
  }, []);
  return route;
}

const q = (params?: Record<string, string | undefined>) => {
  const e = Object.entries(params ?? {}).filter(([, v]) => v !== undefined && v !== "") as [string, string][];
  return e.length ? "?" + new URLSearchParams(e).toString() : "";
};

export const href = {
  overview: () => "#/",
  domains: () => "#/domains",
  domain: (id: string, tab?: string) => `#/domain/${encodeURIComponent(id)}${q({ tab })}`,
  resource: (iri: string) => `#/r/${encodeURIComponent(iri)}`,
  capabilities: (focus?: string) => `#/capabilities${q({ focus })}`,
  taxonomy: (focus?: string) => `#/taxonomy${q({ focus })}`,
  fibo: () => "#/fibo",
  graph: (mode?: string, focus?: string) => `#/graph${q({ mode, focus })}`,
  governance: () => "#/governance",
  health: (repo?: string, section?: string) => `#/health${q({ repo, h: section })}`,
  docs: () => "#/docs",
  doc: (path: string, anchor?: string) => `#/doc/${encodeURIComponent(path)}${q({ h: anchor })}`,
  sparql: (query?: string) => `#/sparql${q({ q: query })}`,
  source: (path: string, line?: number) => `#/source/${encodeURIComponent(path)}${q({ line: line ? String(line) : undefined })}`,
};

export function go(url: string) {
  window.location.hash = url.replace(/^#/, "");
}
