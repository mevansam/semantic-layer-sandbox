// Build Semantic Studio into build/site (the data in build/site/data comes from the exporter: make studio-data).
//   node build.mjs           production build
//   node build.mjs --serve   rebuild on change and serve on http://localhost:5173 (SPARQL: run the studio
//                            server too and point config.json's sparqlEndpoint at it, see README)
import * as esbuild from "esbuild";
import { cpSync, existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const out = join(here, "build", "site");
const serve = process.argv.includes("--serve");

mkdirSync(out, { recursive: true });
rmSync(join(out, "assets"), { recursive: true, force: true });
cpSync(join(here, "public"), out, { recursive: true });
// Where the SPARQL endpoint is. "sparql" = served next to the site by server/studio_server.py.
// On a static host without the server, set it to the URL of a running studio server, or "" to hide queries.
if (!existsSync(join(out, "config.json"))) {
  writeFileSync(join(out, "config.json"), JSON.stringify({ sparqlEndpoint: "sparql" }, null, 1) + "\n");
}

const options = {
  entryPoints: [join(here, "src", "main.tsx")],
  bundle: true,
  splitting: true,
  format: "esm",
  outdir: join(out, "assets"),
  entryNames: "[name]",
  chunkNames: "chunks/[name]-[hash]",
  minify: !serve,
  sourcemap: serve ? "inline" : false,
  target: ["es2022"],
  jsx: "automatic",
  loader: { ".css": "css" },
  define: { "process.env.NODE_ENV": serve ? '"development"' : '"production"' },
  logLevel: "info",
};

if (serve) {
  const ctx = await esbuild.context(options);
  await ctx.watch();
  const { port } = await ctx.serve({ servedir: out, port: 5173 });
  console.log(`Semantic Studio (dev): http://localhost:${port}/`);
} else {
  await esbuild.build(options);
  if (!existsSync(join(out, "data", "meta.json"))) {
    console.warn("Note: build/site/data is empty - run `make studio-data` (or `make studio`) to export the data.");
  }
}
