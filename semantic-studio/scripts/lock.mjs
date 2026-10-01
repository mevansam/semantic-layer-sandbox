// Regenerate package-lock.json so that every package, direct and transitive, is a version published at least
// STUDIO_MIN_AGE_HOURS (default 72) hours ago, or check that the current lock file meets that rule.
//
//   node scripts/lock.mjs           re-resolve everything under the age rule and rewrite package-lock.json
//   node scripts/lock.mjs --check   check every locked version's publish time (asks the registry); exit 1 if any is too new
//
// Uses your npm configuration (registry, proxy, credentials), so it works through the enterprise npm proxy.
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = join(dirname(fileURLToPath(import.meta.url)), "..");
const hours = Number(process.env.STUDIO_MIN_AGE_HOURS ?? 72);
const cutoff = new Date(Date.now() - hours * 3600 * 1000);
const npm = process.platform === "win32" ? "npm.cmd" : "npm";
const run = (args, opts = {}) => execFileSync(npm, args, { cwd: here, encoding: "utf8", ...opts });

function npmVersion() {
  const [maj, min] = run(["--version"]).trim().split(".").map(Number);
  return { maj, min };
}

async function check() {
  const lock = JSON.parse(readFileSync(join(here, "package-lock.json"), "utf8"));
  const wanted = new Map(); // name -> set of versions
  for (const [path, pkg] of Object.entries(lock.packages ?? {})) {
    if (!path || !pkg.version || pkg.link) continue;
    const name = pkg.name ?? path.slice(path.lastIndexOf("node_modules/") + "node_modules/".length);
    if (!wanted.has(name)) wanted.set(name, new Set());
    wanted.get(name).add(pkg.version);
  }
  const names = [...wanted.keys()].sort();
  console.log(`Checking ${names.length} packages against ${cutoff.toISOString()} (${hours} h ago)...`);
  const tooNew = [], unknown = [];
  let i = 0;
  async function worker() {
    while (i < names.length) {
      const name = names[i++];
      let times;
      try {
        times = JSON.parse(run(["view", name, "time", "--json"], { stdio: ["ignore", "pipe", "ignore"] }));
      } catch {
        unknown.push(name);
        continue;
      }
      for (const v of wanted.get(name)) {
        const t = times?.[v] ? new Date(times[v]) : null;
        if (!t) unknown.push(`${name}@${v}`);
        else if (t > cutoff) tooNew.push(`${name}@${v} (published ${t.toISOString()})`);
      }
    }
  }
  await Promise.all(Array.from({ length: 8 }, worker));
  for (const x of tooNew) console.log(`TOO NEW  ${x}`);
  for (const x of unknown) console.log(`UNKNOWN  ${x} (registry gave no publish time)`);
  if (tooNew.length) {
    console.log(`\n${tooNew.length} locked versions are newer than ${hours} hours. Run: make studio-lock`);
    process.exit(1);
  }
  console.log(`OK: every locked version was published before ${cutoff.toISOString()}${unknown.length ? ` (${unknown.length} unknown)` : ""}.`);
}

function lock() {
  const { maj, min } = npmVersion();
  // min-release-age (npm >= 11.10, set in .npmrc) and --before can't be combined: use whichever this npm has.
  const gate = maj > 11 || (maj === 11 && min >= 10) ? [`--min-release-age=${Math.ceil(hours / 24)}`] : [`--before=${cutoff.toISOString()}`];
  const file = join(here, "package-lock.json");
  const previous = existsSync(file) ? readFileSync(file) : null;
  if (previous) rmSync(file); // otherwise npm keeps the versions already locked
  console.log(`Resolving every dependency as of ${cutoff.toISOString()} (${hours} h ago): npm install --package-lock-only ${gate.join(" ")}`);
  try {
    run(["install", "--package-lock-only", "--no-audit", "--no-fund", ...gate], { stdio: "inherit" });
  } catch {
    if (previous) writeFileSync(file, previous);
    console.error("npm could not resolve the dependencies under the age rule; package-lock.json is unchanged.");
    console.error("If a version pinned in package.json is too new, pick an older one and run this again.");
    process.exit(1);
  }
  console.log("package-lock.json rewritten. Check it with `make studio-lock-check`, then commit it.");
}

if (process.argv.includes("--check")) await check();
else lock();
