/**
 * Deterministic EvidenceRunner: Playwright browser evidence, axe-core
 * accessibility violations, Lighthouse scores, and the real Impeccable
 * `detect` CLI's anti-pattern count.
 *
 * Deliberately does NOT attempt designScore/applicableMax/findings --
 * see site_maker_engine.ts's mergeDesignAssessment() docstring for why
 * that needs the design_assessor codex role's LLM judgment instead
 * (Impeccable's critique/audit commands are Claude Code sub-agent
 * workflows, not a scriptable CLI; only `detect` is deterministic, and
 * that maps to detectorFindings, not a design score). This class returns
 * those three fields as an honest placeholder (0/0/[]) -- normalizedScore
 * of 0/0 is 0 (site_maker_engine.ts's normalizedScore()), so a caller
 * that skips SiteMakerEngine's merge step gets a report that fails every
 * gate, never one that looks passing.
 *
 * Scope notes on the two judgment-adjacent boolean fields:
 *  - contentIntegrityPassed checks the rendered text for literal
 *    placeholder/unresolved-template markers (Lorem ipsum, unresolved
 *    {{...}} tokens, "TODO", "[PLACEHOLDER]") -- catches leftover
 *    template scaffolding, not subtler fabrication (that's the
 *    design_assessor's job, and ultimately the no-fabrication rule
 *    enforced at the data layer by site_data.py).
 *  - tenantIsolationPassed checks that no *other* tenant's site-asset
 *    path (`/sites/<other-tenant-id>/...`) appears hardcoded in the
 *    rendered output. It needs the owning tenantId to compare against,
 *    which the EvidenceRunner interface's {workspace, widths} doesn't
 *    carry -- this class takes tenantId as a constructor argument
 *    instead, same as every other adapter's config-at-construction shape
 *    in this repo.
 *  - functionalChecksPassed means exactly one thing here: zero uncaught
 *    JS exceptions (page.on("pageerror")) across the full crawl. It does
 *    not click through forms or interactive flows -- a generated
 *    marketing site has no server-side state to safely fuzz here, and a
 *    broader definition would need per-template knowledge this class
 *    doesn't have.
 */
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { readFile, stat } from "node:fs/promises";
import { readFileSync } from "node:fs";
import { join, extname, normalize, sep } from "node:path";
import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import { chromium, type Browser } from "playwright";
import lighthouse from "lighthouse";
import type { EvidenceRunner, QualityReport } from "./site_maker_engine.ts";

export class EvidenceRunnerError extends Error {}

const require = createRequire(import.meta.url);

const CONTENT_TYPES: Record<string, string> = {
  ".html": "text/html; charset=utf-8", ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8", ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml", ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg",
  ".webp": "image/webp", ".woff": "font/woff", ".woff2": "font/woff2", ".ico": "image/x-icon",
};

const PLACEHOLDER_PATTERNS = [/lorem ipsum/i, /\{\{\s*[\w.]+\s*\}\}/, /\btodo\b/i, /\[placeholder\]/i];

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Entry documents tried for `/`, in order. `index.html` is what the Site
 * Magic builder role emits; `home.html` is what the offline Jinja generator
 * (site_magic_engine.py) writes. Serving only `index.html` meant a workspace
 * from the latter answered `/` with a 404, which Lighthouse then audited and
 * scored 0 across every category -- an all-zeros report with no finding that
 * says why, which reads as a catastrophically bad site rather than a missing
 * entry file. */
const ENTRY_CANDIDATES = ["index.html", "home.html"] as const;

async function resolveEntryPath(rootNormalized: string): Promise<string> {
  for (const candidate of ENTRY_CANDIDATES) {
    const info = await stat(join(rootNormalized, candidate)).catch(() => null);
    if (info?.isFile()) return `/${candidate}`;
  }
  return `/${ENTRY_CANDIDATES[0]}`;
}

/** Serves `root` over plain HTTP on an OS-assigned loopback port --
 * Playwright and Lighthouse both need a real URL, not a file:// path
 * (Lighthouse's network-dependent audits don't run against file://).
 *
 * `staticRoot`, when given, is mounted at `/static/`. Rendered pages
 * reference `/static/site.css` and `/static/angel-widget.js`, which the
 * FastAPI app serves from routes rather than from the workspace. Without the
 * mount those are unreachable here, so a site that is perfectly fine when the
 * app serves it still reported missing assets, console errors, and failed
 * requests at every width -- enough to fail deterministicGatesPass on its
 * own. The mount serves the same real files those routes read. */
export function startStaticServer(
  root: string,
  staticRoot?: string
): Promise<{ server: Server; baseUrl: string }> {
  const rootNormalized = normalize(root);
  const staticNormalized = staticRoot ? normalize(staticRoot) : undefined;
  return new Promise((resolve) => {
    const server = createServer(async (req, res) => {
      try {
        const urlPath = decodeURIComponent((req.url ?? "/").split("?")[0]);

        let base = rootNormalized;
        let relative = urlPath;
        if (staticNormalized && (urlPath === "/static" || urlPath.startsWith("/static/"))) {
          base = staticNormalized;
          relative = urlPath.slice("/static".length) || "/";
        } else if (urlPath === "/") {
          relative = await resolveEntryPath(rootNormalized);
        }

        const resolved = normalize(join(base, relative));
        if (resolved !== base && !resolved.startsWith(base + sep)) {
          res.writeHead(403).end();
          return;
        }
        const info = await stat(resolved).catch(() => null);
        const filePath = info?.isDirectory()
          ? join(resolved, (await resolveEntryPath(resolved)).slice(1))
          : resolved;
        const body = await readFile(filePath);
        res.writeHead(200, { "content-type": CONTENT_TYPES[extname(filePath)] ?? "application/octet-stream" });
        res.end(body);
      } catch {
        res.writeHead(404).end("not found");
      }
    });
    server.listen(0, "127.0.0.1", () => {
      const { port } = server.address() as AddressInfo;
      resolve({ server, baseUrl: `http://127.0.0.1:${port}/` });
    });
  });
}

