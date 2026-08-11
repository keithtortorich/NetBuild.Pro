import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { request } from "node:http";
import {
  PlaywrightEvidenceRunner,
  runImpeccableDetect,
  EvidenceRunnerError,
  startStaticServer,
} from "../webstaffr/site_magic_evidence_runner.ts";

const WIDTHS = [390, 768, 1440] as const;

async function writeFixture(html: string): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), "site-magic-evidence-"));
  await writeFile(join(dir, "index.html"), html, "utf-8");
  return dir;
}

const CLEAN_HTML = `<!doctype html>
<html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Acme HVAC</title></head>
<body>
  <main>
    <h1>Acme HVAC</h1>
    <p>Licensed heating and cooling in the metro area.</p>
    <a href="/sites/acme-hvac/web/contact">Contact us</a>
  </main>
</body></html>`;

const BROKEN_HTML = `<!doctype html>
<html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Acme HVAC</title>
<script>console.error("boom");</script>
</head>
<body>
  <div style="width:3000px">Lorem ipsum dolor sit amet, this is placeholder copy.</div>
  <img src="missing.png">
</body></html>`;

const TENANT_LEAK_HTML = `<!doctype html>
<html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Acme HVAC</title></head>
<body>
  <h1>Acme HVAC</h1>
  <p>See also our sister site at /sites/other-tenant-999/web for reference.</p>
</body></html>`;

test("runImpeccableDetect throws when the CLI can't run at all, instead of reporting a false clean scan", () => {
  assert.throws(
    () => runImpeccableDetect(process.cwd(), "/nonexistent/detect-cli-that-does-not-exist.mjs"),
    EvidenceRunnerError
  );
});

test("runImpeccableDetect returns a real finding count against the actual detector CLI", () => {
  const count = runImpeccableDetect(process.cwd());
  assert.equal(typeof count, "number");
  assert.ok(count >= 0);
});

test("PlaywrightEvidenceRunner reports a clean site as passing its deterministic checks", async (t) => {
  const dir = await writeFixture(CLEAN_HTML);
  t.after(() => rm(dir, { recursive: true, force: true }));
  const runner = new PlaywrightEvidenceRunner({ tenantId: "acme-hvac" });
  const report = await runner.assess({ workspace: dir, widths: WIDTHS });

  assert.equal(report.designScore, 0);
  assert.equal(report.applicableMax, 0);
  assert.deepEqual(report.findings, []);
  assert.equal(report.axeViolations, 0);
  assert.equal(report.missingAssets, 0);
  assert.equal(report.consoleErrors, 0);
  assert.equal(report.responsiveChecksPassed, true);
  assert.equal(report.functionalChecksPassed, true);
  assert.equal(report.contentIntegrityPassed, true);
  assert.equal(report.tenantIsolationPassed, true);
  for (const key of ["accessibility", "performance", "bestPractices", "seo"] as const) {
    assert.ok(report.lighthouse[key] >= 0 && report.lighthouse[key] <= 100, `${key} in range`);
  }
});

test("PlaywrightEvidenceRunner catches a broken/overflowing/placeholder-riddled site", async (t) => {
  const dir = await writeFixture(BROKEN_HTML);
  t.after(() => rm(dir, { recursive: true, force: true }));
  const runner = new PlaywrightEvidenceRunner({ tenantId: "acme-hvac" });
  const report = await runner.assess({ workspace: dir, widths: WIDTHS });

  assert.ok(report.axeViolations > 0, "missing alt text should trip axe");
  assert.ok(report.missingAssets > 0, "missing.png should 404");
  assert.ok(report.consoleErrors > 0, "console.error() should be counted");
  assert.equal(report.responsiveChecksPassed, false, "3000px div should overflow every width");
  assert.equal(report.contentIntegrityPassed, false, "Lorem ipsum should trip the placeholder check");
});

test("PlaywrightEvidenceRunner flags a hardcoded reference to another tenant's site path", async (t) => {
  const dir = await writeFixture(TENANT_LEAK_HTML);
  t.after(() => rm(dir, { recursive: true, force: true }));
  const runner = new PlaywrightEvidenceRunner({ tenantId: "acme-hvac" });
  const report = await runner.assess({ workspace: dir, widths: WIDTHS });

  assert.equal(report.tenantIsolationPassed, false);
});

