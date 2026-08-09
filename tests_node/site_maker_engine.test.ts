import test from "node:test";
import assert from "node:assert/strict";
import {
  normalizedScore, orderWeaknesses, releaseGatesPass, SiteMakerEngine,
  type QualityReport,
} from "../webstaffr/site_maker_engine.ts";

const passing = (): QualityReport => ({
  designScore: 36, applicableMax: 40, findings: [], detectorFindings: 0,
  axeViolations: 0,
  lighthouse: { accessibility: 100, performance: 90, bestPractices: 95, seo: 95 },
  brokenLinks: 0, missingAssets: 0, consoleErrors: 0, failedRequests: 0,
  responsiveChecksPassed: true, functionalChecksPassed: true,
  contentIntegrityPassed: true, tenantIsolationPassed: true,
});

test("normalizes applicable heuristic maxima", () => {
  assert.equal(normalizedScore({ ...passing(), designScore: 29, applicableMax: 32 }), 29 / 32);
  assert.equal(normalizedScore({ ...passing(), designScore: 0, applicableMax: 0 }), 0);
});

test("orders the weakness ledger by priority then stable id", () => {
  const result = orderWeaknesses([
    { id: "b", priority: "P1", summary: "b" },
    { id: "z", priority: "P0", summary: "z" },
    { id: "a", priority: "P1", summary: "a" },
  ]);
  assert.deepEqual(result.map((item) => item.id), ["z", "a", "b"]);
});

test("enforces every deterministic release gate", () => {
  const finish = { verdict: "PASS", authoredNotInterchangeable: true, materialFindings: [] };
  assert.equal(releaseGatesPass(passing(), finish), true);
  assert.equal(releaseGatesPass({ ...passing(), axeViolations: 1 }, finish), false);
  assert.equal(releaseGatesPass({ ...passing(), designScore: 28 }, finish), false);
});

test("happy path reveals only a sealed final build", async () => {
  const states: string[] = [];
  const roles: string[] = [];
  const engine = new SiteMakerEngine({
    states: { async transition(_job, _tenant, state) { states.push(state); } },
    codex: { async run(args) {
      roles.push(args.role);
      if (args.role === "finish_reviewer") return { verdict: "PASS", authoredNotInterchangeable: true, materialFindings: [] };
      return {};
    } },
    images: { async generate() { return ["one", "two", "three"]; } },
    evidence: { async assess() { return passing(); } },
    artifacts: { async sealPrivateImmutable() { return { buildId: "build-1" }; } },
  });
  const result = await engine.run({
    jobId: "job-1", tenantId: "tenant-1", workspace: "/private/job-1",
    source: { type: "intake", intakeId: "intake-1", verifiedFacts: { company: "Acme" } },
  });
  assert.deepEqual(result, { status: "ready_for_review", buildId: "build-1" });
  assert.equal(states.at(-1), "ready_for_review");
  assert.deepEqual(roles, ["product", "direction", "builder", "design_assessor", "finish_reviewer", "documenter"]);
});

test("quarantines after two unsuccessful remediation rounds", async () => {
  const states: string[] = [];
  let remediations = 0;
  const failed = { ...passing(), designScore: 20, findings: [{ id: "p1", priority: "P1" as const, summary: "weak" }] };
  const engine = new SiteMakerEngine({
    states: { async transition(_job, _tenant, state) { states.push(state); } },
    codex: { async run(args) { if (args.role === "remediator") remediations += 1; return {}; } },
    images: { async generate() { return ["one", "two", "three"]; } },
    evidence: { async assess() { return failed; } },
    artifacts: { async sealPrivateImmutable() { throw new Error("must not seal"); } },
  });
  const result = await engine.run({
    jobId: "job-2", tenantId: "tenant-1", workspace: "/private/job-2",
    source: { type: "url", url: "https://example.com/", ownershipAttested: true },
  });
  assert.equal(result.status, "quarantined");
  assert.equal(remediations, 2);
  assert.equal(states.at(-1), "quarantined");
});

test("adapter failure fails closed", async () => {
  const states: string[] = [];
  const engine = new SiteMakerEngine({
    states: { async transition(_job, _tenant, state) { states.push(state); } },
    codex: { async run() { throw new Error("not configured"); } },
    images: { async generate() { return []; } },
    evidence: { async assess() { return passing(); } },
    artifacts: { async sealPrivateImmutable() { return { buildId: "never" }; } },
  });
  const result = await engine.run({
    jobId: "job-3", tenantId: "tenant-1", workspace: "/private/job-3",
    source: { type: "intake", intakeId: "intake-3", verifiedFacts: {} },
  });
  assert.equal(result.status, "failed");
  assert.equal(states.at(-1), "failed");
});
