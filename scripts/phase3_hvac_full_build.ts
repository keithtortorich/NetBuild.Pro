/**
 * ADR-031 Phase 3: Full HVAC Build
 *
 * Runs SiteMakerEngine end-to-end for _demo_hvac:
 * 1. Product role (intent + features)
 * 2. Direction role (visual direction)
 * 3. Builder role (HTML/CSS/JS)
 * 4. Design assessor role (quality critique)
 * 5. Remediator role (fix issues if needed)
 * 6. Finish reviewer role (final verdict)
 * 7. Publish artifact
 *
 * Requirements:
 * - OmniRoute running on localhost:20128
 * - _demo_hvac intake exists in database (from demo_sites.py)
 *
 * Usage:
 *   npx tsx scripts/phase3_hvac_full_build.ts
 */

import {
  SiteMakerEngine,
  type SiteMagicJobInput,
  type SiteSource,
} from "../webstaffr/site_maker_engine.ts";
import {
  OpenRouterCodegenRuntime,
} from "../webstaffr/site_magic_codegen_runtime.ts";
import {
  PlaywrightEvidenceRunner,
} from "../webstaffr/site_magic_evidence_runner.ts";
import type { JobStateSink } from "../webstaffr/site_maker_engine.ts";
import path from "path";
import fs from "fs/promises";

const DEMO_TENANT_ID = "_demo_hvac";
const WORKSPACE_ROOT = "/tmp/phase3-hvac-build";

// Mock sink for Phase 3 (just logs state transitions, doesn't persist)
class LoggingJobStateSink implements JobStateSink {
  async transition(args: {
    job_id: string;
    status: string;
    building?: { metadata?: Record<string, unknown> };
    remediation_rounds?: number;
    rebuild_count?: number;
    quality_summary?: Record<string, unknown>;
    failure_code?: string;
    event_id?: string;
  }): Promise<void> {
    console.log(`  [State] ${args.job_id} → ${args.status}`);
  }
}

async function setupWorkspace(): Promise<void> {
  await fs.mkdir(WORKSPACE_ROOT, { recursive: true });

  const hvacIntake = {
    industry: "hvac",
    businessName: "Professional HVAC Services",
    services: ["Installation", "Repair", "Maintenance"],
    contactEmail: "contact@hvac.example.com",
    contactPhone: "(555) 123-4567",
    serviceArea: "Metro area",
  };

  const productMd = `# HVAC Product Definition

Industry: HVAC (Heating, Ventilation, Air Conditioning)
Business: ${hvacIntake.businessName}
Services: ${hvacIntake.services.join(", ")}
Contact: ${hvacIntake.contactPhone} | ${hvacIntake.contactEmail}
Service Area: ${hvacIntake.serviceArea}

Target Audience: Homeowners needing professional heating and cooling services
Brand: Professional, reliable, local, emergency-ready
Value Proposition: Fast, trustworthy HVAC solutions for residential clients`;

  await fs.writeFile(
    path.join(WORKSPACE_ROOT, "intake.json"),
    JSON.stringify(hvacIntake, null, 2)
  );
  await fs.writeFile(
    path.join(WORKSPACE_ROOT, "PRODUCT.md"),
    productMd
  );

  console.log(`[Setup] HVAC workspace prepared at ${WORKSPACE_ROOT}`);
}

async function runBuild(): Promise<void> {
  console.log("[Phase3] ADR-031 Full HVAC Build via SiteMakerEngine\n");

  // Setup workspace
  await setupWorkspace();

  // Initialize runtime with OmniRoute
  const runtime = new OpenRouterCodegenRuntime({
    apiKey: "dummy",
    model: "auto/best-free",
    baseUrl: "http://localhost:20128/v1",
  });

  // Use real evidence runner (Playwright + axe + Lighthouse + Impeccable)
  const evidenceRunner = new PlaywrightEvidenceRunner({ tenantId: DEMO_TENANT_ID });

  // Create engine with mock sink for Phase 3
  const engine = new SiteMakerEngine({
    codex: runtime,
    evidence: evidenceRunner,
    states: new LoggingJobStateSink(),
    artifacts: undefined as any, // Not used in Phase 3
    fetch: global.fetch,
  });

  // Define HVAC job
  const jobInput: SiteMagicJobInput = {
    job_id: "phase3-hvac-001",
    tenant_id: DEMO_TENANT_ID,
    source: {
      type: "intake",
      payload: {
        intake_id: "phase3-hvac-001",
        verified_facts: {
          industry: "hvac",
          businessName: "Professional HVAC Services",
          services: ["Installation", "Repair", "Maintenance"],
          contactPhone: "(555) 123-4567",
          contactEmail: "contact@hvac.example.com",
          serviceArea: "Metro area",
        },
      },
    } as SiteSource,
  };

  console.log("[Build] Starting SiteMakerEngine pipeline...\n");
  const start = Date.now();

  try {
    // Run the full pipeline (engine.run() takes only the job, workspace must be in config)
    const finalState = await engine.run(jobInput);

    const elapsed = Date.now() - start;

    console.log("\n========================================");
    console.log("[Summary] Phase 3 HVAC Build Complete");
    console.log("========================================\n");

    console.log(`Status: ${finalState.status}`);
    console.log(`Elapsed: ${(elapsed / 1000).toFixed(1)}s`);

    if (finalState.status === "ready_for_review") {
      console.log("\n✓ Build succeeded. Ready for launch.");
      console.log("\n[Next Steps]");
      console.log("1. Review published artifact");
      console.log("2. Scale to remaining 8 demos");
      console.log("3. Launch Phase 4 (production routing)");
    } else if (finalState.status === "quarantined") {
      console.log("\n✗ Build quarantined after remediation attempts.");
      console.log("Review logs for blocking issues.");
    } else {
      console.log(`\n? Build status: ${finalState.status}`);
    }

    // Log final state
    console.log(`\nFinal state: ${JSON.stringify(finalState, null, 2).slice(0, 500)}...`);
  } catch (error) {
    console.error("\n[Error] Build failed:", error instanceof Error ? error.message : String(error));
    process.exit(1);
  }

  // Cleanup
  await fs.rm(WORKSPACE_ROOT, { recursive: true, force: true });
  console.log(`\n[Cleanup] Workspace removed.`);
}

runBuild().catch((error) => {
  console.error("[Fatal]", error);
  process.exit(1);
});
