// Gate results (from the reports make verify / hermit / selftest leave in build/reports), drift and template
// alignment (checked when the data was exported), and the register of known upstream defects.
import { Fragment, useEffect } from "react";
import { Empty, fmtDate, Pill, Section, SourceLink, StatusMark, statusTone } from "../components/ui";
import { Data, Message, Repo, Report, useData } from "../data";
import { findings, GATES, gateStatus, REPO_KIND_LABEL, Status, statusOfMessages } from "../model";
import { href } from "../router";

export function repoHealthSummary(d: Data, repo: Repo): { label: string; tone: "pass" | "warn" | "fail" | "mute" } {
  const h = d.health.repos[repo.id];
  const verify = h?.reports?.verify;
  if (verify) {
    const applicable = GATES.filter((g) => g.kinds.includes(repo.kind));
    const st = applicable.map((g) => gateStatus(d, repo, g.id).status);
    const failing = st.filter((s) => s === "fail").length;
    const stale = verify.stale ? " (out of date)" : "";
    if (failing) return { label: `${failing} gate${failing > 1 ? "s" : ""} failing${stale}`, tone: "fail" };
    if (st.includes("warn")) return { label: `Gates pass with warnings${stale}`, tone: "warn" };
    return { label: `${applicable.length}/${applicable.length} gates pass${stale}`, tone: verify.stale ? "mute" : "pass" };
  }
  if (h?.drift) return { label: h.drift.passed ? "Not verified yet; no drift" : "Drift found", tone: h.drift.passed ? "mute" : "fail" };
  return { label: "Not verified yet", tone: "mute" };
}

function reportStatus(r?: Report): Status {
  if (!r) return "none";
  return statusOfMessages(r.passed, r.steps.flatMap((s) => s.messages));
}

function Cells({ repo }: { repo: Repo }) {
  const d = useData();
  const h = d.health.repos[repo.id];
  const hermit = h?.reports?.["reason-hermit"];
  return (
    <>
      {GATES.map((g) => {
        const s = gateStatus(d, repo, g.id);
        const first = s.messages.find((m) => m.level === "fail") ?? s.messages.find((m) => m.level === "warn");
        return (
          <td key={g.id} className="c">
            <StatusMark status={s.status} title={`${g.id} ${g.name}${first ? ` - ${first.text}` : ""}`} />
          </td>
        );
      })}
      <td className="c">
        <StatusMark status={repo.kind === "business-domain" ? reportStatus(hermit) : "na"} title="Full OWL DL reasoning (make hermit)" />
      </td>
      <td className="c">
        <StatusMark status={h?.drift ? reportStatus(h.drift) : "none"} title="Drift checked at export time (G8)" />
      </td>
      <td className="c">
        <StatusMark status={repo.kind !== "domain" ? "na" : h?.align ? (h.align.passed ? "pass" : "fail") : "none"} title="Sub-domain still matches domain-template (make align)" />
      </td>
    </>
  );
}

function MatrixHead() {
  return (
    <thead>
      <tr>
        <th>Repository</th>
        {GATES.map((g) => (
          <th key={g.id} className="c" title={g.name}>
            {g.id}
          </th>
        ))}
        <th className="c" title="Full OWL DL reasoning per business domain (make hermit)">HermiT</th>
        <th className="c" title="Gate G8 drift checks, run when the data was exported">Drift now</th>
        <th className="c" title="Sub-domain matches domain-template (make align)">Template</th>
      </tr>
    </thead>
  );
}

function Legend() {
  return (
    <div className="legend small">
      {(["pass", "warn", "fail", "none", "na"] as Status[]).map((s) => (
        <span key={s} className="row">
          <StatusMark status={s} /> {{ pass: "Pass", warn: "Pass with warnings", fail: "Fail", none: "Not run yet", na: "Does not apply" }[s]}
        </span>
      ))}
    </div>
  );
}

function Messages({ messages }: { messages: Message[] }) {
  const shown = messages.filter((m) => m.level !== "pass" || messages.length < 40);
  return (
    <ul className="messages">
      {shown.map((m, i) => (
        <li key={i} className={`msg ${m.level}`}>
          <span className="lvl">{m.level === "info" ? "" : m.level.toUpperCase()}</span>
          <span className="mono small">{m.text}</span>
        </li>
      ))}
    </ul>
  );
}

function ReportDetail({ title, report }: { title: string; report: Report }) {
  const status = reportStatus(report);
  return (
    <details className="report" open={status === "fail" || status === "warn"}>
      <summary>
        <StatusMark status={status} /> <strong>{title}</strong>{" "}
        <span className="small muted">
          {report.live ? "checked at export" : `run ${fmtDate(report.finished)}`}
          {report.commit && ` at ${report.commit.slice(0, 7)}`}
        </span>
        {report.stale && <Pill tone="warn" title="Produced at another commit, or before a file of this repository last changed">Out of date</Pill>}
      </summary>
      {report.steps.map((s) => (
        <div key={s.step} className="step-report">
          <div className="row">
            <StatusMark status={statusOfMessages(s.passed, s.messages)} />
            <span className="mono small">{s.step}</span>
            {s.gate && <Pill tone="mute">{s.gate}</Pill>}
          </div>
          <Messages messages={s.messages} />
        </div>
      ))}
    </details>
  );
}

