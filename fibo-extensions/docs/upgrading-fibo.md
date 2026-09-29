# Upgrading FIBO

FIBO publishes quarterly production releases, tagged `master_YYYYQn`. We upgrade at most once a quarter.

```bash
cd vendor/fibo
git fetch --depth 1 origin tag master_2026Q3
git checkout master_2026Q3
cd ../..
git config -f .gitmodules submodule.vendor/fibo.branch master_2026Q3
bash scripts/fetch-omg-dependencies.sh     # Commons / LCC may have moved too
# update the pinned tag in enterprise-semantic-governance/semantic.yaml (fibo.release_tag)
make verify   # from the repository root: every repo and sub-domain against the new FIBO
```

Then run **every registered domain's CI** against the upgrade branch, using the `fibo-extensions-ref` input of the reusable workflow. The upgrade PR must list:

- FIBO release notes relevant to profile modules: deprecated or moved terms, and changed parents.
- Domain classes whose FIBO parent was deprecated. The owning domains fix these before merge.
- Any new profile modules proposed.
