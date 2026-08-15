import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import {
  normalizedScore, orderWeaknesses, releaseGatesPass, SiteMakerEngine,
  mergeDesignAssessment, InvalidDesignAssessmentError,
  generateImagesWithBoundedRetry, IMAGE_GENERATION_MAX_ATTEMPTS,
  MAX_REMEDIATION_ROUNDS,
  summarizeDeterministicEvidence,
  ensureImageCompsRendered,
  type QualityReport, type ImageGenerator, type WorkspaceWriter,
  describeFailure,
  redactSecrets,
} from "../webstaffr/site_maker_engine.ts";

// Real comps are `data:` URIs (see OpenAIImageGenerator/OpenRouterImageGenerator
// in site_magic_adapters.ts) -- writeImageComps() rejects anything else.
const fakeComps = () => [
  "data:image/png;base64,QUFB", "data:image/png;base64,QkJC", "data:image/png;base64,Q0ND",
];

// Mirrors CodexRuntime's own fs-injection seam: a fake so tests don't need
// a real writable workspace directory on disk. Pre-seed `files` to
// simulate an entry HTML file the builder already wrote.
const fakeWorkspaceWriter = (
  files: Record<string, string> = {}
): WorkspaceWriter & { written: Map<string, Buffer> } => {
  const written = new Map<string, Buffer>();
  for (const [filePath, contents] of Object.entries(files)) {
    written.set(filePath, Buffer.from(contents, "utf-8"));
  }
  return {
    written,
    async mkdir() {},
    async writeFile(filePath, contents) { written.set(filePath, contents); },
    async readFile(filePath) {
      const contents = written.get(filePath);
      return contents === undefined ? null : contents.toString("utf-8");
    },
  };
};

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
      if (args.role === "design_assessor") return { designScore: 36, applicableMax: 40, findings: [] };
      return {};
    } },
    images: { async generate() { return fakeComps(); } },
    evidence: { async assess() { return passing(); } },
    artifacts: { async sealPrivateImmutable() { return { buildId: "build-1" }; } },
    workspaceWriter: fakeWorkspaceWriter(),
  });
  const result = await engine.run({
    jobId: "job-1", tenantId: "tenant-1", workspace: "/private/job-1",
    source: { type: "intake", intakeId: "intake-1", verifiedFacts: { company: "Acme" } },
  });
  assert.deepEqual(result, { status: "ready_for_review", buildId: "build-1" });
  assert.equal(states.at(-1), "ready_for_review");
  assert.deepEqual(roles, ["product", "direction", "builder", "design_assessor", "finish_reviewer", "documenter"]);
});

test("quarantines after MAX_REMEDIATION_ROUNDS unsuccessful remediation rounds", async () => {
  const states: string[] = [];
  const quarantineMetadata: Array<Record<string, unknown> | undefined> = [];
  let remediations = 0;
  const codexFinding = [{ id: "p1", priority: "P1" as const, summary: "weak" }];
  const engine = new SiteMakerEngine({
    states: { async transition(_job, _tenant, state, metadata) {
      states.push(state);
      if (state === "quarantined") quarantineMetadata.push(metadata);
    } },
    codex: { async run(args) {
      if (args.role === "remediator") remediations += 1;
      if (args.role === "design_assessor") return { designScore: 20, applicableMax: 40, findings: codexFinding };
      return {};
    } },
    images: { async generate() { return fakeComps(); } },
    evidence: { async assess() { return passing(); } },
    artifacts: { async sealPrivateImmutable() { throw new Error("must not seal"); } },
    workspaceWriter: fakeWorkspaceWriter(),
  });
  const result = await engine.run({
    jobId: "job-2", tenantId: "tenant-1", workspace: "/private/job-2",
    source: { type: "url", url: "https://example.com/", ownershipAttested: true },
  });
  assert.equal(result.status, "quarantined");
  assert.equal(remediations, MAX_REMEDIATION_ROUNDS);
  assert.equal(states.at(-1), "quarantined");
  // Regression: quality_summary_json stayed null on every real quarantined
  // job because the quality report was only ever console.error'd, never
  // handed to the states sink -- confirmed against two live jobs on
  // 2026-08-15 before this fix.
  assert.equal(quarantineMetadata.length, 1);
  const report = quarantineMetadata[0]?.report as { designScore: number; findings: unknown };
  assert.equal(report?.designScore, 20);
  assert.deepEqual(report?.findings, codexFinding);
});

