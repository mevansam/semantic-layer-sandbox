import { useMemo } from "react";
import { Markdown, slug } from "../components/Markdown";
import { Icon, Pill, Section } from "../components/ui";
import { Doc, useData } from "../data";
import { href } from "../router";

const GROUPS: [Doc["group"], string][] = [
  ["framework", "Framework guide"],
  ["standards", "Standards"],
  ["adr", "Decisions (ADRs)"],
  ["domains", "Domains"],
  ["repository", "Repository"],
];

export function DocsPage() {
  const { docs } = useData();
  return (
    <div className="stack">
      <header>
        <h1>Docs</h1>
        <p className="lead">Every markdown document in the repository, rendered with its diagrams.</p>
      </header>
      <div className="grid2">
        {GROUPS.map(([g, label]) => {
          const list = docs.filter((x) => x.group === g).sort((a, b) => a.path.localeCompare(b.path));
          if (!list.length) return null;
          return (
            <Section key={g} title={label} actions={<span className="small muted">{list.length}</span>}>
              <ul className="list">
                {list.map((x) => (
                  <li key={x.path} className="li">
                    <span>
                      <a href={href.doc(x.path)}>{x.title}</a>
                      <div className="mono small muted">{x.path}</div>
                    </span>
                    {x.status && <Pill tone={/accept/i.test(x.status) ? "pass" : "mute"}>{x.status}</Pill>}
                  </li>
                ))}
              </ul>
            </Section>
          );
        })}
      </div>
    </div>
  );
}

export function DocPage({ path, anchor }: { path: string; anchor: string | null }) {
  const { docs } = useData();
  const doc = docs.find((x) => x.path === path);
  const toc = useMemo(() => (doc ? [...doc.text.matchAll(/^(##|###)\s+(.+)$/gm)].map((m) => ({ level: m[1].length, text: m[2].replace(/\[([^\]]+)\]\([^)]*\)/g, "$1").replace(/[`*]/g, "") })) : []), [doc]);
  if (!doc) {
    return (
      <div className="stack">
        <h1>Document not found</h1>
        <p className="mono small">{path}</p>
        <a href={href.docs()}>All documents</a>
      </div>
    );
  }
  const group = GROUPS.find(([g]) => g === doc.group)?.[1];
  return (
    <div className="stack">
      <div className="crumbs">
        <a href={href.docs()}>Docs</a> / {group}
      </div>
      <div className="doc-layout">
        <article className="card doc">
          <div className="between doc-head">
            <span className="mono small muted">{doc.path}</span>
            <a className="small" href={href.source(doc.path)}>
              <Icon name="file" size={14} /> Source
            </a>
          </div>
          <Markdown text={doc.text} path={doc.path} anchor={anchor} />
        </article>
        {toc.length > 2 && (
          <nav className="toc card" aria-label="On this page">
            <h2>On this page</h2>
            <ul>
              {toc.map((t, i) => (
                <li key={i} className={`l${t.level}`}>
                  <a href={href.doc(doc.path, slug(t.text))}>{t.text}</a>
                </li>
              ))}
            </ul>
          </nav>
        )}
      </div>
    </div>
  );
}
