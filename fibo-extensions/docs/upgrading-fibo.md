# Upgrading FIBO

FIBO publishes quarterly production releases, tagged `master_YYYYQn`. We upgrade at most once a quarter.

From the repository root:

```bash
git -C fibo-extensions/vendor/fibo fetch --depth 1 origin tag master_2026Q3
git -C fibo-extensions/vendor/fibo checkout master_2026Q3
git add fibo-extensions/vendor/fibo                        # records the new pin
git config -f .gitmodules submodule.fibo-extensions/vendor/fibo.branch master_2026Q3
git config -f fibo-extensions/.gitmodules submodule.vendor/fibo.branch master_2026Q3
# set fibo.release_tag: master_2026Q3 in enterprise-semantic-governance/semantic.yaml
make verify hermit        # every repo and sub-domain against the new FIBO
```

Because the pin changed, `make` fetches the new release's OMG Commons/LCC dependencies itself. `make drift` (in `verify`) fails if `.gitmodules`, the checkout and `fibo.release_tag` disagree.

Then run **every registered domain's CI** against the upgrade branch, using the `fibo-extensions-ref` input of the reusable workflow. The upgrade PR must list:

- FIBO release notes relevant to profile modules: deprecated or moved terms, and changed parents.
- Domain classes whose FIBO parent was deprecated. The owning domains fix these before merge.
- Any new profile modules proposed.