test("remediator instructions carry deterministic gate evidence, not just the design assessor's subjective findings", async () => {
  const failing: QualityReport = {
    ...passing(), designScore: 20, applicableMax: 40,
    missingAssets: 3, consoleErrors: 3, responsiveChecksPassed: false,
  };
  const remediatorInstructions: string[] = [];
  const engine = new SiteMakerEngine({
    states: { async transition() {} },
    codex: { async run(args) {
      if (args.role === "remediator") remediatorInstructions.push(args.instructions);
      if (args.role === "design_assessor") return { designScore: 20, applicableMax: 40, findings: [] };
      return {};
    } },
    images: { async generate() { return fakeComps(); } },
    evidence: { async assess() { return failing; } },
    artifacts: { async sealPrivateImmutable() { throw new Error("must not seal"); } },
    workspaceWriter: fakeWorkspaceWriter(),
  });
  await engine.run({
    jobId: "job-det-evidence", tenantId: "tenant-1", workspace: "/private/job-det-evidence",
    source: { type: "url", url: "https://example.com/", ownershipAttested: true },
  });
  assert.ok(remediatorInstructions.length > 0);
  for (const instructions of remediatorInstructions) {
    assert.match(instructions, /"missingAssets":3/);
    assert.match(instructions, /"consoleErrors":3/);
    assert.match(instructions, /"responsiveChecksPassed":false/);
  }
});

test("summarizeDeterministicEvidence surfaces every deterministicGatesPass field", () => {
  const evidence = summarizeDeterministicEvidence(passing());
  assert.deepEqual(evidence, {
    detectorFindings: 0, axeViolations: 0,
    lighthouse: { accessibility: 100, performance: 90, bestPractices: 95, seo: 95 },
    brokenLinks: 0, missingAssets: 0, consoleErrors: 0, failedRequests: 0,
    responsiveChecksPassed: true, functionalChecksPassed: true,
    contentIntegrityPassed: true, tenantIsolationPassed: true,
  });
});

test("mergeDesignAssessment splices designScore/applicableMax/findings from the design_assessor role", () => {
  const merged = mergeDesignAssessment(passing(), {
    designScore: 18, applicableMax: 20, findings: [{ id: "f1", priority: "P2", summary: "minor" }],
  });
  assert.equal(merged.designScore, 18);
  assert.equal(merged.applicableMax, 20);
  assert.deepEqual(merged.findings, [{ id: "f1", priority: "P2", summary: "minor" }]);
  // every other field is untouched -- evidence.assess()'s deterministic
  // findings are not something the design_assessor role gets to overwrite
  assert.equal(merged.axeViolations, passing().axeViolations);
});

test("mergeDesignAssessment throws on a malformed design_assessor response instead of defaulting to a passing shape", () => {
  assert.throws(() => mergeDesignAssessment(passing(), {}), InvalidDesignAssessmentError);
  assert.throws(() => mergeDesignAssessment(passing(), { designScore: "36", applicableMax: 40, findings: [] }), InvalidDesignAssessmentError);
  assert.throws(() => mergeDesignAssessment(passing(), { designScore: 36, applicableMax: 40, findings: "none" }), InvalidDesignAssessmentError);
});

test("a malformed design_assessor response fails the job closed instead of silently passing the gate", async () => {
  const states: string[] = [];
  const engine = new SiteMakerEngine({
    states: { async transition(_job, _tenant, state) { states.push(state); } },
    codex: { async run(args) { if (args.role === "design_assessor") return { oops: true }; return {}; } },
    images: { async generate() { return fakeComps(); } },
    evidence: { async assess() { return passing(); } },
    artifacts: { async sealPrivateImmutable() { throw new Error("must not seal"); } },
    workspaceWriter: fakeWorkspaceWriter(),
  });
  const result = await engine.run({
    jobId: "job-4", tenantId: "tenant-1", workspace: "/private/job-4",
    source: { type: "url", url: "https://example.com/", ownershipAttested: true },
  });
  assert.equal(result.status, "failed");
  assert.equal(states.at(-1), "failed");
});

test("generateImagesWithBoundedRetry returns on first success without retrying", async () => {
  let calls = 0;
  const images: ImageGenerator = { async generate() { calls += 1; return ["a", "b", "c"]; } };
  const slept: number[] = [];
  const result = await generateImagesWithBoundedRetry(
    images, { model: "m", brief: "b", count: 3 }, async (ms) => { slept.push(ms); }
  );
  assert.deepEqual(result, ["a", "b", "c"]);
  assert.equal(calls, 1);
  assert.deepEqual(slept, []);
});