export function RepoHealth({ repo }: { repo: Repo }) {
  const d = useData();
  const h = d.health.repos[repo.id];
  const reports = Object.entries(h?.reports ?? {});
  return (
    <>
      <Section title="Gates">
        <div className="scroll-x">
          <table className="matrix">
            <MatrixHead />
            <tbody>
              <tr>
                <td>{repo.name}</td>
                <Cells repo={repo} />
              </tr>
            </tbody>
          </table>
        </div>
        <Legend />
      </Section>
      <Section title="Reports">
        {!reports.length && !h?.drift && <Empty>No reports yet. Run <code>make verify</code> and then <code>make studio</code>.</Empty>}
        {reports.map(([name, r]) => (
          <ReportDetail key={name} title={`make ${name === "reason-hermit" ? "hermit" : name}`} report={r} />
        ))}
        {h?.drift && <ReportDetail title="Drift (gate G8)" report={h.drift} />}
      </Section>
      {h?.align && <AlignDetail repo={repo} />}
    </>
  );
}

function AlignDetail({ repo }: { repo: Repo }) {
  const d = useData();
  const a = d.health.repos[repo.id]?.align;
  if (!a) return null;
  const order = ["DRIFTED", "MISSING", "edited", "added", "seed-only", "unchanged"];
  return (
    <Section title="Template alignment" actions={<Pill tone={a.passed ? "pass" : "fail"}>{a.summary || (a.passed ? "Aligned" : "Drifted")}</Pill>}>
      <p className="small muted">How this sub-domain lines up with domain-template. DRIFTED: a template-owned file was changed; fix with copier update.</p>
      <div className="file-groups">
        {order
          .filter((k) => a.groups[k]?.length)
          .map((k) => (
            <details key={k} open={k === "DRIFTED" || k === "MISSING"}>
              <summary>
                {k} ({a.groups[k].length})
              </summary>
              <ul className="plain">
                {a.groups[k].map((f) => (
                  <li key={f}>
                    <SourceLink path={`${repo.id}/${f}`} label={f} />
                  </li>
                ))}
              </ul>
            </details>
          ))}
      </div>
    </Section>
  );
}

