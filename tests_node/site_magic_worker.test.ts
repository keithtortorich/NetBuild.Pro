import test from "node:test";
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { join } from "node:path";
import type { AddressInfo } from "node:net";
import type { EvidenceRunner, QualityReport } from "../webstaffr/site_maker_engine.ts";
import {
  buildProductionDependencies,
  fetchJobRecord,
  processJob,
  resolveSource,
  startWebhookServer,
  UnresolvableSourceError,
  type WorkerDependencies,
} from "../webstaffr/site_magic_worker.ts";
import { PlaywrightEvidenceRunner } from "../webstaffr/site_magic_evidence_runner.ts";
import { OpenRouterImageGenerator } from "../webstaffr/site_magic_adapters.ts";

/** Dry-run stand-in for a real EvidenceRunner -- keeps these worker-wiring
 * tests fast and independent of a real Chromium/axe-core/Lighthouse pass
 * (that's exercised for real in site_magic_evidence_runner.test.ts).
 * Always reports every deterministic gate passing. */
class FakeEvidenceRunner implements EvidenceRunner {
  async assess(): Promise<QualityReport> {
    return {
      designScore: 36, applicableMax: 40, findings: [], detectorFindings: 0,
      axeViolations: 0,
      lighthouse: { accessibility: 100, performance: 90, bestPractices: 95, seo: 95 },
      brokenLinks: 0, missingAssets: 0, consoleErrors: 0, failedRequests: 0,
      responsiveChecksPassed: true, functionalChecksPassed: true,
      contentIntegrityPassed: true, tenantIsolationPassed: true,
    };
  }
}

function fakeDependencies(): { deps: WorkerDependencies; states: string[] } {
  const states: string[] = [];
  const deps: WorkerDependencies = {
    states: { async transition(_job, _tenant, state) { states.push(state); } },
    codex: {
      async run(args) {
        if (args.role === "finish_reviewer") {
          return { verdict: "PASS", authoredNotInterchangeable: true, materialFindings: [] };
        }
        if (args.role === "design_assessor") {
          return { designScore: 36, applicableMax: 40, findings: [] };
        }
        return {};
      },
    },
    images: { async generate() { return [
      "data:image/png;base64,QUFB", "data:image/png;base64,QkJC", "data:image/png;base64,Q0ND",
    ]; } },
    evidence: new FakeEvidenceRunner(),
    artifacts: { async sealPrivateImmutable() { return { buildId: "dry-run-build-1" }; } },
  };
  return { deps, states };
}

test("buildProductionDependencies wires a real PlaywrightEvidenceRunner, not a Null stand-in", () => {
  const originals = {
    OPENAI_API_KEY: process.env.OPENAI_API_KEY,
    OPENROUTER_API_KEY: process.env.OPENROUTER_API_KEY,
    SUPABASE_URL: process.env.SUPABASE_URL,
    SITE_MAGIC_STORAGE_SERVICE_KEY: process.env.SITE_MAGIC_STORAGE_SERVICE_KEY,
    SITE_MAGIC_API_BASE_URL: process.env.SITE_MAGIC_API_BASE_URL,
    SITE_MAGIC_INTERNAL_API_KEY: process.env.SITE_MAGIC_INTERNAL_API_KEY,
  };
  Object.assign(process.env, {
    OPENAI_API_KEY: "test-key", OPENROUTER_API_KEY: "test-openrouter-key",
    SUPABASE_URL: "https://example.supabase.co",
    SITE_MAGIC_STORAGE_SERVICE_KEY: "test-service-key",
    SITE_MAGIC_API_BASE_URL: "https://control-plane.internal",
    SITE_MAGIC_INTERNAL_API_KEY: "test-internal-key",
  });
  try {
    const deps = buildProductionDependencies("tenant-1");
    assert.ok(deps.evidence instanceof PlaywrightEvidenceRunner);
  } finally {
    for (const [key, value] of Object.entries(originals)) {
      if (value === undefined) delete process.env[key]; else process.env[key] = value;
    }
  }
});

