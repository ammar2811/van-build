#!/usr/bin/env node
/**
 * Fails when the production build grows past its size budgets. Sizes are gzipped, which is
 * roughly what a visitor downloads.
 *
 *   initial   everything the first paint waits for: the entry script, the scripts it
 *             preloads, and the stylesheet
 *   lazy      chunks loaded only when needed (3D view, PDF export, accounts)
 *
 * Raise a budget only on purpose, with the reason in the commit message.
 *
 * Usage: node scripts/check-budgets.mjs apps/web/dist
 */
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { gzipSync } from "node:zlib";

const KB = 1000;
const BUDGETS = {
  initialJs: 160 * KB,
  initialCss: 9 * KB,
  lazy: {
    Scene3D: 270 * KB,
    pdf: 140 * KB,
    supabaseBackend: 65 * KB,
  },
};

const dist = process.argv[2] ?? "apps/web/dist";
const html = readFileSync(join(dist, "index.html"), "utf8");
const gz = (path) => gzipSync(readFileSync(join(dist, path))).length;
const assets = readdirSync(join(dist, "assets"));

const initialScripts = [
  ...html.matchAll(/<script[^>]+src="\/([^"]+\.js)"/g),
  ...html.matchAll(/<link[^>]+rel="modulepreload"[^>]+href="\/([^"]+\.js)"/g),
].map((m) => m[1]);
const initialStyles = [
  ...html.matchAll(/<link[^>]+rel="stylesheet"[^>]+href="\/([^"]+\.css)"/g),
].map((m) => m[1]);

const rows = [];
let failed = false;
const check = (name, size, budget) => {
  const over = size > budget;
  failed ||= over;
  rows.push(
    `${over ? "OVER" : "ok  "}  ${name.padEnd(18)} ${(size / KB).toFixed(1).padStart(7)} kB  of ${(budget / KB).toFixed(0)} kB`,
  );
};

check(
  "initial JS",
  initialScripts.reduce((sum, file) => sum + gz(file), 0),
  BUDGETS.initialJs,
);
check(
  "initial CSS",
  initialStyles.reduce((sum, file) => sum + gz(file), 0),
  BUDGETS.initialCss,
);
for (const [prefix, budget] of Object.entries(BUDGETS.lazy)) {
  const file = assets.find((name) => name.startsWith(`${prefix}-`) && name.endsWith(".js"));
  if (!file) {
    rows.push(`MISSING  ${prefix}: no chunk found, was the build configured for it?`);
    failed = true;
    continue;
  }
  check(prefix, gz(join("assets", file)), budget);
}

console.log(rows.join("\n"));
if (failed) {
  console.error("\nThe build is over budget.");
  process.exit(1);
}