export function HealthPage({ repo: focus, section }: { repo: string | null; section: string | null }) {
  const d = useData();
  useEffect(() => {
    if (!section) return;
    const t = window.setTimeout(() => document.getElementById(section)?.scrollIntoView({ block: "start" }), 50);
    return () => window.clearTimeout(t);
  }, [section]);
  const repos = d.meta.repos;
  let pass = 0, total = 0, warns = 0;
  for (const r of repos)
    for (const g of GATES) {
      const s = gateStatus(d, r, g.id).status;
      if (s === "na" || s === "none") continue;
      total++;
      if (s === "pass" || s === "warn") pass++;
      if (s === "warn") warns++;
    }
  const unverified = repos.filter((r) => !d.health.repos[r.id]?.reports?.verify);
  const driftOk = repos.filter((r) => d.health.repos[r.id]?.drift?.passed).length;
  const st = d.health.selftest;
  return (
    <div className="stack">
      <header className="between top">
        <div>
          <h1>Health</h1>
          <p className="lead">
            Gate results come from the last <code>make verify</code>, <code>make hermit</code> and <code>make selftest</code> on the machine that built
            this site. Drift and template alignment were checked when the data was exported ({fmtDate(d.meta.generated)}).
          </p>
        </div>
      </header>
      <div className="tiles">
        <div className="tile">
          <b>{total ? `${pass}/${total}` : "-"}</b>
          <span>gate results passing</span>
        </div>
        <div className="tile">
          <b>{warns}</b>
          <span>gates with warnings</span>
        </div>
        <div className="tile">
          <b>{driftOk}/{repos.length}</b>
          <span>repositories without drift</span>
        </div>
        <div className="tile">
          <b>{st ? `${st.total - st.failures}/${st.total}` : "-"}</b>
          <span>self-test scenarios{st?.stale ? " (out of date)" : ""}</span>
        </div>
        <a className="tile" href={href.health(undefined, "upstream")}>
          <b>{d.health.upstream_issues.length}</b>
          <span>known upstream defects</span>
        </a>
      </div>
      {unverified.length > 0 && (
        <div className="notice">
          <strong>{unverified.length === repos.length ? "No gate results yet." : `${unverified.length} repositories have no gate results yet.`}</strong> Run{" "}
          <code>make verify</code> (and <code>make hermit</code>, <code>make selftest</code>) at the repository root, then <code>make studio</code> to refresh this
          page.
        </div>
      )}
      <Section title="Gate matrix">
        <div className="scroll-x">
          <table className="matrix">
            <MatrixHead />
            <tbody>
              {repos.map((r) => (
                <tr key={r.id} className={focus === r.id ? "focus" : ""}>
                  <td>
                    <a href={href.domain(r.id, "health")}>{r.name}</a>
                    <div className="small muted">{REPO_KIND_LABEL[r.kind]}</div>
                  </td>
                  <Cells repo={r} />
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <Legend />
        <table className="small gate-key">
          <tbody>
            {GATES.map((g) => (
              <tr key={g.id}>
                <td className="mono">{g.id}</td>
                <td>{g.name}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Section>
      <Section title="Findings" actions={<span className="small muted">Warnings and failures from every report</span>}>
        <Findings />
      </Section>
      <Section title="Self-test" actions={st && <Pill tone={st.passed ? "pass" : "fail"}>{st.total - st.failures}/{st.total} behave as expected</Pill>}>
        {st ? (
          <>
            <p className="small muted">
              Each scenario seeds a defect (or a correct change) into a copy of the repository and checks the tooling catches it (or accepts it). Run{" "}
              {fmtDate(st.finished)}
              {st.commit && ` at ${st.commit.slice(0, 7)}`}.
            </p>
            <details>
              <summary>All {st.scenarios.length} scenarios</summary>
              <table className="small">
                <thead>
                  <tr>
                    <th>Scenario</th>
                    <th>Command</th>
                    <th>Outcome</th>
                  </tr>
                </thead>
                <tbody>
                  {st.scenarios.map((s) => (
                    <tr key={s.id}>
                      <td className="mono">{s.id}</td>
                      <td className="mono">{s.command}</td>
                      <td>
                        <Pill tone={s.ok ? "pass" : "fail"}>{s.outcome}</Pill> <span className="muted">{s.detail}</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </details>
          </>
        ) : (
          <Empty>
            No self-test report yet. Run <code>make selftest</code>, then <code>make studio</code>.
          </Empty>
        )}
      </Section>
      <UpstreamIssues />
    </div>
  );
}

function Findings() {
  const d = useData();
  const rows: { repo: Repo; source: string; m: Message }[] = [];
  for (const r of d.meta.repos) {
    const h = d.health.repos[r.id];
    const reps: [string, Report][] = [...Object.entries(h?.reports ?? {}), ...(h?.drift ? [["drift (export)", h.drift] as [string, Report]] : [])];
    for (const [name, rep] of reps)
      for (const s of rep.steps) for (const m of findings(s.messages)) rows.push({ repo: r, source: `${name}: ${s.step}`, m });
  }
  for (const w of d.meta.warnings) rows.push({ repo: d.meta.repos[0], source: "export", m: { level: "warn", text: w } });
  const seen = new Set<string>();
  const unique = rows.filter((x) => {
    const k = `${x.repo.id}|${x.m.text}`;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
  if (!unique.length) return <Empty>No warnings or failures.</Empty>;
  return (
    <table>
      <thead>
        <tr>
          <th>Level</th>
          <th>Repository</th>
          <th>Finding</th>
          <th>From</th>
        </tr>
      </thead>
      <tbody>
        {unique.map((x, i) => (
          <tr key={i}>
            <td>
              <Pill tone={statusTone(x.m.level === "fail" ? "fail" : "warn")}>{x.m.level === "fail" ? "Fail" : "Warning"}</Pill>
            </td>
            <td>
              <a href={href.domain(x.repo.id, "health")}>{x.repo.name}</a>
            </td>
            <td className="mono small">{x.m.text}</td>
            <td className="small muted">{x.source}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export function UpstreamIssues() {
  const d = useData();
  const issues = d.health.upstream_issues;
  return (
    <Section title="Known upstream defects" id="upstream-title" anchor="upstream" actions={d.health.upstream_register_path && <SourceLink path={d.health.upstream_register_path} label="Register (ADR-0007)" />}>
      {issues.length ? (
        issues.map((u) => (
          <div key={u.id} className="item">
            <div className="row">
              <span className="mono">{u.id}</span>
              <strong>{u.title}</strong>
              <Pill tone="info">Removed from the build closure only</Pill>
            </div>
            <dl className="kv">
              {u.affects && (
                <div>
                  <dt>Affects</dt>
                  <dd>{u.affects.join("; ")}</dd>
                </div>
              )}
              {u.evidence && (
                <div>
                  <dt>Evidence</dt>
                  <dd>{u.evidence}</dd>
                </div>
              )}
              {u.resolution && (
                <div>
                  <dt>Resolution</dt>
                  <dd>{u.resolution}</dd>
                </div>
              )}
              {u.remove && (
                <div>
                  <dt>Axioms removed</dt>
                  <dd>
                    {u.remove.map((r, i) => (
                      <Fragment key={i}>
                        <div className="mono small">
                          {d.kg.curie(r.subject)} {d.kg.curie(r.predicate)} {d.kg.curie(r.object)}
                        </div>
                      </Fragment>
                    ))}
                  </dd>
                </div>
              )}
              {u.upstream && (
                <div>
                  <dt>Upstream</dt>
                  <dd>{u.upstream}</dd>
                </div>
              )}
            </dl>
          </div>
        ))
      ) : (
        <Empty>None registered.</Empty>
      )}
    </Section>
  );
}
