#!/usr/bin/env python3
"""Self-test for semtool: proves every validation check still catches what it is meant to catch.

    python enterprise-semantic-governance/tools/tests/selftest.py            # all scenarios
    python enterprise-semantic-governance/tools/tests/selftest.py -k D4 E3  # scenarios whose id contains D4 or E3
    make selftest

Each scenario copies the repository into a temporary folder (FIBO's vendor folder is not copied),
seeds ONE defect, runs one semtool command against the affected repository, and expects it to fail
with a specific finding. The clean copy must pass first; otherwise the test is meaningless.

Run it after changing semtool.py, a meta-shape or the structure standard. Add a scenario whenever
you add a check (see docs/framework/08-validation-tooling.md, "Extending the tooling").
"""
from __future__ import annotations

import argparse
import re
import shutil
import subprocess
import sys
import tempfile
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]          # monorepo root
GOV = "enterprise-semantic-governance"
FX = "fibo-extensions"
RWM = "domains/retail-wealth-management"
FP = f"{RWM}/financial-planning"
IA = f"{RWM}/insights-and-analytics"
NS = "https://ontology.example.com/"


# ---- mutation helpers ------------------------------------------------------------------------

def sub(w: Path, path: str, old: str, new: str, regex: bool = False):
    p = w / path
    s = p.read_text()
    if regex:
        s2, n = re.subn(old, new, s, count=1)
    else:
        n = s.count(old)
        s2 = s.replace(old, new, 1)
    if n == 0:
        raise AssertionError(f"mutation target not found in {path}: {old[:60]!r}")
    p.write_text(s2)


def append(w: Path, path: str, text: str):
    with (w / path).open("a") as fh:
        fh.write(text)


def remove_block(w: Path, path: str, start: str):
    """Remove the Turtle block that starts with `start` and ends at the next ' .' line end."""
    p = w / path
    s = p.read_text()
    m = re.search(re.escape(start) + r"[\s\S]*?\s\.\n", s)
    if not m:
        raise AssertionError(f"block {start!r} not found in {path}")
    p.write_text(s[:m.start()] + s[m.end():])


def bump_collection(w: Path, sd: str, new: str):
    p = w / sd / "collections/collections.ttl"
    s = p.read_text()
    s = re.sub(r'(a ent-fab:KnowledgeCollection ;[\s\S]*?owl:versionInfo )"[^"]+"', rf'\1"{new}"', s, count=1)
    s = re.sub(r"/v\d+\.\d+\.\d+/", f"/v{new}/", s)
    p.write_text(s)


def bump_module(w: Path, path: str, old: str, new: str):
    p = w / path
    s = p.read_text().replace(f'owl:versionInfo "{old}"', f'owl:versionInfo "{new}"', 1)
    s = re.sub(rf"/{re.escape(old)}/>", f"/{new}/>", s, count=1)
    p.write_text(s)


NEW_CLASS = """
fp:EducationGoal a owl:Class ;
    rdfs:label "education goal"@en ;
    skos:definition "financial goal to fund a person's education"@en ;
    rdfs:subClassOf fp:FinancialGoal .
"""


# ---- scenarios: (id, repository, command, mutation, expected text in a FAIL line) -------------
# command "changes" runs against a git baseline of the unmutated copy.