test("generateImagesWithBoundedRetry retries on failure and returns the first later success", async () => {
  let calls = 0;
  const images: ImageGenerator = {
    async generate() {
      calls += 1;
      if (calls < 3) throw new Error("transient provider error");
      return ["a", "b", "c"];
    },
  };
  const slept: number[] = [];
  const result = await generateImagesWithBoundedRetry(
    images, { model: "m", brief: "b", count: 3 }, async (ms) => { slept.push(ms); }
  );
  assert.deepEqual(result, ["a", "b", "c"]);
  assert.equal(calls, 3);
  // backoff delays are recorded between attempts, not after the final success
  assert.equal(slept.length, 2);
});

test("generateImagesWithBoundedRetry returns null (not a throw) after exhausting all attempts", async () => {
  let calls = 0;
  const images: ImageGenerator = { async generate() { calls += 1; throw new Error("persistent provider outage"); } };
  const slept: number[] = [];
  const result = await generateImagesWithBoundedRetry(
    images, { model: "m", brief: "b", count: 3 }, async (ms) => { slept.push(ms); }
  );
  assert.equal(result, null);
  assert.equal(calls, IMAGE_GENERATION_MAX_ATTEMPTS);
  // one fewer sleep than attempts -- no backoff wait after the final failed attempt
  assert.equal(slept.length, IMAGE_GENERATION_MAX_ATTEMPTS - 1);
});

test("a persistently failing image generator does not fail the job -- build finishes with images marked missing, never fabricated", async () => {
  const states: Array<{ state: string; metadata?: Record<string, unknown> }> = [];
  const builderInstructions: string[] = [];
  const engine = new SiteMakerEngine({
    states: { async transition(_job, _tenant, state, metadata) { states.push({ state, metadata }); } },
    codex: {
      async run(args) {
        if (args.role === "builder") builderInstructions.push(args.instructions);
        if (args.role === "finish_reviewer") return { verdict: "PASS", authoredNotInterchangeable: true, materialFindings: [] };
        if (args.role === "design_assessor") return { designScore: 36, applicableMax: 40, findings: [] };
        return {};
      },
    },
    images: { async generate() { throw new Error("image vendor outage"); } },
    evidence: { async assess() { return passing(); } },
    artifacts: { async sealPrivateImmutable() { return { buildId: "build-missing-images" }; } },
  });
  const result = await engine.run({
    jobId: "job-images-missing", tenantId: "tenant-1", workspace: "/private/job-images-missing",
    source: { type: "intake", intakeId: "intake-1", verifiedFacts: { company: "Acme" } },
  });
  // the job still ships -- an image-vendor outage is not a reason to
  // quarantine or fail a build that is otherwise sound
  assert.deepEqual(result, { status: "ready_for_review", buildId: "build-missing-images" });
  const buildingTransition = states.find((entry) => entry.state === "building");
  assert.equal(buildingTransition?.metadata?.imagesMissing, true);
  // the builder role is told images are unavailable and must not fabricate
  // or reference placeholders -- never a silent gap the visitor discovers
  assert.match(builderInstructions[0], /No image comps are available/);
  assert.match(builderInstructions[0], /Never fabricate, reference, or leave placeholders for missing images/);
});

test("generated image comps are written to the workspace and the builder is told their exact paths", async () => {
  // Regression for 2026-08-15: comps were generated but never written to
  // disk or mentioned in the builder's instructions, so the builder
  // invented image paths that never existed -- every real job quarantined
  // with missingAssets/consoleErrors as a multiple of 3 (one per comp,
  // times 3 viewport widths). Confirmed against a real quarantined job's
  // Evidence Runner report (missingAssets: 9, consoleErrors: 9).
  const builderInstructions: string[] = [];
  const writer = fakeWorkspaceWriter();
  const engine = new SiteMakerEngine({
    states: { async transition() {} },
    codex: {
      async run(args) {
        if (args.role === "builder") builderInstructions.push(args.instructions);
        if (args.role === "finish_reviewer") return { verdict: "PASS", authoredNotInterchangeable: true, materialFindings: [] };
        if (args.role === "design_assessor") return { designScore: 36, applicableMax: 40, findings: [] };
        return {};
      },
    },
    images: { async generate() { return fakeComps(); } },
    evidence: { async assess() { return passing(); } },
    artifacts: { async sealPrivateImmutable() { return { buildId: "build-with-images" }; } },
    workspaceWriter: writer,
  });
  const result = await engine.run({
    jobId: "job-images-present", tenantId: "tenant-1", workspace: "/private/job-images-present",
    source: { type: "intake", intakeId: "intake-1", verifiedFacts: { company: "Acme" } },
  });
  assert.deepEqual(result, { status: "ready_for_review", buildId: "build-with-images" });
  assert.deepEqual(
    [...writer.written.keys()].sort(),
    [
      "/private/job-images-present/images/comp-1.png",
      "/private/job-images-present/images/comp-2.png",
      "/private/job-images-present/images/comp-3.png",
    ]
  );
  assert.match(builderInstructions[0], /images\/comp-1\.png, images\/comp-2\.png, images\/comp-3\.png/);
  assert.match(builderInstructions[0], /do not invent, rename, or leave placeholders/);
});