test("a workspace whose entry is home.html is audited for real, not scored as a 404", async (t) => {
  // Regression: the server only ever mapped "/" to index.html, so a workspace
  // written by site_magic_engine.py (which emits home.html) answered "/" with
  // a 404. Lighthouse then audited the 404 body and returned 0 in every
  // category, with no finding explaining why -- indistinguishable from a
  // genuinely terrible site.
  const dir = await mkdtemp(join(tmpdir(), "site-magic-evidence-entry-"));
  t.after(() => rm(dir, { recursive: true, force: true }));
  await writeFile(join(dir, "home.html"), CLEAN_HTML, "utf-8");

  const runner = new PlaywrightEvidenceRunner({ tenantId: "acme-hvac" });
  const report = await runner.assess({ workspace: dir, widths: WIDTHS });

  assert.equal(report.brokenLinks, 0, "the entry document must resolve");
  assert.equal(report.consoleErrors, 0, "a 404 entry produces a console error per width");
  assert.ok(report.lighthouse.performance > 0, "Lighthouse must audit the real page, not a 404");
  assert.equal(report.contentIntegrityPassed, true);
});

test("index.html still wins over home.html when both exist", async (t) => {
  const dir = await mkdtemp(join(tmpdir(), "site-magic-evidence-both-"));
  t.after(() => rm(dir, { recursive: true, force: true }));
  await writeFile(join(dir, "index.html"), CLEAN_HTML, "utf-8");
  await writeFile(
    join(dir, "home.html"),
    CLEAN_HTML.replace("Licensed heating and cooling", "Lorem ipsum placeholder copy"),
    "utf-8"
  );

  const runner = new PlaywrightEvidenceRunner({ tenantId: "acme-hvac" });
  const report = await runner.assess({ workspace: dir, widths: WIDTHS });

  // home.html carries the placeholder marker; index.html does not. A pass here
  // proves "/" served index.html.
  assert.equal(report.contentIntegrityPassed, true);
});

test("staticRoot makes app-served /static assets resolve instead of counting as missing", async (t) => {
  // Rendered pages reference /static/site.css and /static/angel-widget.js,
  // which the FastAPI app serves from routes, not from the workspace. Without
  // the mount every width logged a missing asset, a failed request, and a
  // console error on an otherwise clean site.
  const staticDir = await mkdtemp(join(tmpdir(), "site-magic-static-"));
  const dir = await mkdtemp(join(tmpdir(), "site-magic-evidence-static-"));
  t.after(() => Promise.all([
    rm(dir, { recursive: true, force: true }),
    rm(staticDir, { recursive: true, force: true }),
  ]));
  await writeFile(join(staticDir, "site.css"), "main{color:#123}", "utf-8");
  await writeFile(
    join(dir, "index.html"),
    CLEAN_HTML.replace("</head>", '<link rel="stylesheet" href="/static/site.css"></head>'),
    "utf-8"
  );

  const withoutMount = new PlaywrightEvidenceRunner({ tenantId: "acme-hvac" });
  const before = await withoutMount.assess({ workspace: dir, widths: WIDTHS });
  assert.ok(before.missingAssets > 0, "unmounted /static must still be reported missing");

  const withMount = new PlaywrightEvidenceRunner({ tenantId: "acme-hvac", staticRoot: staticDir });
  const after = await withMount.assess({ workspace: dir, widths: WIDTHS });
  assert.equal(after.missingAssets, 0);
  assert.equal(after.failedRequests, 0);
});

test("the static mount refuses traversal out of staticRoot", async (t) => {
  // A browser normalizes ".." out of a URL before it is ever sent, so this
  // guard is only reachable by a client that sends the raw path. Exercise it
  // against the server directly rather than through Chromium.
  const staticDir = await mkdtemp(join(tmpdir(), "site-magic-static-escape-"));
  const dir = await mkdtemp(join(tmpdir(), "site-magic-evidence-escape-"));
  t.after(() => Promise.all([
    rm(dir, { recursive: true, force: true }),
    rm(staticDir, { recursive: true, force: true }),
  ]));
  await writeFile(join(staticDir, "site.css"), "main{color:#123}", "utf-8");
  await writeFile(join(dir, "secret.txt"), "should never be served via /static", "utf-8");
  await writeFile(join(dir, "index.html"), CLEAN_HTML, "utf-8");

  const { server, baseUrl } = await startStaticServer(dir, staticDir);
  t.after(() => new Promise<void>((done) => server.close(() => done())));
  const origin = new URL(baseUrl);

  const rawGet = (path: string) =>
    new Promise<number>((resolveStatus, reject) => {
      const req = request(
        { host: origin.hostname, port: Number(origin.port), path, method: "GET" },
        (res) => {
          res.resume();
          resolveStatus(res.statusCode ?? 0);
        }
      );
      req.on("error", reject);
      req.end();
    });

  assert.equal(await rawGet("/static/site.css"), 200, "the mount itself must work");
  assert.equal(await rawGet("/static/../secret.txt"), 403, "traversal out of staticRoot is refused");
  assert.equal(await rawGet("/secret.txt"), 200, "workspace files are still served from the workspace root");
});
