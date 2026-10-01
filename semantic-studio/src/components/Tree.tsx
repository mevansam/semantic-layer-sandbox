import { ReactNode, useEffect, useMemo, useState } from "react";
import { Icon } from "./ui";

export interface TreeProps {
  roots: number[];
  childrenOf: (id: number) => number[];
  render: (id: number) => ReactNode;
  text: (id: number) => string; // what the filter matches
  focus?: number;
  label: string;
}

/** An expandable tree with a filter; matches are shown with their ancestors. */
export function Tree({ roots, childrenOf, render, text, focus, label }: TreeProps) {
  const [q, setQ] = useState("");
  const [open, setOpen] = useState<Set<number>>(new Set());

  const parents = useMemo(() => {
    const m = new Map<number, number>();
    const walk = (id: number) => childrenOf(id).forEach((c) => { if (!m.has(c)) { m.set(c, id); walk(c); } });
    roots.forEach(walk);
    return m;
  }, [roots, childrenOf]);

  useEffect(() => {
    if (focus === undefined) return;
    const s = new Set<number>();
    for (let p = parents.get(focus); p !== undefined; p = parents.get(p)) s.add(p);
    setOpen(s);
    const t = window.setTimeout(() => document.getElementById(`tree-${focus}`)?.scrollIntoView({ block: "center" }), 60);
    return () => window.clearTimeout(t);
  }, [focus, parents]);

  const visible = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (!needle) return null;
    const v = new Set<number>();
    const visit = (id: number) => {
      if (text(id).toLowerCase().includes(needle)) for (let x: number | undefined = id; x !== undefined; x = parents.get(x)) v.add(x);
      childrenOf(id).forEach(visit);
    };
    roots.forEach(visit);
    return v;
  }, [q, roots, childrenOf, text, parents]);

  const toggle = (id: number) => {
    const s = new Set(open);
    if (s.has(id)) s.delete(id);
    else s.add(id);
    setOpen(s);
  };

  const node = (id: number, depth: number): ReactNode => {
    if (visible && !visible.has(id)) return null;
    const kids = childrenOf(id);
    const isOpen = visible ? true : open.has(id);
    return (
      <li key={id} id={`tree-${id}`} className={id === focus ? "focus" : ""}>
        <div className="tree-row" style={{ paddingLeft: depth * 18 }}>
          {kids.length ? (
            <button type="button" className={`twisty${isOpen ? " open" : ""}`} aria-expanded={isOpen} aria-label={isOpen ? "Collapse" : "Expand"} onClick={() => toggle(id)}>
              <Icon name="chevron" size={14} />
            </button>
          ) : (
            <span className="twisty-space" />
          )}
          {render(id)}
          {kids.length > 0 && <span className="count">{kids.length}</span>}
        </div>
        {isOpen && kids.length > 0 && <ul role="group">{kids.map((k) => node(k, depth + 1))}</ul>}
      </li>
    );
  };

  return (
    <div className="tree">
      <div className="tree-tools">
        <label className="filter">
          <Icon name="search" size={16} />
          <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder={`Filter ${label}`} aria-label={`Filter ${label}`} />
        </label>
        <button type="button" className="btn" onClick={() => setOpen(new Set(parents.values()))}>Expand all</button>
        <button type="button" className="btn" onClick={() => setOpen(new Set())}>Collapse all</button>
      </div>
      <ul className="tree-root" role="tree" aria-label={label}>
        {roots.map((r) => node(r, 0))}
        {visible && visible.size === 0 && <li className="empty">Nothing matches.</li>}
      </ul>
    </div>
  );
}