test("ensureImageCompsRendered injects any comp the entry file doesn't already reference", async () => {
  // Regression for 2026-08-15: telling the builder the exact paths was
  // necessary but not sufficient -- confirmed against a real job that
  // reverted to missingAssets: 9 with no code change from a run that had
  // scored 0. Prompt compliance is probabilistic; this makes it
  // deterministic by patching the audited entry file directly.
  const writer = fakeWorkspaceWriter({
    "/ws/index.html": "<html><body><h1>Hi</h1><img src=\"images/comp-2.png\"></body></html>",
  });
  await ensureImageCompsRendered(writer, "/ws", ["images/comp-1.png", "images/comp-2.png", "images/comp-3.png"]);

  const patched = (await writer.readFile("/ws/index.html"))!;
  assert.match(patched, /<img src="images\/comp-1\.png"/);
  assert.match(patched, /<img src="images\/comp-3\.png"/);
  // already-referenced comp is untouched, not duplicated
  assert.equal(patched.match(/comp-2\.png/g)?.length, 1);
  // injected before the closing tag, not after it
  assert.ok(patched.indexOf("comp-1.png") < patched.indexOf("</body>"));
});

test("ensureImageCompsRendered is a no-op when every comp is already referenced", async () => {
  const html = "<html><body><img src=\"images/comp-1.png\"></body></html>";
  const writer = fakeWorkspaceWriter({ "/ws/index.html": html });
  await ensureImageCompsRendered(writer, "/ws", ["images/comp-1.png"]);
  assert.equal(await writer.readFile("/ws/index.html"), html);
});

test("ensureImageCompsRendered is a no-op when no entry file exists yet", async () => {
  const writer = fakeWorkspaceWriter();
  await ensureImageCompsRendered(writer, "/ws", ["images/comp-1.png"]);
  assert.equal(writer.written.size, 0);
});

test("ensureImageCompsRendered falls back to home.html when index.html doesn't exist", async () => {
  const writer = fakeWorkspaceWriter({ "/ws/home.html": "<html><body></body></html>" });
  await ensureImageCompsRendered(writer, "/ws", ["images/comp-1.png"]);
  assert.match((await writer.readFile("/ws/home.html"))!, /comp-1\.png/);
});

