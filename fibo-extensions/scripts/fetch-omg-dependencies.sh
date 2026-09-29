#!/usr/bin/env bash
# Fetch FIBO's external dependencies (OMG Commons Ontology Library and LCC) into
# vendor/omg/ and write vendor/omg/catalog-v001.xml so builds resolve them offline.
#
# FIBO (since 2024) imports OMG Commons and LCC modules by IRI from www.omg.org.
# Run this once after `git submodule update --init`, and again after bumping FIBO.
# Requires network access to www.omg.org.
set -euo pipefail
cd "$(dirname "$0")/.."
python3 - <<'PY'
import pathlib, re, subprocess, sys, xml.sax.saxutils as su

root = pathlib.Path("vendor")
out = root / "omg"
out.mkdir(parents=True, exist_ok=True)
imp = re.compile(r'owl:imports\s+rdf:resource="(https?://www\.omg\.org/spec/[^"]+)"')

queue = set()
for f in (root / "fibo").rglob("*.rdf"):
    queue |= set(imp.findall(f.read_text(errors="ignore")))

done, entries, failed = set(), [], []
while queue:
    iri = queue.pop()
    if iri in done:
        continue
    done.add(iri)
    rel = iri.split("/spec/", 1)[1].strip("/") + ".rdf"
    target = out / rel
    target.parent.mkdir(parents=True, exist_ok=True)
    r = subprocess.run(["curl", "-fsSL", "-H", "Accept: application/rdf+xml", "-o", str(target), iri])
    if r.returncode != 0 or not target.exists() or b"<rdf:RDF" not in target.read_bytes()[:4000]:
        failed.append(iri)
        continue
    entries.append((iri, rel))
    queue |= set(imp.findall(target.read_text(errors="ignore"))) - done

cat = ['<?xml version="1.0" encoding="UTF-8"?>',
       '<catalog prefer="public" xmlns="urn:oasis:names:tc:entity:xmlns:xml:catalog">']
cat += [f'  <uri name="{su.escape(i)}" uri="./{su.escape(r)}"/>' for i, r in sorted(entries)]
cat.append("</catalog>")
(out / "catalog-v001.xml").write_text("\n".join(cat) + "\n")
print(f"fetched {len(entries)} OMG ontologies into vendor/omg; catalog written")
if failed:
    print("could not fetch:", *failed, sep="\n  ", file=sys.stderr)
    sys.exit(1)
PY
