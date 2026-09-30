#!/usr/bin/env bash
# Fetch FIBO's external dependencies (OMG Commons Ontology Library and LCC) into
# vendor/omg/ and write vendor/omg/catalog-v001.xml so builds resolve them offline.
#
# FIBO (since 2024) imports OMG Commons and LCC modules by IRI from www.omg.org.
# `make` runs it automatically (once per FIBO pin) before any target that reasons;
# running it by hand is never required. Re-runs reuse files already fetched.
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

def fetch(iri, target):
    r = subprocess.run(["curl", "-fsL", "--connect-timeout", "10", "--max-time", "60", "--retry", "2",
                        "-H", "Accept: application/rdf+xml", "-o", str(target), iri], capture_output=True)
    return r.returncode == 0

def valid(target):
    return target.exists() and b"<rdf:RDF" in target.read_bytes()[:4000]

if not queue:
    sys.exit("FIBO is not checked out in vendor/fibo (nothing to resolve)")

# Fail fast when www.omg.org is not reachable, instead of trying every module.
probe = sorted(queue)[0]
probe_target = out / (probe.split("/spec/", 1)[1].strip("/") + ".rdf")
probe_target.parent.mkdir(parents=True, exist_ok=True)
if not valid(probe_target) and not fetch(probe, probe_target):
    probe_target.unlink(missing_ok=True)
    sys.exit(f"cannot reach www.omg.org ({probe}); OMG Commons/LCC not fetched")

done, entries, failed = set(), [], []
while queue:
    iri = queue.pop()
    if iri in done:
        continue
    done.add(iri)
    rel = iri.split("/spec/", 1)[1].strip("/") + ".rdf"
    target = out / rel
    target.parent.mkdir(parents=True, exist_ok=True)
    if not valid(target):   # re-runs reuse what was fetched before
        fetch(iri, target)
    if not valid(target):
        target.unlink(missing_ok=True)
        failed.append(iri)
        continue
    entries.append((iri, rel))
    queue |= set(imp.findall(target.read_text(errors="ignore"))) - done

cat = ['<?xml version="1.0" encoding="UTF-8"?>',
       '<catalog prefer="public" xmlns="urn:oasis:names:tc:entity:xmlns:xml:catalog">']
cat += [f'  <uri name="{su.escape(i)}" uri="./{su.escape(r)}"/>' for i, r in sorted(entries)]
cat.append("</catalog>")
(out / "catalog-v001.xml").write_text("\n".join(cat) + "\n")
print(f"{len(entries)} OMG ontologies in vendor/omg; catalog written")
if failed:
    print(f"could not fetch {len(failed)} of {len(done)} OMG ontologies, e.g. {sorted(failed)[0]}", file=sys.stderr)
    sys.exit(1)
PY