test("a builder that ignores the image-path instructions still ends up with every comp on the audited page", async () => {
  const writer = fakeWorkspaceWriter();
  const engine = new SiteMakerEngine({
    states: { async transition() {} },
    codex: {
      async run(args) {
        if (args.role === "builder") {
          // simulates a non-compliant builder: writes an entry file with
          // no reference to any of the given comp paths
          writer.written.set("/private/job-noncompliant/index.html", Buffer.from("<html><body></body></html>", "utf-8"));
        }
        if (args.role === "finish_reviewer") return { verdict: "PASS", authoredNotInterchangeable: true, materialFindings: [] };
        if (args.role === "design_assessor") return { designScore: 36, applicableMax: 40, findings: [] };
        return {};
      },
    },
    images: { async generate() { return fakeComps(); } },
    evidence: { async assess() { return passing(); } },
    artifacts: { async sealPrivateImmutable() { return { buildId: "build-1" }; } },
    workspaceWriter: writer,
  });
  const result = await engine.run({
    jobId: "job-noncompliant", tenantId: "tenant-1", workspace: "/private/job-noncompliant",
    source: { type: "intake", intakeId: "intake-1", verifiedFacts: { company: "Acme" } },
  });
  assert.deepEqual(result, { status: "ready_for_review", buildId: "build-1" });
  const entry = (await writer.readFile("/private/job-noncompliant/index.html"))!;
  assert.match(entry, /comp-1\.png/);
  assert.match(entry, /comp-2\.png/);
  assert.match(entry, /comp-3\.png/);
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

test("DESIGN_MODEL picks up SITE_MAGIC_DESIGN_MODEL, not just the runtime's own default", () => {
  // Regression: DESIGN_MODEL was a hardcoded literal, and every codex.run()
  // call in this file passes it explicitly as `model`, which overrides
  // OpenRouterCodegenRuntime's own env-var-aware default entirely. Setting
  // SITE_MAGIC_DESIGN_MODEL in production Railway env had zero effect on
  // any real call -- discovered when a 402-driven free-tier-model swap
  // still 402'd, because the constant never read the env var at all.
  // Spawns a fresh process (mirrors a real container restart, where env
  // vars are set before the process -- and this module -- ever starts).
  const withEnv = execFileSync(
    process.execPath,
    ["--input-type=module", "-e", "import { DESIGN_MODEL } from './webstaffr/site_maker_engine.ts'; console.log(DESIGN_MODEL);"],
    { encoding: "utf-8", env: { ...process.env, SITE_MAGIC_DESIGN_MODEL: "openai/gpt-oss-20b:free" } }
  ).trim();
  assert.equal(withEnv, "openai/gpt-oss-20b:free");

  const envWithoutModel = { ...process.env };
  delete envWithoutModel.SITE_MAGIC_DESIGN_MODEL;
  const withoutEnv = execFileSync(
    process.execPath,
    ["--input-type=module", "-e", "import { DESIGN_MODEL } from './webstaffr/site_maker_engine.ts'; console.log(DESIGN_MODEL);"],
    { encoding: "utf-8", env: envWithoutModel }
  ).trim();
  assert.equal(withoutEnv, "openai/gpt-4o-mini");
});

test("describeFailure carries the provider's reason, not just the class name", () => {
  // Regression: the first real production job died on an OpenRouter 401 and
  // recorded failure_code "Error" -- diagnosing it required probing the
  // provider by hand.
  const err = new Error("OpenRouter API error: 401 Unauthorized");
  assert.equal(describeFailure(err), "Error: OpenRouter API error: 401 Unauthorized");
});

test("describeFailure falls back to the class name when there is no message", () => {
  assert.equal(describeFailure(new Error("")), "Error");
  assert.equal(describeFailure("not an error"), "UnknownError");
});

test("describeFailure bounds a runaway message to the control plane's 64-char failure_code limit", () => {
  // Regression: a 130-char message made describeFailure return a string
  // over the API's max_length=64, so the state-transition write recording
  // the failure itself 422'd -- the job never got marked failed at all.
  const described = describeFailure(new Error("x".repeat(5000)));
  assert.ok(described.length <= 64, `expected <=64 chars, got ${described.length}`);
  assert.ok(described.startsWith("Error: "));
});

test("describeFailure redacts credentials that a provider echoed back", () => {
  const cases = [
    "auth failed for sk-or-v1-abcdef0123456789abcdef0123456789",
    "bad key sb_secret_Zfo5SHwPqUJlmpc3vnnb4w_6NalamsD",
    "rejected Bearer sk-or-v1-deadbeefdeadbeefdeadbeef",
    "token eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxIn0.abc123def456",
  ];
  for (const raw of cases) {
    const described = describeFailure(new Error(raw));
    assert.ok(!/sk-or-v1-[A-Za-z0-9]/.test(described), `leaked openrouter key: ${described}`);
    assert.ok(!/sb_secret_[A-Za-z0-9]/.test(described), `leaked supabase key: ${described}`);
    assert.ok(!/eyJ[A-Za-z0-9_-]{10,}\./.test(described), `leaked jwt: ${described}`);
  }
});

test("a failed run returns the reason so the worker can log it", async () => {
  const states: Array<{ state: string; metadata?: Record<string, unknown> }> = [];
  const engine = new SiteMakerEngine({
    states: { async transition(_j, _t, state, metadata) { states.push({ state, metadata }); } },
    codex: { async run() { throw new Error("OpenRouter API error: 401 Unauthorized"); } },
    images: { async generate() { return ["a", "b", "c"]; } },
    evidence: { async assess() { throw new Error("unreachable"); } },
    artifacts: { async sealPrivateImmutable() { throw new Error("unreachable"); } },
  });

  const result = await engine.run({
    jobId: "job-1", tenantId: "tenant-1", workspace: "/tmp/nope",
    source: { type: "intake", intakeId: "1", verifiedFacts: {} },
  });

  assert.equal(result.status, "failed");
  assert.equal(result.failureCode, "Error: OpenRouter API error: 401 Unauthorized");
  const failed = states.find((s) => s.state === "failed");
  assert.equal(failed?.metadata?.errorType, "Error: OpenRouter API error: 401 Unauthorized");
});
