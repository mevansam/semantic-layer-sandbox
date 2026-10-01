import { useEffect, useState } from "react";
import { Icon, Section } from "../components/ui";
import { useData } from "../data";
import { href } from "../router";

// The text of a source file, as exported with the site (data/files/<path>).
export function SourcePage({ path, line }: { path: string; line?: number }) {
  const d = useData();
  const [text, setText] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const repo = d.repoOfFile(path);
  const doc = d.docs.find((x) => x.path === path);
  const fiboModule = d.meta.fibo.modules.find((m) => m.file === path);

  useEffect(() => {
    setText(null);
    setError(null);
    if (fiboModule) return;
    fetch(`data/files/${path.split("/").map(encodeURIComponent).join("/")}`)
      .then((r) => (r.ok ? r.text() : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then(setText, (e) => setError(String(e.message ?? e)));
  }, [path, fiboModule]);

  useEffect(() => {
    if (text && line) document.getElementById(`L${line}`)?.scrollIntoView({ block: "center" });
  }, [text, line]);

  const remote = d.meta.remote?.replace(/^git@github\.com:/, "https://github.com/").replace(/\.git$/, "");
  return (
    <div className="stack">
      <div className="crumbs">
        {repo ? (
          <>
            <a href={href.domain(repo.id, "files")}>{repo.name}</a> / files
          </>
        ) : (
          "Files"
        )}
      </div>
      <header className="between top">
        <h1 className="mono path-title">{path}</h1>
        <div className="row actions">
          {doc && <a className="btn" href={href.doc(path)}>Rendered</a>}
          {remote && d.meta.commit && remote.startsWith("https://") && (
            <a className="btn" href={`${remote}/blob/${d.meta.commit}/${path}`} target="_blank" rel="noopener noreferrer">
              <Icon name="ext" size={16} /> Repository
            </a>
          )}
        </div>
      </header>
      <Section>
        {fiboModule ? (
          <p>
            FIBO modules are not copied into the site.{" "}
            <a href={fiboModule.url ?? "#"} target="_blank" rel="noopener noreferrer">Open it in the FIBO repository</a>.
          </p>
        ) : error ? (
          <p className="empty">This file is not part of the exported site ({error}).</p>
        ) : text === null ? (
          <p className="muted">Loading&hellip;</p>
        ) : (
          <div className="source scroll-x">
            <table className="lines">
              <tbody>
                {text.replace(/\n$/, "").split("\n").map((ln, i) => (
                  <tr key={i} id={`L${i + 1}`} className={line === i + 1 ? "hl" : ""}>
                    <td className="ln">{i + 1}</td>
                    <td className="code-line">{ln || " "}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Section>
    </div>
  );
}
