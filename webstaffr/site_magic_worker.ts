/**
 * Executable worker entrypoint. Receives the webhook
 * HTTPWebhookSiteMagicQueue (site_magic_adapters.py) sends, pulls the full
 * job via the internal control-plane endpoint, and runs SiteMakerEngine
 * end to end, reporting every transition back through JobStateSink.
 *
 * Fail-closed like the rest of this repo: buildProductionDependencies()
 * throws a *NotConfiguredError immediately for anything missing rather
 * than degrading silently.
 *
 * Dependencies are built per job, not once at server startup:
 * PlaywrightEvidenceRunner (site_magic_evidence_runner.ts) needs the
 * job's own tenantId at construction (tenantIsolationPassed checks for a
 * hardcoded *other*-tenant path, which requires knowing which tenant is
 * "self"), so there is no single WorkerDependencies value that's valid
 * across jobs for different tenants. buildDeps is a factory, called once
 * per incoming webhook after the tenant_id is known.
 */
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import type { Server } from "node:http";
import { timingSafeEqual } from "node:crypto";
import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  SiteMakerEngine,
  type SiteMagicJobInput,
  type SiteSource,
  type CodexRuntime,
  type ImageGenerator,
  type EvidenceRunner,
  type ArtifactStore,
  type JobStateSink,
} from "./site_maker_engine.ts";
import {
  OpenAICodexRuntime,
  OpenRouterImageGenerator,
  SupabaseArtifactStore,
  HTTPJobStateSink,
} from "./site_magic_adapters.ts";
import { OpenRouterCodegenRuntime } from "./site_magic_codegen_runtime.ts";
import {
  OpenAICompatibleCodegenRuntime,
  OpenAICompatibleImageGenerator,
} from "./site_magic_ai_compatible.ts";
import { PlaywrightEvidenceRunner } from "./site_magic_evidence_runner.ts";

/** Rendered pages reference /static/site.css and /static/angel-widget.js,
 * served by site_render_router.py from this same directory (dedicated
 * routes, not a StaticFiles mount -- see that file's module docstring).
 * Without this, PlaywrightEvidenceRunner's standalone workspace server
 * knows nothing about /static/ and every job reports those assets missing. */
const APP_STATIC_ROOT = join(fileURLToPath(new URL(".", import.meta.url)), "templates", "site", "static");

export class WorkerNotConfiguredError extends Error {}
export class UnresolvableSourceError extends Error {}

export interface WorkerDependencies {
  states: JobStateSink;
  codex: CodexRuntime;
  images: ImageGenerator;
  evidence: EvidenceRunner;
  artifacts: ArtifactStore;
}

export type DependencyFactory = (tenantId: string) => WorkerDependencies;

/** Real adapters wired from env, built fresh per job -- see module
 * docstring for why `evidence` can't be a single shared instance.
 *
 * Vendor priority:
 * 1. SITE_MAGIC_USE_AI_COMPATIBLE=true → OpenAI-compatible endpoint (Ollama, NVIDIA, vLLM)
 *    configured via OPENAI_COMPATIBLE_BASE_URL, OPENAI_COMPATIBLE_API_KEY, OPENAI_COMPATIBLE_MODEL
 * 2. SITE_MAGIC_USE_OMNIROUTE=true (default) → OpenRouter via OmniRoute (ADR-031)
 * 3. SITE_MAGIC_USE_OMNIROUTE=false → OpenAI Codex runtime
 *
 * Images use the matching OpenAI-compatible endpoint when explicitly
 * selected; otherwise they remain on the established OpenRouter adapter.
 */