SCENARIOS = [
    # G8 drift
    ("D1 version IRI out of step", FP, "drift",
     lambda w: sub(w, f"{FP}/ontology/planning.ttl", 'owl:versionInfo "0.1.0"', 'owl:versionInfo "0.2.0"'), "D1"),
    ("D2 code differs from registry", FP, "drift",
     lambda w: sub(w, f"{FP}/semantic.yaml", "code: rwm-fp", "code: rwm-fx"), "D2"),
    ("D2 template answers differ", FP, "drift",
     lambda w: sub(w, f"{FP}/.copier-answers.yml", "domain_name: Financial Planning", "domain_name: Planning and Guidance"), "D2"),
    ("D2 registry still Reserved", FP, "drift",
     lambda w: sub(w, f"{FX}/registry/domain-registry.ttl", r'(ent-reg:rwm-fp[\s\S]*?registrationStatus )"Provisional"',
                   r'\1"Reserved"', regex=True), "D2"),
    ("D3 module missing from manifest", IA, "drift",
     lambda w: sub(w, f"{IA}/domain-manifest.ttl", f" ,\n        <{NS}domain/retail-wealth-management/insights-and-analytics/assessments/>", ""), "D3"),
    ("D4 import without declared dependency", IA, "drift",
     lambda w: sub(w, f"{IA}/semantic.yaml", "dependencies:\n  - ../financial-planning", "dependencies: []"), "D4"),
    ("D4 declared dependency not in manifest", FP, "drift",
     lambda w: sub(w, f"{FP}/semantic.yaml", "dependencies: []", "dependencies:\n  - ../insights-and-analytics"), "D4"),
    ("D5 collection version without graph names", FP, "drift",
     lambda w: sub(w, f"{FP}/collections/collections.ttl", '    owl:versionInfo "0.1.0" ;\n    ent-fab:sensitivity',
                   '    owl:versionInfo "0.2.0" ;\n    ent-fab:sensitivity'), "D5"),
    ("D6 unlisted sub-domain folder", RWM, "drift",
     lambda w: shutil.copytree(w / FP, w / RWM / "new-sub"), "D6"),
    ("D6 umbrella misses a published module", RWM, "drift",
     lambda w: sub(w, f"{RWM}/domain.ttl", f" ,\n        <{NS}domain/retail-wealth-management/insights-and-analytics/insights/> ;", " ;"), "D6"),
    ("D7 published module does not exist", FX, "drift",
     lambda w: sub(w, f"{FX}/registry/domain-registry.ttl", "financial-planning/planning/> ;", "financial-planning/plans/> ;"), "D7"),
    ("D7 umbrella imports unregistered domain", FX, "drift",
     lambda w: sub(w, f"{FX}/ontology/ontology-domains/investment-servicing.ttl",
                   f"owl:imports <{NS}domain/retail-wealth-management/> ;",
                   f"owl:imports <{NS}domain/retail-wealth-management/> , <{NS}domain/robo-advice/> ;"), "D7"),
    ("D8 alignment register points at missing term", GOV, "drift",
     lambda w: sub(w, f"{GOV}/alignment/alignment-register.ttl", "insights/SelfDirectedInsight", "insights/SelfDirectedTip"), "D8"),
    ("D9 curation not in step with folders", GOV, "drift",
     lambda w: sub(w, f"{GOV}/capabilities/curation.yaml", "    - name: Insights and Analytics\n      slug: insights-and-analytics\n", ""), "D9"),
    ("D9 CODEOWNERS edited by hand", GOV, "drift",
     lambda w: sub(w, f"{FP}/CODEOWNERS", "@example-org/semantic-review-board", "@example-org/someone-else"), "D9"),
    ("D9 taxonomy source changed, not regenerated", GOV, "drift",
     lambda w: sub(w, f"{GOV}/taxonomy/source/enterprise-taxonomy.md", "Customers", "Clients & Customers"), "D9"),
    ("D10 FIBO pin mismatch", GOV, "drift",
     lambda w: sub(w, f"{FX}/.gitmodules", "branch = master_2026Q2", "branch = master_2026Q1"), "D10"),
    ("D10 upstream defects not re-validated for the FIBO release", GOV, "drift",
     lambda w: sub(w, f"{FX}/profile/upstream-issues.yaml", "fibo_release: master_2026Q2", "fibo_release: master_2026Q1"), "D10"),
    # G3 extension rules
    ("E1 statement about a FIBO term", FP, "extensions",
     lambda w: append(w, f"{FP}/ontology/planning.ttl",
                      '\n<https://spec.edmcouncil.org/fibo/ontology/FND/GoalsAndObjectives/Objectives/FinancialObjective> '
                      'rdfs:label "goal"@en .\n'), "E1"),
    ("E2 minting in a sibling's namespace", IA, "extensions",
     lambda w: append(w, f"{IA}/ontology/insights.ttl", f'\n<{NS}domain/retail-wealth-management/financial-planning/planning/Nudge> '
                      'a owl:Class ; rdfs:label "nudge"@en .\n'), "E2"),
    ("E3 import of an unpublished module", IA, "extensions",
     lambda w: sub(w, f"{IA}/ontology/insights.ttl", r"(owl:imports[^;]*?financial-planning/)planning/>", r"\1unpublished/>",
                   regex=True), "E3"),
    ("E3 import of an ontology-domain umbrella", FP, "extensions",
     lambda w: sub(w, f"{FP}/ontology/planning.ttl", f"owl:imports <{NS}fibo-ext/core/>",
                   f"owl:imports <{NS}fibo-ext/core/> , <{NS}ontology-domain/investment-servicing/>"), "E3"),
    # G2 standards
    ("G2 dependency cycle", FP, "meta",
     lambda w: (sub(w, f"{FP}/semantic.yaml", "dependencies: []", "dependencies:\n  - ../insights-and-analytics"),
                sub(w, f"{FP}/domain-manifest.ttl", "a ent-gov:DomainManifest ;",
                    f"a ent-gov:DomainManifest ;\n    ent-gov:dependsOnSubDomain <{NS}capability/domain/investment-servicing/"
                    "retail-wealth-management/insights-and-analytics> ;")), "meta-shapes"),
    ("G2 business rule without a policy source", FP, "meta",
     lambda w: sub(w, f"{FP}/rules/business-rules.ttl", r'\n    ent-av:policySource "[^"]*" ;', "", regex=True), "meta-shapes"),
    # G1 structure
    ("G1 negative test not listed", FP, "structure",
     lambda w: (w / FP / "tests/negative/nc-004-orphan.ttl").write_text("# orphan\n"), "structure"),
    ("G1 negative test numbered for another rule", FP, "structure",
     lambda w: sub(w, f"{FP}/tests/negative/expectations.yaml", "expect_violations: [FP-R-003]", "expect_violations: [FP-R-001]"), "structure"),
    # G5 rules
    ("G5 negative case no longer trips its rule", FP, "rules",
     lambda w: sub(w, f"{FP}/rules/business-rules.ttl", r"(FP-R-003  Projection[\s\S]*?sh:maxInclusive )1 ", r"\g<1>100 ", regex=True), "negative case"),
    # PR change-class check (git baseline = unmutated copy)
    ("PR added class without a version bump", FP, "changes --strict",
     lambda w: append(w, f"{FP}/ontology/planning.ttl", NEW_CLASS), "needs a minor version bump"),
    ("PR knowledge changed, collection not bumped", FP, "changes --strict",
     lambda w: (append(w, f"{FP}/ontology/planning.ttl", NEW_CLASS),
                bump_module(w, f"{FP}/ontology/planning.ttl", "0.1.0", "0.2.0")), "collection version was not bumped"),
    ("PR removed term needs a bump", IA, "changes --strict",
     lambda w: remove_block(w, f"{IA}/ontology/insights.ttl", "ia:SuggestedAction a owl:Class"), "major change"),
    ("PR meta-shape changed without an ADR", GOV, "changes",
     lambda w: sub(w, f"{GOV}/shapes/meta-common.ttl", "Every ontology needs an rdfs:label.", "Every ontology needs a label."), "without an ADR"),
]

