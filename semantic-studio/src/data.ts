// Loads the exported data (data/*.json) once and derives what the pages need.
import { createContext, useContext } from "react";
import { GraphJson, KG } from "./kg";

export interface RepoFile {
  path: string;
  size: number;
  role: string | null;
}

export interface NegativeTest {
  name: string;
  file: string;
  path: string;
  expect_violations?: string[];
}

export interface CompetencyQuestion {
  id: string;
  question: string;
  path: string;
  query_path: string | null;
  query: string | null;
  bindings: Record<string, string>;
  expect: { min_rows?: number; contains?: Record<string, string> };
}

export type RepoKind = "governance" | "fibo-extensions" | "business-domain" | "domain";

export interface Repo {
  id: string;
  name: string;
  kind: RepoKind;
  folder: string;
  code: string | null;
  prefix: string | null;
  namespace: string | null;
  parent: string | null;
  sub_domains: string[];
  dependencies: string[];
  readme: string | null;
  config: Record<string, unknown>;
  paths: Record<string, string[]>;
  files: RepoFile[];
  negative_tests: NegativeTest[];
  competency_questions: CompetencyQuestion[];
}

export interface FiboModule {
  iri: string;
  file: string | null;
  url: string | null;
  available: boolean;
}

export interface Meta {
  generated: string;
  commit: string | null;
  commit_short: string | null;
  branch: string | null;
  dirty: boolean;
  remote: string | null;
  base_iri: string;
  enterprise: string | null;
  fibo: { release_tag: string; repository: string; pin: string | null; modules: FiboModule[]; available: boolean };
  prefixes: Record<string, string>;
  graph_prefix: string;
  repos: Repo[];
  warnings: string[];
  counts: { triples: number; files: number; docs: number; sources: number };
}

export interface Doc {
  path: string;
  group: "adr" | "framework" | "standards" | "domains" | "repository";
  title: string;
  status: string | null;
  text: string;
}

export interface Card {
  id: string;
  type: string[];
  label: string;
  definition: string;
  agent_guidance: string;
  rule_id: string;
  taxonomy_anchors: string[];
  broader: { id: string; label: string }[];
  governing_rules: { id: string; rule_id: string; statement: string }[];
  served_by_apis: { id: string; label: string }[];
  data_products: { id: string; label: string; steward: string }[];
  citation: Record<string, string>;
  text: string;
}

export interface Message {
  level: "pass" | "warn" | "fail" | "info";
  text: string;
}

export interface Step {
  step: string;
  gate: string | null;
  passed: boolean;
  messages: Message[];
}

export interface Report {
  command: string;
  reasoner?: string | null;
  repo: string;
  kind: string;
  started: string;
  finished: string;
  commit: string | null;
  passed: boolean;
  stale?: boolean;
  live?: boolean;
  steps: Step[];
}

export interface Align {
  passed: boolean;
  groups: Record<string, string[]>;
  summary: string;
  error: string | null;
}

export interface UpstreamIssue {
  id: string;
  title: string;
  found?: string;
  affects?: string[];
  evidence?: string;
  resolution?: string;
  upstream?: string;
  remove?: { subject: string; predicate: string; object: string }[];
}

export interface Health {
  commit: string | null;
  repos: Record<string, { reports: Record<string, Report>; drift?: Report; align?: Align }>;
  selftest: {
    finished: string;
    commit: string | null;
    passed: boolean;
    total: number;
    failures: number;
    stale?: boolean;
    scenarios: { id: string; repo: string; command: string; kind: string; outcome: string; ok: boolean; detail: string }[];
  } | null;
  upstream_issues: UpstreamIssue[];
  upstream_register_path?: string;
}

export interface Config {
  sparqlEndpoint: string;
}

export interface Data {
  meta: Meta;
  kg: KG;
  docs: Doc[];
  cards: Record<string, { cards: Card[]; edges: { source: string; predicate: string; target: string }[] }>;
  health: Health;
  config: Config;
  repoOfFile: (path: string) => Repo | undefined;
  repo: (id: string) => Repo | undefined;
  cardOf: (iri: string) => Card | undefined;
}

async function getJson<T>(url: string, fallback?: T): Promise<T> {
  const r = await fetch(url, { cache: "no-cache" });
  if (!r.ok) {
    if (fallback !== undefined) return fallback;
    throw new Error(`${url}: HTTP ${r.status}`);
  }
  return (await r.json()) as T;
}

export async function loadData(): Promise<Data> {
  const [meta, graph, docs, cards, health, config] = await Promise.all([
    getJson<Meta>("data/meta.json"),
    getJson<GraphJson>("data/graph.json"),
    getJson<Doc[]>("data/docs.json", []),
    getJson<Data["cards"]>("data/cards.json", {}),
    getJson<Health>("data/health.json", { commit: null, repos: {}, selftest: null, upstream_issues: [] }),
    getJson<Config>("config.json", { sparqlEndpoint: "sparql" }),
  ]);
  const kg = new KG(graph, meta.prefixes);
  const byLength = [...meta.repos].sort((a, b) => b.id.length - a.id.length);
  const repoOfFile = (path: string) => byLength.find((r) => path === r.id || path.startsWith(r.id + "/"));
  const repoIx = new Map(meta.repos.map((r) => [r.id, r]));
  const cardIx = new Map<string, Card>();
  for (const v of Object.values(cards)) for (const c of v.cards) cardIx.set(c.id, c);
  return {
    meta,
    kg,
    docs,
    cards,
    health,
    config,
    repoOfFile,
    repo: (id) => repoIx.get(id),
    cardOf: (iri) => cardIx.get(iri),
  };
}

export const DataContext = createContext<Data | null>(null);

export function useData(): Data {
  const d = useContext(DataContext);
  if (!d) throw new Error("data not loaded");
  return d;
}

export interface Settings {
  technical: boolean;
  setTechnical: (v: boolean) => void;
}

export const SettingsContext = createContext<Settings>({ technical: false, setTechnical: () => {} });

export function useSettings(): Settings {
  return useContext(SettingsContext);
}