export function buildProductionDependencies(tenantId: string): WorkerDependencies {
  // Vendor priority: OpenAI-compatible (Ollama/NVIDIA/vLLM) → OpenRouter/OmniRoute → OpenAI
  const useAICompatible = process.env.SITE_MAGIC_USE_AI_COMPATIBLE === "true";
  const useOmniRoute = process.env.SITE_MAGIC_USE_OMNIROUTE !== "false";
  const codegenBaseUrl = process.env.SITE_MAGIC_CODEGEN_BASE_URL;
  const viaLocalGateway = Boolean(codegenBaseUrl?.includes("localhost"));

  let codexRuntime: CodexRuntime;
  let imageGenerator: ImageGenerator;

  if (useAICompatible) {
    // Use generic OpenAI-compatible implementations (Ollama, NVIDIA, vLLM, etc.)
    codexRuntime = new OpenAICompatibleCodegenRuntime();
    imageGenerator = new OpenAICompatibleImageGenerator();
  } else if (useOmniRoute) {
    // Vendor-independent CodexRuntime via OmniRoute (ADR-031): 290 providers,
    // auto-fallback, free tiers.
    //
    // The endpoint comes from SITE_MAGIC_CODEGEN_BASE_URL, NOT
    // SITE_MAGIC_API_BASE_URL -- the latter is this repo's own control plane
    // (HTTPJobStateSink/fetchJobRecord post to it), and in production it is
    // https://netbuild.pro, which is not an OpenAI-compatible LLM endpoint.
    // Unset means openrouter.ai directly, authenticated with
    // OPENROUTER_API_KEY. Point it at a local OmniRoute gateway
    // (http://localhost:20128/v1) to route through that instead.
    codexRuntime = new OpenRouterCodegenRuntime(
      viaLocalGateway
        ? {
            apiKey: "dummy",
            model: process.env.SITE_MAGIC_DESIGN_MODEL ?? "openai/gpt-5.6-terra",
            baseUrl: codegenBaseUrl,
          }
        : { baseUrl: codegenBaseUrl }
    );
    imageGenerator = new OpenRouterImageGenerator();
  } else {
    // Fallback to OpenAI's Codex runtime while retaining the approved
    // OpenRouter image path (GPT Image org access remains unapproved).
    codexRuntime = new OpenAICodexRuntime();
    imageGenerator = new OpenRouterImageGenerator();
  }

  return {
    states: new HTTPJobStateSink(),
    codex: codexRuntime,
    images: imageGenerator,
    evidence: new PlaywrightEvidenceRunner({ tenantId, staticRoot: APP_STATIC_ROOT }),
    artifacts: new SupabaseArtifactStore(),
  };
}

export interface JobRecord {
  job_id: string;
  tenant_id: string;
  source_type: string;
  source_payload: Record<string, unknown>;
  status: string;
}

type RendererBaseline = { path: string; pages: string[] };

function resolveRendererBaseline(payload: Record<string, unknown>): RendererBaseline | undefined {
  const value = payload.renderer_baseline;
  if (value === undefined) return undefined;
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new UnresolvableSourceError("intake renderer_baseline must be an object");
  }
  const path = (value as Record<string, unknown>).path;
  const pages = (value as Record<string, unknown>).pages;
  if (typeof path !== "string" || !path.startsWith("/sites/") || !path.endsWith("/web")) {
    throw new UnresolvableSourceError("intake renderer_baseline.path is invalid");
  }
  if (!Array.isArray(pages) || pages.some((page) => typeof page !== "string")) {
    throw new UnresolvableSourceError("intake renderer_baseline.pages is invalid");
  }
  return { path, pages: pages as string[] };
}

async function materializeRendererBaseline(
  baseline: RendererBaseline,
  workspace: string,
  controlPlane: { baseUrl: string; fetchImpl?: typeof fetch },
): Promise<string> {
  const fetchImpl = controlPlane.fetchImpl ?? fetch;
  const url = `${controlPlane.baseUrl.replace(/\/+$/, "")}${baseline.path}`;
  const response = await fetchImpl(url);
  if (!response.ok) {
    throw new UnresolvableSourceError(`renderer baseline fetch failed: ${response.status}`);
  }
  const dir = join(workspace, "renderer-baseline");
  await mkdir(dir, { recursive: true });
  const target = join(dir, "index.html");
  const html = await response.text();
  await writeFile(target, html, "utf8");
  // Seed the audited entry with the deterministic renderer output. The
  // builder normally replaces this file with its authored design, but a
  // malformed/truncated provider response must never leave Lighthouse
  // requesting a nonexistent document (a real production 404 on job 53).
  await writeFile(join(workspace, "index.html"), html, "utf8");
  await writeFile(join(dir, "manifest.json"), JSON.stringify({ sourceUrl: url, pages: baseline.pages }, null, 2), "utf8");
  return "renderer-baseline/index.html";
}