test("buildProductionDependencies wires staticRoot so app-served /static assets don't count as missing -- regression for the 2026-08-11 bug where 6 assets/errors were reported on every real job", () => {
  const originals = {
    OPENAI_API_KEY: process.env.OPENAI_API_KEY,
    OPENROUTER_API_KEY: process.env.OPENROUTER_API_KEY,
    SUPABASE_URL: process.env.SUPABASE_URL,
    SITE_MAGIC_STORAGE_SERVICE_KEY: process.env.SITE_MAGIC_STORAGE_SERVICE_KEY,
    SITE_MAGIC_API_BASE_URL: process.env.SITE_MAGIC_API_BASE_URL,
    SITE_MAGIC_INTERNAL_API_KEY: process.env.SITE_MAGIC_INTERNAL_API_KEY,
  };
  Object.assign(process.env, {
    OPENAI_API_KEY: "test-key", OPENROUTER_API_KEY: "test-openrouter-key",
    SUPABASE_URL: "https://example.supabase.co",
    SITE_MAGIC_STORAGE_SERVICE_KEY: "test-service-key",
    SITE_MAGIC_API_BASE_URL: "https://control-plane.internal",
    SITE_MAGIC_INTERNAL_API_KEY: "test-internal-key",
  });
  try {
    const deps = buildProductionDependencies("tenant-1");
    const evidence = deps.evidence as unknown as { staticRoot?: string };
    assert.ok(evidence.staticRoot, "staticRoot must be wired, not left undefined");
    assert.ok(evidence.staticRoot!.endsWith("templates/site/static"));
    assert.ok(
      existsSync(join(evidence.staticRoot!, "site.css")),
      "wired staticRoot must actually resolve to the real static directory"
    );
  } finally {
    for (const [key, value] of Object.entries(originals)) {
      if (value === undefined) delete process.env[key]; else process.env[key] = value;
    }
  }
});

test("buildProductionDependencies wires OpenRouterImageGenerator for images, not OpenAI -- OpenAI's GPT Image org access is unapproved", () => {
  const originals = {
    OPENAI_API_KEY: process.env.OPENAI_API_KEY,
    OPENROUTER_API_KEY: process.env.OPENROUTER_API_KEY,
    SUPABASE_URL: process.env.SUPABASE_URL,
    SITE_MAGIC_STORAGE_SERVICE_KEY: process.env.SITE_MAGIC_STORAGE_SERVICE_KEY,
    SITE_MAGIC_API_BASE_URL: process.env.SITE_MAGIC_API_BASE_URL,
    SITE_MAGIC_INTERNAL_API_KEY: process.env.SITE_MAGIC_INTERNAL_API_KEY,
  };
  Object.assign(process.env, {
    OPENAI_API_KEY: "test-key", OPENROUTER_API_KEY: "test-openrouter-key",
    SUPABASE_URL: "https://example.supabase.co",
    SITE_MAGIC_STORAGE_SERVICE_KEY: "test-service-key",
    SITE_MAGIC_API_BASE_URL: "https://control-plane.internal",
    SITE_MAGIC_INTERNAL_API_KEY: "test-internal-key",
  });
  try {
    const deps = buildProductionDependencies("tenant-1");
    assert.ok(deps.images instanceof OpenRouterImageGenerator);
  } finally {
    for (const [key, value] of Object.entries(originals)) {
      if (value === undefined) delete process.env[key]; else process.env[key] = value;
    }
  }
});

test("buildProductionDependencies throws ImageGeneratorNotConfiguredError when OPENROUTER_API_KEY is missing, even if OPENAI_API_KEY is set", () => {
  const originals = {
    OPENAI_API_KEY: process.env.OPENAI_API_KEY,
    OPENROUTER_API_KEY: process.env.OPENROUTER_API_KEY,
    SUPABASE_URL: process.env.SUPABASE_URL,
    SITE_MAGIC_STORAGE_SERVICE_KEY: process.env.SITE_MAGIC_STORAGE_SERVICE_KEY,
    SITE_MAGIC_API_BASE_URL: process.env.SITE_MAGIC_API_BASE_URL,
    SITE_MAGIC_INTERNAL_API_KEY: process.env.SITE_MAGIC_INTERNAL_API_KEY,
  };
  Object.assign(process.env, {
    OPENAI_API_KEY: "test-key", SUPABASE_URL: "https://example.supabase.co",
    SITE_MAGIC_STORAGE_SERVICE_KEY: "test-service-key",
    SITE_MAGIC_API_BASE_URL: "https://control-plane.internal",
    SITE_MAGIC_INTERNAL_API_KEY: "test-internal-key",
  });
  delete process.env.OPENROUTER_API_KEY;
  try {
    assert.throws(() => buildProductionDependencies("tenant-1"));
  } finally {
    for (const [key, value] of Object.entries(originals)) {
      if (value === undefined) delete process.env[key]; else process.env[key] = value;
    }
  }
});

