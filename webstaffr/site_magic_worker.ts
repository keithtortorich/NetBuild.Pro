/**
 * Executable worker entrypoint. Receives the webhook
 * HTTPWebhookSiteMagicQueue (site_magic_adapters.py) sends, pulls the full
 * job via the internal control-plane endpoint, and runs SiteMakerEngine
 * end to end, reporting every transition back through JobStateSink.
 *
 * Fail-closed like the rest of this repo: buildProductionDependencies()
 * throws a *NotConfiguredError immediately for anything missing rather
 * than degrading silently. It currently ALWAYS resolves `evidence` to
 * NullEvidenceRunner -- no real EvidenceRunner exists yet (that's
 * docs/STANDUP_2026-08-09_IMPECCABLE_PHASE_2.md Priority #2, deliberately
 * not built here). SiteMakerEngine.run() already catches that thrown
 * error and reports "failed", so a production run failing at the first
 * evaluating step is correct current behavior, not a bug in this file.
 */
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import type { Server } from "node:http";
import { timingSafeEqual } from "node:crypto";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  SiteMakerEngine,
  NullEvidenceRunner,
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
  OpenAIImageGenerator,
  SupabaseArtifactStore,
  HTTPJobStateSink,
} from "./site_magic_adapters.ts";

export class WorkerNotConfiguredError extends Error {}
export class UnresolvableSourceError extends Error {}

export interface WorkerDependencies {
  states: JobStateSink;
  codex: CodexRuntime;
  images: ImageGenerator;
  evidence: EvidenceRunner;
  artifacts: ArtifactStore;
}

/** Real adapters wired from env. `evidence` is deliberately still
 * NullEvidenceRunner -- see module docstring. */
export function buildProductionDependencies(): WorkerDependencies {
  return {
    states: new HTTPJobStateSink(),
    codex: new OpenAICodexRuntime(),
    images: new OpenAIImageGenerator(),
    evidence: new NullEvidenceRunner(),
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
  deps: WorkerDependencies,
  controlPlane: { baseUrl: string; apiKey: string; fetchImpl?: typeof fetch }
): Promise<{ status: "ready_for_review" | "failed" | "quarantined"; buildId?: string }> {
  const record = await fetchJobRecord(jobId, tenantId, controlPlane);
  const source = resolveSource(record);
  const workspace = await mkdtemp(join(tmpdir(), `site-magic-${jobId}-`));
  return runJob({ jobId, tenantId, workspace, source }, deps);
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
  deps: WorkerDependencies;
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
      processJob(jobId, tenantId, options.deps, options.controlPlane)
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
    deps: buildProductionDependencies(),
    controlPlane: { baseUrl, apiKey },
    onJobSettled: (jobId, result) => {
      console.log(`[site-magic-worker] job ${jobId} settled`, result);
    },
  });
  console.log(`[site-magic-worker] listening on :${port}`);
}