export async function fetchJobRecord(
  jobId: string,
  tenantId: string,
  options: { baseUrl: string; apiKey: string; fetchImpl?: typeof fetch }
): Promise<JobRecord> {
  const fetchImpl = options.fetchImpl ?? fetch;
  const url = `${options.baseUrl.replace(/\/+$/, "")}/site-magic/internal/jobs/${jobId}?tenant_id=${encodeURIComponent(tenantId)}`;
  const response = await fetchImpl(url, { headers: { "X-API-Key": options.apiKey } });
  if (!response.ok) {
    throw new Error(`Fetching Site Magic job ${jobId} failed: ${response.status} ${await response.text()}`);
  }
  return (await response.json()) as JobRecord;
}

/**
 * Maps the control-plane's generic source_payload into SiteMakerEngine's
 * discriminated SiteSource. "url" and "repository" follow directly from
 * the payload shape SiteSource already defines. "intake" carries
 * verified_facts alongside intake_id -- intake_router.py's
 * _enqueue_site_magic_job_if_configured() writes
 * build_public_site_data(submission)'s output there (the same
 * internal-fields-stripped projection GET /sites/{tenant_id} serves), so
 * this is the vetted public-safe view, not a raw intake_submissions dump.
 * A job enqueued before that field existed (or any malformed payload)
 * throws rather than silently treating an empty object as "no facts" --
 * SiteSource.verifiedFacts feeding PRODUCT.md is exactly where a
 * fabricated or wrong fact would become public site content.
 */
export function resolveSource(record: Pick<JobRecord, "source_type" | "source_payload">): SiteSource {
  switch (record.source_type) {
    case "url": {
      const url = record.source_payload.url;
      if (typeof url !== "string") throw new UnresolvableSourceError("url source_payload missing 'url'");
      return { type: "url", url, ownershipAttested: true };
    }
    case "repository": {
      const surface = record.source_payload.surface;
      if (typeof surface !== "string") throw new UnresolvableSourceError("repository source_payload missing 'surface'");
      return { type: "repository", surface, internalAuthorization: true };
    }
    case "intake": {
      const intakeId = record.source_payload.intake_id;
      const verifiedFacts = record.source_payload.verified_facts;
      if (typeof intakeId !== "string") {
        throw new UnresolvableSourceError("intake source_payload missing 'intake_id'");
      }
      if (typeof verifiedFacts !== "object" || verifiedFacts === null || Array.isArray(verifiedFacts)) {
        throw new UnresolvableSourceError(
          "intake source_payload missing 'verified_facts' -- job was likely enqueued before intake_router.py started writing it"
        );
      }
      return { type: "intake", intakeId, verifiedFacts: verifiedFacts as Record<string, unknown> };
    }
    default:
      throw new UnresolvableSourceError(`Unknown Site Magic source_type: ${record.source_type}`);
  }
}

export async function runJob(
  input: SiteMagicJobInput,
  deps: WorkerDependencies
): Promise<{ status: "ready_for_review" | "failed" | "quarantined"; buildId?: string }> {
  return new SiteMakerEngine(deps).run(input);
}

export async function processJob(
  jobId: string,
  tenantId: string,
  buildDeps: DependencyFactory,
  controlPlane: { baseUrl: string; apiKey: string; fetchImpl?: typeof fetch }
): Promise<{ status: "ready_for_review" | "failed" | "quarantined"; buildId?: string }> {
  const record = await fetchJobRecord(jobId, tenantId, controlPlane);
  let source = resolveSource(record);
  const workspace = await mkdtemp(join(tmpdir(), `site-magic-${jobId}-`));
  if (source.type === "intake") {
    const baseline = resolveRendererBaseline(record.source_payload);
    if (baseline) {
      const baselinePath = await materializeRendererBaseline(baseline, workspace, controlPlane);
      source = { ...source, rendererBaselinePath: baselinePath };
    }
  }
  return runJob({ jobId, tenantId, workspace, source }, buildDeps(tenantId));
}