test("resolveSource maps a url job", () => {
  const source = resolveSource({ source_type: "url", source_payload: { url: "https://example.com/" } });
  assert.deepEqual(source, { type: "url", url: "https://example.com/", ownershipAttested: true });
});

test("resolveSource maps a repository job", () => {
  const source = resolveSource({ source_type: "repository", source_payload: { surface: "agency" } });
  assert.deepEqual(source, { type: "repository", surface: "agency", internalAuthorization: true });
});

test("resolveSource maps an intake job carrying verified_facts", () => {
  const source = resolveSource({
    source_type: "intake",
    source_payload: { intake_id: "intake-1", verified_facts: { biz_name: "Acme HVAC", phone: "555-0100" } },
  });
  assert.deepEqual(source, {
    type: "intake", intakeId: "intake-1",
    verifiedFacts: { biz_name: "Acme HVAC", phone: "555-0100" },
  });
});

test("resolveSource refuses to fabricate intake verifiedFacts when the payload doesn't carry them", () => {
  assert.throws(
    () => resolveSource({ source_type: "intake", source_payload: { intake_id: "intake-1" } }),
    UnresolvableSourceError
  );
});

test("resolveSource rejects an intake job missing intake_id", () => {
  assert.throws(
    () => resolveSource({ source_type: "intake", source_payload: { verified_facts: {} } }),
    UnresolvableSourceError
  );
});

test("resolveSource rejects unknown source_type", () => {
  assert.throws(
    () => resolveSource({ source_type: "carrier_pigeon", source_payload: {} }),
    UnresolvableSourceError
  );
});

test("fetchJobRecord sends X-API-Key and the tenant_id query param", async () => {
  let seenUrl = "";
  let seenKey = "";
  const stubFetch = (async (url: string | URL, init?: RequestInit) => {
    seenUrl = url.toString();
    seenKey = (init?.headers as Record<string, string>)["X-API-Key"];
    return new Response(
      JSON.stringify({ job_id: "job-1", tenant_id: "tenant-1", source_type: "url", source_payload: { url: "https://example.com/" }, status: "queued" }),
      { status: 200, headers: { "content-type": "application/json" } }
    );
  }) as typeof fetch;
  const record = await fetchJobRecord("job-1", "tenant-1", {
    baseUrl: "https://control-plane.internal", apiKey: "internal-key", fetchImpl: stubFetch,
  });
  assert.equal(record.job_id, "job-1");
  assert.equal(seenKey, "internal-key");
  assert.match(seenUrl, /\/site-magic\/internal\/jobs\/job-1\?tenant_id=tenant-1$/);
});

test("fetchJobRecord throws on a non-ok response", async () => {
  const stubFetch = (async () => new Response("nope", { status: 404 })) as typeof fetch;
  await assert.rejects(
    fetchJobRecord("job-missing", "tenant-1", { baseUrl: "https://control-plane.internal", apiKey: "k", fetchImpl: stubFetch })
  );
});

test("dry run: full circuit from control-plane job record to a sealed build, no live credentials", async () => {
  const { deps, states } = fakeDependencies();
  const stubFetch = (async () =>
    new Response(
      JSON.stringify({
        job_id: "job-dry-run", tenant_id: "tenant-1", source_type: "url",
        source_payload: { url: "https://example.com/" }, status: "queued",
      }),
      { status: 200, headers: { "content-type": "application/json" } }
    )) as typeof fetch;

  const result = await processJob("job-dry-run", "tenant-1", () => deps, {
    baseUrl: "https://control-plane.internal", apiKey: "internal-key", fetchImpl: stubFetch,
  });

  assert.deepEqual(result, { status: "ready_for_review", buildId: "dry-run-build-1" });
  assert.equal(states.at(-1), "ready_for_review");
});

test("webhook server rejects a wrong shared secret", async () => {
  const { deps } = fakeDependencies();
  const server = startWebhookServer({
    port: 0, secret: "correct-secret", buildDeps: () => deps,
    controlPlane: { baseUrl: "https://control-plane.internal", apiKey: "internal-key" },
  });
  await new Promise((resolve) => server.once("listening", resolve));
  const port = (server.address() as AddressInfo).port;
  try {
    const response = await fetch(`http://127.0.0.1:${port}/`, {
      method: "POST", headers: { "X-Site-Magic-Secret": "wrong-secret", "Content-Type": "application/json" },
      body: JSON.stringify({ job_id: "job-1", tenant_id: "tenant-1" }),
    });
    assert.equal(response.status, 401);
  } finally {
    server.close();
  }
});