# Scenarios that must PASS after a correct change (guards against false positives)
CLEAN_CHANGES = [
    ("PR additive change done right", FP, "changes --strict",
     lambda w: (append(w, f"{FP}/ontology/planning.ttl", NEW_CLASS),
                bump_module(w, f"{FP}/ontology/planning.ttl", "0.1.0", "0.2.0"),
                bump_collection(w, FP, "0.2.0"))),
]


# ---- runner ---------------------------------------------------------------------------------------

def copy_repo(dest: Path):
    ignore = shutil.ignore_patterns(".git", "vendor", "venv", "build", "_template-check", "__pycache__", "*.tar.gz", "node_modules")
    shutil.copytree(ROOT, dest, ignore=ignore)
    (dest / FX / "vendor").mkdir(exist_ok=True)


def git(w: Path, *a):
    subprocess.run(["git", "-C", str(w), *a], check=True, capture_output=True)


def run(w: Path, repo: str, command: str):
    cmd = [sys.executable, str(w / GOV / "tools/semtool.py"), *command.split()[:1], "--repo", str(w / repo), *command.split()[1:]]
    if command.startswith("changes"):
        cmd += ["--base", "HEAD"]
    r = subprocess.run(cmd, capture_output=True, text=True)
    return r.returncode, r.stdout + r.stderr


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("-k", nargs="*", help="only scenarios whose id contains one of these strings")
    a = ap.parse_args()
    pick = lambda sid: not a.k or any(k.lower() in sid.lower() for k in a.k)  # noqa: E731
    failures = 0
    t0 = time.time()
    results = []
    if not a.k:   # a full run replaces the report; one that stops early must not leave the previous one behind
        (ROOT / "build" / "reports" / "selftest.json").unlink(missing_ok=True)
    with tempfile.TemporaryDirectory() as tmp:
        base = Path(tmp) / "base"
        copy_repo(base)
        git(base, "init", "-q")
        git(base, "add", "-A")
        git(base, "-c", "user.name=selftest", "-c", "user.email=selftest@example.com", "commit", "-qm", "baseline")
        # 1. the unmutated copy must pass every command we use
        for repo, command in sorted({(r, c) for _, r, c, *_ in SCENARIOS + CLEAN_CHANGES}):
            if not any(pick(s[0]) for s in SCENARIOS + CLEAN_CHANGES if (s[1], s[2]) == (repo, command)):
                continue
            rc, out = run(base, repo, command)
            if rc != 0:
                print(f"BASELINE FAILS  {command} --repo {repo}\n{out[-1500:]}")
                return 2
        # 2. each defect is caught; each correct change passes
        for sid, repo, command, mutate, *expect in SCENARIOS + CLEAN_CHANGES:
            if not pick(sid):
                continue
            w = Path(tmp) / "w"
            if w.exists():
                shutil.rmtree(w)
            shutil.copytree(base, w, symlinks=True)
            mutate(w)
            rc, out = run(w, repo, command)
            fails = [ln for ln in out.splitlines() if ln.startswith("FAIL") or ln.strip().startswith(("[violation]",))
                     or "must " in ln or "not listed" in ln]
            if expect:
                ok = rc != 0 and any(expect[0] in ln for ln in out.splitlines() if not ln.startswith("PASS"))
                label = "CAUGHT " if ok else "MISSED "
            else:
                ok = rc == 0
                label = "PASSES " if ok else "REJECTED"
            failures += not ok
            detail = next((ln.strip()[:110] for ln in fails), "") if expect else ""
            print(f"{label} {sid:<48} {detail}")
            results.append({"id": sid, "repo": repo, "command": command, "kind": "defect" if expect else "clean-change",
                            "outcome": label.strip(), "ok": ok, "detail": detail})
            if not ok:
                print("        " + "\n        ".join(out.strip().splitlines()[-8:]))
    total = sum(1 for s in SCENARIOS + CLEAN_CHANGES if pick(s[0]))
    print(f"\n{'OK' if not failures else 'FAILED'}: {total - failures}/{total} scenarios behave as expected "
          f"({time.time() - t0:.0f}s)")
    if not a.k:   # a full run leaves a report for semantic-studio's Health page (build/ is git-ignored)
        import datetime
        import json
        head = subprocess.run(["git", "-C", str(ROOT), "rev-parse", "HEAD"], capture_output=True, text=True).stdout.strip()
        out = ROOT / "build" / "reports" / "selftest.json"
        out.parent.mkdir(parents=True, exist_ok=True)
        out.write_text(json.dumps({"command": "selftest", "finished": datetime.datetime.now(datetime.timezone.utc)
                                   .strftime("%Y-%m-%dT%H:%M:%SZ"), "commit": head or None, "passed": not failures,
                                   "total": total, "failures": failures, "scenarios": results}, indent=1) + "\n")
    return 1 if failures else 0


if __name__ == "__main__":
    sys.exit(main())