/** Shells out to Impeccable's real, deterministic `detect` CLI
 * (.claude/skills/impeccable/scripts/detector/cli/main.mjs) -- the only
 * part of Impeccable that's actually scriptable. Exit code 0 = clean,
 * 2 = findings; anything else means the scan itself didn't run, and
 * reporting 0 findings in that case would be a false pass, not a clean
 * result -- so this throws instead. */
export function runImpeccableDetect(
  workspace: string,
  cliPath: string = join(process.cwd(), ".claude/skills/impeccable/scripts/detector/cli/main.mjs")
): number {
  const result = spawnSync(process.execPath, [cliPath, "--json", workspace], { encoding: "utf-8" });
  if (result.status !== 0 && result.status !== 2) {
    throw new EvidenceRunnerError(
      `impeccable detect failed to run (exit ${result.status}): ${result.stderr || result.stdout}`
    );
  }
  const findings = JSON.parse(result.stdout || "[]");
  return Array.isArray(findings) ? findings.length : 0;
}

export class PlaywrightEvidenceRunner implements EvidenceRunner {
  private readonly tenantId: string;
  private readonly detectCliPath?: string;
  private readonly staticRoot?: string;

  constructor(options: { tenantId: string; detectCliPath?: string; staticRoot?: string }) {
    this.tenantId = options.tenantId;
    this.detectCliPath = options.detectCliPath;
    this.staticRoot = options.staticRoot;
  }

  async assess(args: { workspace: string; widths: readonly [390, 768, 1440] }): Promise<QualityReport> {
    const detectorFindings = this.detectCliPath
      ? runImpeccableDetect(args.workspace, this.detectCliPath)
      : runImpeccableDetect(args.workspace);
    const axeSource = readFileSync(require.resolve("axe-core/axe.min.js"), "utf-8");
    const { server, baseUrl } = await startStaticServer(args.workspace, this.staticRoot);
    const debugPort = 9200 + (process.pid % 300);
    let browser: Browser | undefined;
    try {
      browser = await chromium.launch({ args: [`--remote-debugging-port=${debugPort}`] });

      let consoleErrors = 0;
      let failedRequests = 0;
      let brokenLinks = 0;
      let missingAssets = 0;
      let pageErrors = 0;
      let responsiveChecksPassed = true;
      let bodyText = "";
      const axeViolationIds = new Set<string>();

      for (const width of args.widths) {
        const page = await browser.newPage({ viewport: { width, height: 900 } });
        page.on("console", (msg) => { if (msg.type() === "error") consoleErrors += 1; });
        page.on("pageerror", () => { pageErrors += 1; });
        page.on("requestfailed", () => { failedRequests += 1; });
        page.on("response", (response) => {
          if (response.status() < 400) return;
          const type = response.request().resourceType();
          if (type === "document" || type === "xhr" || type === "fetch") brokenLinks += 1;
          else missingAssets += 1;
        });

        await page.goto(baseUrl, { waitUntil: "networkidle" });

        const overflowing = await page.evaluate(
          (w) => document.documentElement.scrollWidth > w + 1,
          width
        );
        if (overflowing) responsiveChecksPassed = false;

        if (width === args.widths[args.widths.length - 1]) {
          bodyText = await page.evaluate(() => document.body.innerText);
        }

        await page.addScriptTag({ content: axeSource });
        const violations = await page.evaluate(async () => {
          // @ts-expect-error axe is injected as a global by the script tag above
          const result = await axe.run();
          return result.violations.map((v: { id: string }) => v.id);
        });
        for (const id of violations as string[]) axeViolationIds.add(id);

        await page.close();
      }

      const lighthouseResult = await lighthouse(baseUrl, {
        port: debugPort, logLevel: "silent", output: "json",
        onlyCategories: ["accessibility", "performance", "best-practices", "seo"],
      });
      const categories = lighthouseResult?.lhr?.categories;
      if (!categories) {
        throw new EvidenceRunnerError("Lighthouse returned no categories");
      }
      const pct = (score: number | null | undefined) => Math.round((score ?? 0) * 100);

      const contentIntegrityPassed = !PLACEHOLDER_PATTERNS.some((pattern) => pattern.test(bodyText));
      const otherTenantLeak = new RegExp(`/sites/(?!${escapeRegExp(this.tenantId)}/)[^/"'\\s]+/`);
      const tenantIsolationPassed = !otherTenantLeak.test(bodyText);

      return {
        designScore: 0, applicableMax: 0, findings: [],
        detectorFindings,
        axeViolations: axeViolationIds.size,
        lighthouse: {
          accessibility: pct(categories.accessibility?.score),
          performance: pct(categories.performance?.score),
          bestPractices: pct(categories["best-practices"]?.score),
          seo: pct(categories.seo?.score),
        },
        brokenLinks, missingAssets, consoleErrors, failedRequests,
        responsiveChecksPassed,
        functionalChecksPassed: pageErrors === 0,
        contentIntegrityPassed,
        tenantIsolationPassed,
      };
    } finally {
      await browser?.close();
      server.close();
    }
  }
}
