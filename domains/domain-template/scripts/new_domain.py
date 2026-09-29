#!/usr/bin/env python3
"""Scaffold a new domain repository from this template without Copier.

    python scripts/new_domain.py --answers answers.yaml --out ../<business-domain>/<sub-domain>

Sub-domains live at domains/<business-domain>/<sub-domain>. If the business-domain folder
has no parent layer yet (domain.ttl, semantic.yaml, README.md), it is scaffolded from
parent-template/; otherwise the new sub-domain is added to its semantic.yaml and you are
told what to add to domain.ttl.

`answers.yaml` holds values for the questions in copier.yml; anything omitted
takes the copier.yml default. File and directory names may contain Jinja
expressions; files ending in `.jinja` are rendered and the suffix dropped,
exactly as Copier does, so repos created either way are identical.
"""
import argparse
import shutil
import subprocess
from pathlib import Path

import yaml
from jinja2 import Environment, StrictUndefined

HERE = Path(__file__).resolve().parent.parent


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--answers", help="YAML file with answers (defaults from copier.yml)")
    ap.add_argument("--out", required=True)
    ap.add_argument("--no-git", action="store_true")
    a = ap.parse_args()

    spec = yaml.safe_load((HERE / "copier.yml").read_text())
    ctx = {k: v.get("default") for k, v in spec.items() if not k.startswith("_") and isinstance(v, dict)}
    if a.answers:
        ctx.update(yaml.safe_load(Path(a.answers).read_text()) or {})

    env = Environment(undefined=StrictUndefined, keep_trailing_newline=True)
    for k, v in spec.items():   # derived questions (when: false) are rendered, like Copier does
        if isinstance(v, dict) and v.get("when") is False and isinstance(v.get("default"), str):
            ctx[k] = env.from_string(v["default"]).render(**ctx)
    src = HERE / spec.get("_subdirectory", "template")
    out = Path(a.out).resolve()
    if out.exists() and any(out.iterdir()):
        raise SystemExit(f"{out} exists and is not empty")
    out.mkdir(parents=True, exist_ok=True)

    for p in sorted(src.rglob("*")):
        rel = env.from_string(str(p.relative_to(src))).render(**ctx)
        dest = out / rel
        if p.is_dir():
            dest.mkdir(parents=True, exist_ok=True)
            continue
        dest.parent.mkdir(parents=True, exist_ok=True)
        if p.suffix == ".jinja":
            dest = dest.with_suffix("")
            dest.write_text(env.from_string(p.read_text()).render(**ctx))
        else:
            shutil.copy2(p, dest)

    scaffold_parent(env, ctx, out)
    (out / ".copier-answers.yml").write_text(
        "# Answers used to generate this repository from domain-template\n" + yaml.safe_dump(ctx, sort_keys=True))
    if not a.no_git:
        subprocess.run(["git", "init", "-q", "-b", "main", str(out)], check=True)
    print(f"Scaffolded {out}. Next: run semtool codeowners and semtool verify.")


def scaffold_parent(env, ctx, out: Path):
    """Create or update the business-domain parent layer (the parent-level extension point)."""
    parent = out.parent
    src = HERE / "parent-template"
    created = False
    for p in sorted(src.rglob("*")):
        if p.is_dir():
            continue
        dest = parent / p.relative_to(src)
        dest = dest.with_suffix("") if p.suffix == ".jinja" else dest
        if not dest.exists():
            dest.write_text(env.from_string(p.read_text()).render(**ctx))
            created = True
    cfg_file = parent / "semantic.yaml"
    cfg = yaml.safe_load(cfg_file.read_text())
    if out.name not in (cfg.get("sub_domains") or []):
        text = cfg_file.read_text()
        cfg_file.write_text(text.rstrip() + f"\n  - {out.name}\n" if "sub_domains:" in text
                            else text + f"\nsub_domains:\n  - {out.name}\n")
    if not created:
        print(f"Parent layer {parent.name}/ exists: add to domain.ttl\n"
              f"  - parent manifest: ent-gov:includesSubDomain <{ctx['capability_domain_iri']}>\n"
              f"  - umbrella: owl:imports <{ctx['base_iri']}domain/{ctx['namespace_path']}/{ctx['module_name']}/> (once published)")


if __name__ == "__main__":
    main()