test("webhook server accepts the right secret, responds 202, and runs the job asynchronously", async () => {
  const { deps, states } = fakeDependencies();
  const stubFetch = (async () =>
    new Response(
      JSON.stringify({
        job_id: "job-webhook", tenant_id: "tenant-1", source_type: "url",
        source_payload: { url: "https://example.com/" }, status: "queued",
      }),
      { status: 200, headers: { "content-type": "application/json" } }
    )) as typeof fetch;

  let settled: { jobId: string; result: unknown } | undefined;
  const server = startWebhookServer({
    port: 0, secret: "correct-secret", buildDeps: () => deps,
    controlPlane: { baseUrl: "https://control-plane.internal", apiKey: "internal-key", fetchImpl: stubFetch },
    onJobSettled: (jobId, result) => { settled = { jobId, result }; },
  });
  await new Promise((resolve) => server.once("listening", resolve));
  const port = (server.address() as AddressInfo).port;
  try {
    const response = await fetch(`http://127.0.0.1:${port}/`, {
      method: "POST", headers: { "X-Site-Magic-Secret": "correct-secret", "Content-Type": "application/json" },
      body: JSON.stringify({ job_id: "job-webhook", tenant_id: "tenant-1" }),
    });
    assert.equal(response.status, 202);
    for (let i = 0; i < 50 && !settled; i += 1) {
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
    assert.equal(settled?.jobId, "job-webhook");
    assert.deepEqual(settled?.result, { status: "ready_for_review", buildId: "dry-run-build-1" });
    assert.equal(states.at(-1), "ready_for_review");
  } finally {
    server.close();
  }
});

/** Regression guard for a production misconfiguration that was live on
 * Railway: SITE_MAGIC_API_BASE_URL (this repo's control plane, set to
 * https://netbuild.pro) was also what OpenRouterCodegenRuntime read for its
 * LLM endpoint, so every codegen call would have gone to
 * https://netbuild.pro/chat/completions. The two are now separate vars and
 * must stay separate. */
test("codegen endpoint comes from SITE_MAGIC_CODEGEN_BASE_URL, never from the control-plane SITE_MAGIC_API_BASE_URL", () => {
  const keys = [
    "OPENAI_API_KEY", "OPENROUTER_API_KEY", "SUPABASE_URL",
    "SITE_MAGIC_STORAGE_SERVICE_KEY", "SITE_MAGIC_API_BASE_URL",
    "SITE_MAGIC_INTERNAL_API_KEY", "SITE_MAGIC_CODEGEN_BASE_URL",
    "SITE_MAGIC_DESIGN_MODEL", "SITE_MAGIC_USE_OMNIROUTE",
  ];
  const originals = Object.fromEntries(keys.map((k) => [k, process.env[k]]));
  const restore = () => {
    for (const [key, value] of Object.entries(originals)) {
      if (value === undefined) delete process.env[key]; else process.env[key] = value;
    }
  };
  Object.assign(process.env, {
    OPENAI_API_KEY: "test-key", OPENROUTER_API_KEY: "test-openrouter-key",
    SUPABASE_URL: "https://example.supabase.co",
    SITE_MAGIC_STORAGE_SERVICE_KEY: "test-service-key",
    SITE_MAGIC_API_BASE_URL: "https://control-plane.internal",
    SITE_MAGIC_INTERNAL_API_KEY: "test-internal-key",
  });
  delete process.env.SITE_MAGIC_CODEGEN_BASE_URL;
  delete process.env.SITE_MAGIC_DESIGN_MODEL;
  delete process.env.SITE_MAGIC_USE_OMNIROUTE;
  try {
    const codex = buildProductionDependencies("tenant-1").codex as unknown as {
      baseUrl: string; apiKey: string;
    };
    assert.equal(codex.baseUrl, "https://openrouter.ai/api/v1");
    assert.notEqual(codex.baseUrl, "https://control-plane.internal");
    // The real key, not the "dummy" placeholder that only a local
    // OmniRoute gateway accepts.
    assert.equal(codex.apiKey, "test-openrouter-key");

    process.env.SITE_MAGIC_CODEGEN_BASE_URL = "http://localhost:20128/v1";
    const gateway = buildProductionDependencies("tenant-1").codex as unknown as {
      baseUrl: string; apiKey: string;
    };
    assert.equal(gateway.baseUrl, "http://localhost:20128/v1");
    assert.equal(gateway.apiKey, "dummy");
  } finally {
    restore();
  }
});
