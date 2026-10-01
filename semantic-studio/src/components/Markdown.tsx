// Markdown documents: marked + DOMPurify, GitHub-style heading anchors, links rewritten to studio pages,
// and ```mermaid blocks drawn as diagrams (mermaid is loaded only when a page has one).
import DOMPurify from "dompurify";
import { marked } from "marked";
import { useEffect, useMemo, useRef } from "react";
import { useData } from "../data";
import { go, href } from "../router";

export function slug(text: string): string {
  return text
    .toLowerCase()
    .trim()
    .replace(/[^\p{L}\p{N}\s_-]/gu, "")
    .replace(/\s/g, "-");
}

export function resolvePath(base: string, rel: string): string {
  const parts = base.split("/").slice(0, -1);
  for (const seg of rel.split("/")) {
    if (seg === "" || seg === ".") continue;
    if (seg === "..") parts.pop();
    else parts.push(seg);
  }
  return parts.join("/") + (rel.endsWith("/") ? "/" : "");
}

let mermaidLoad: Promise<typeof import("mermaid")["default"]> | null = null;
let mermaidSeq = 0;

function loadMermaid() {
  if (!mermaidLoad) {
    mermaidLoad = import("mermaid").then((m) => {
      m.default.initialize({ startOnLoad: false, securityLevel: "strict", theme: "neutral", fontFamily: "inherit" });
      return m.default;
    });
  }
  return mermaidLoad;
}

export function Markdown({ text, path, anchor }: { text: string; path: string; anchor?: string | null }) {
  const { docs } = useData();
  const ref = useRef<HTMLDivElement>(null);
  const docPaths = useMemo(() => new Set(docs.map((d) => d.path)), [docs]);
  const html = useMemo(() => DOMPurify.sanitize(marked.parse(text, { async: false, gfm: true }) as string, { FORBID_TAGS: ["style", "form", "input", "button", "textarea", "select"] }), [text]);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    // heading anchors (GitHub style, duplicates numbered)
    const used = new Map<string, number>();
    el.querySelectorAll("h1, h2, h3, h4, h5, h6").forEach((h) => {
      const base = slug(h.textContent ?? "");
      const n = used.get(base) ?? 0;
      used.set(base, n + 1);
      h.id = n ? `${base}-${n}` : base;
    });
    // links
    el.querySelectorAll("a[href]").forEach((a) => {
      const raw = a.getAttribute("href") ?? "";
      if (/^(https?:|mailto:)/.test(raw)) {
        a.setAttribute("target", "_blank");
        a.setAttribute("rel", "noopener noreferrer");
        return;
      }
      if (raw.startsWith("#")) {
        a.setAttribute("href", href.doc(path, raw.slice(1)));
        return;
      }
      const [file, frag] = raw.split("#");
      let decoded = file;
      try {
        decoded = decodeURI(file);
      } catch {
        /* keep it as written */
      }
      let target = resolvePath(path, decoded);
      if (target.endsWith("/")) target += "README.md";
      if (target.endsWith(".md") && docPaths.has(target)) a.setAttribute("href", href.doc(target, frag));
      else if (docPaths.has(target + "/README.md")) a.setAttribute("href", href.doc(target + "/README.md", frag));
      else a.setAttribute("href", href.source(target.replace(/\/README\.md$/, "/README.md")));
    });
    // mermaid
    const blocks = [...el.querySelectorAll("pre > code.language-mermaid")];
    if (blocks.length) {
      loadMermaid()
        .then(async (mermaid) => {
          for (const code of blocks) {
            const pre = code.parentElement!;
            try {
              const { svg } = await mermaid.render(`mmd-${++mermaidSeq}`, code.textContent ?? "");
              const fig = document.createElement("figure");
              fig.className = "mermaid";
              fig.innerHTML = DOMPurify.sanitize(svg, { USE_PROFILES: { svg: true, svgFilters: true, html: true }, ADD_TAGS: ["foreignObject"] });
              pre.replaceWith(fig);
            } catch {
              pre.classList.add("mermaid-error");
            }
          }
        })
        .catch(() => {
          /* diagrams stay as source */
        });
    }
  }, [html, path, docPaths]);

  useEffect(() => {
    if (!anchor) return;
    const t = window.setTimeout(() => document.getElementById(anchor)?.scrollIntoView({ block: "start" }), 50);
    return () => window.clearTimeout(t);
  }, [anchor, html]);

  return (
    <div
      ref={ref}
      className="markdown"
      onClick={(e) => {
        const a = (e.target as HTMLElement).closest("a");
        const h = a?.getAttribute("href");
        if (a && h && h.startsWith("#/doc/") && h.includes("?h=") && decodeURIComponent(h).startsWith(`#/doc/${path}`)) {
          e.preventDefault();
          go(h);
          const id = new URLSearchParams(h.split("?")[1]).get("h");
          if (id) document.getElementById(id)?.scrollIntoView({ block: "start" });
        }
      }}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}
