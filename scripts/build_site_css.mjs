#!/usr/bin/env node
// Precompiles the Tailwind utilities actually used in site/index.html and
// inlines the result into a <style id="tailwind-precompiled"> block, replacing
// the previous run's output. This replaces the Tailwind Play CDN runtime
// compiler (cdn.tailwindcss.com), which is explicitly not supported for
// production use and was recompiling the page's CSS in every visitor's
// browser on every load.
//
// Run after ANY change to Tailwind classes in site/index.html:
//   npm run build:site-css
//
// This keeps site/index.html (the Vercel static deploy) and
// webstaffr/templates/netbuild_pro.html (the FastAPI-served copy, must stay
// byte-identical per tests/test_landing_page.py) in sync.
//
// --check: don't write anything. Recompiles into memory, compares against
// what's currently inlined, and exits non-zero if they differ (i.e. someone
// edited a Tailwind class in site/index.html without re-running the build).
// Exposed as `npm run check:site-css` (kept separate from check:site-magic,
// which checks the unrelated site-generation engine, not this landing page).
//   npm run check:site-css

import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { gzipSync } from "node:zlib";

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(__dirname, "..");
const SITE_HTML = join(REPO_ROOT, "site", "index.html");
const TEMPLATE_HTML = join(REPO_ROOT, "webstaffr", "templates", "netbuild_pro.html");
const TAILWIND_CONFIG = join(REPO_ROOT, "tailwind.config.js");
const CHECK_ONLY = process.argv.includes("--check");

const START_TAG = '<style id="tailwind-precompiled">';
const END_TAG = "</style>";

function extractCompiledBlock(html) {
  const start = html.indexOf(START_TAG);
  if (start === -1) throw new Error(`Could not find ${START_TAG} in ${SITE_HTML}`);
  const contentStart = start + START_TAG.length;
  const end = html.indexOf(END_TAG, contentStart);
  if (end === -1) throw new Error("Could not find closing </style> for tailwind-precompiled block");
  return { start, contentStart, end };
}

const html = readFileSync(SITE_HTML, "utf8");
const { start, contentStart, end } = extractCompiledBlock(html);

const tmp = mkdtempSync(join(tmpdir(), "tw-build-"));
try {
  // Tailwind's class-name extractor scans raw text for candidate strings, so
  // scanning the full HTML file directly (including the React.createElement
  // source) picks up arbitrary-value classes like bg-[#1A1A2E] correctly.
  writeFileSync(join(tmp, "input.css"), "@tailwind base;\n@tailwind components;\n@tailwind utilities;\n");
  execFileSync(
    "npx",
    [
      "tailwindcss",
      "-i", join(tmp, "input.css"),
      "-o", join(tmp, "output.css"),
      "--minify",
      "-c", TAILWIND_CONFIG,
    ],
    { cwd: REPO_ROOT, stdio: "inherit" }
  );
  const css = readFileSync(join(tmp, "output.css"), "utf8").trim();
  const currentCss = html.slice(contentStart, end).trim();

  if (CHECK_ONLY) {
    if (css === currentCss) {
      console.log(`site-css up to date (${css.length} bytes compiled, ${gzipSize(css)} bytes gzipped).`);
      process.exit(0);
    }
    console.error(
      "site-css is STALE: the Tailwind classes in site/index.html don't match the inlined " +
      "<style id=\"tailwind-precompiled\"> block. Run `npm run build:site-css` and commit the result."
    );
    process.exit(1);
  }

  const newHtml =
    html.slice(0, contentStart) + "\n" + css + "\n  " + html.slice(end);

  writeFileSync(SITE_HTML, newHtml);
  writeFileSync(TEMPLATE_HTML, newHtml);
  console.log(`Wrote ${css.length} bytes of compiled CSS (${gzipSize(css)} bytes gzipped) to:`);
  console.log(`  ${SITE_HTML}`);
  console.log(`  ${TEMPLATE_HTML}`);
} finally {
  rmSync(tmp, { recursive: true, force: true });
}

function gzipSize(str) {
  return gzipSync(Buffer.from(str, "utf8")).length;
}
