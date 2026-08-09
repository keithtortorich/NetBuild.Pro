import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  PlaywrightEvidenceRunner,
  runImpeccableDetect,
  EvidenceRunnerError,
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