function verifySecret(provided: string | undefined, expected: string): boolean {
  if (!provided) return false;
  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

/**
 * HTTP receiver for HTTPWebhookSiteMagicQueue's POST {job_id, tenant_id}
 * (site_magic_adapters.py:28-68), authenticated the same way that class
 * documents on its own side: X-Site-Magic-Secret, constant-time compare.
 * The webhook contract is fire-and-forget -- responds 202 immediately,
 * then pulls and runs the job asynchronously -- so a slow SiteMakerEngine
 * run never holds the HTTP connection open.
 */
export function startWebhookServer(options: {
  port: number;
  secret: string;
  buildDeps: DependencyFactory;
  controlPlane: { baseUrl: string; apiKey: string; fetchImpl?: typeof fetch };
  onJobSettled?: (
    jobId: string,
    result: { status: "ready_for_review" | "failed" | "quarantined"; buildId?: string } | { error: unknown }
  ) => void;
}): Server {
  const server = createServer((req: IncomingMessage, res: ServerResponse) => {
    if (req.method !== "POST") {
      res.writeHead(405).end();
      return;
    }
    const provided = req.headers["x-site-magic-secret"];
    if (!verifySecret(typeof provided === "string" ? provided : undefined, options.secret)) {
      res.writeHead(401).end();
      return;
    }
    let body = "";
    req.on("data", (chunk) => { body += chunk; });
    req.on("end", () => {
      let payload: { job_id?: unknown; tenant_id?: unknown };
      try {
        payload = JSON.parse(body || "{}");
      } catch {
        res.writeHead(400).end();
        return;
      }
      if (typeof payload.job_id !== "string" || typeof payload.tenant_id !== "string") {
        res.writeHead(422).end();
        return;
      }
      res.writeHead(202).end();
      const jobId = payload.job_id;
      const tenantId = payload.tenant_id;
      processJob(jobId, tenantId, options.buildDeps, options.controlPlane)
        .then((result) => options.onJobSettled?.(jobId, result))
        .catch((error) => options.onJobSettled?.(jobId, { error }));
    });
  });
  server.listen(options.port);
  return server;
}

const isMainModule = process.argv[1] !== undefined && fileURLToPath(import.meta.url) === process.argv[1];
if (isMainModule) {
  const port = Number(process.env.SITE_MAGIC_WORKER_PORT ?? "8090");
  const secret = process.env.SITE_MAGIC_WORKER_WEBHOOK_SECRET;
  const baseUrl = process.env.SITE_MAGIC_API_BASE_URL;
  const apiKey = process.env.SITE_MAGIC_INTERNAL_API_KEY;
  if (!secret || !baseUrl || !apiKey) {
    throw new WorkerNotConfiguredError(
      "SITE_MAGIC_WORKER_WEBHOOK_SECRET, SITE_MAGIC_API_BASE_URL, and SITE_MAGIC_INTERNAL_API_KEY are required to start the worker."
    );
  }
  startWebhookServer({
    port,
    secret,
    buildDeps: buildProductionDependencies,
    controlPlane: { baseUrl, apiKey },
    onJobSettled: (jobId, result) => {
      // `settled { status: 'failed' }` on its own is unactionable -- it was
      // all the worker said about the first real production job, which had
      // died on an OpenRouter 401. The engine now puts a redacted reason in
      // failure_code; surface it here too so the Railway log alone is enough.
      console.log(`[site-magic-worker] job ${jobId} settled`, result);
      if (result?.status === "failed" || result?.status === "quarantined") {
        console.error(
          `[site-magic-worker] job ${jobId} did not ship: ${result.failureCode ?? "no reason recorded"}`
        );
      }
    },
  });
  console.log(`[site-magic-worker] listening on :${port}`);
}
