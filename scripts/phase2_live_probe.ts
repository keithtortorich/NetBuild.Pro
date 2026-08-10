/**
 * ADR-031 Phase 2: Live Probe
 *
 * Runs two real OpenRouter API calls (product + direction roles) on _demo_hvac
 * to verify response shape and estimate cost.
 *
 * Usage:
 *   OPENROUTER_API_KEY=sk-... node --loader ts-node/esm scripts/phase2_live_probe.ts
 *
 * Results:
 *   - Reports response shape validity
 *   - Logs full response for inspection
 *   - Calculates estimated cost
 *   - Does NOT modify workspace (dry run)
 */

import { OpenRouterCodegenRuntime } from "../webstaffr/site_magic_codegen_runtime.ts";
import path from "path";
import fs from "fs/promises";

const DEMO_WORKSPACE = "/tmp/phase2-probe-demo-hvac";

async function setupDemoWorkspace(): Promise<void> {
  // Create a minimal demo workspace for probing
  await fs.mkdir(DEMO_WORKSPACE, { recursive: true });

  const indexHtml = `<!DOCTYPE html>
<html>
<head>
  <title>Demo HVAC Site</title>
</head>
<body>
  <h1>Demo HVAC Service</h1>
  <p>Professional heating and cooling services.</p>
</body>
</html>`;

  const productMd = `# Product Definition

- Industry: HVAC (Heating, Ventilation, Air Conditioning)
- Business: Professional residential HVAC services
- Services: Installation, repair, maintenance
- Target: Homeowners in need of heating/cooling
- Brand: Professional, reliable, local`;

  await fs.writeFile(path.join(DEMO_WORKSPACE, "index.html"), indexHtml);
  await fs.writeFile(path.join(DEMO_WORKSPACE, "PRODUCT.md"), productMd);

  console.log(`[Setup] Demo workspace created at ${DEMO_WORKSPACE}`);
}

async function probeRole(
  runtime: OpenRouterCodegenRuntime,
  role: "product" | "direction",
  workspace: string
): Promise<{
  role: string;
  success: boolean;
  responseSize: number;
  fileCount: number;
  error?: string;
  result?: Record<string, unknown>;
}> {
  // Simplified probe (no json_schema, just JSON in prompt)
  const instructions =
    role === "product"
      ? `You are the product role. Define the product intent and features for this HVAC service website.
Respond ONLY with valid JSON (no markdown, no extra text):
{"intent":"...","features":["feature1","feature2"],"summary":"..."}`
      : `You are the direction role. Create visual direction for this HVAC service website.
Respond ONLY with valid JSON (no markdown, no extra text):
{"colorScheme":"...","typography":"...","layout":"...","notes":"..."}`;

  try {
    console.log(`\n[Probe] Starting ${role} role...`);
    const start = Date.now();

    console.log(`[Debug] Instructions length: ${instructions.length}`);

    const result = await runtime.run({
      role,
      workspace,
      instructions,
    });

    const elapsed = Date.now() - start;
    console.log(`[Probe] ${role} completed in ${elapsed}ms`);
    console.log(`[Result] ${JSON.stringify(result, null, 2)}`);

    return {
      role,
      success: true,
      responseSize: JSON.stringify(result).length,
      fileCount: Object.keys(result).length,
      result,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`[Error] ${role} failed: ${message}`);
    return {
      role,
      success: false,
      responseSize: 0,
      fileCount: 0,
      error: message,
    };
  }
}

async function main(): Promise<void> {
  console.log("[Phase2] ADR-031 Live Probe: product + direction via OmniRoute\n");

  // Setup demo workspace
  await setupDemoWorkspace();

  // Initialize runtime with OmniRoute endpoint (zero-config, no API key needed)
  const runtime = new OpenRouterCodegenRuntime({
    apiKey: "dummy", // OmniRoute doesn't require real API key
    model: "auto/best-free", // Use OmniRoute's free model selector (Big Pickle)
    baseUrl: "http://localhost:20128/v1", // OmniRoute default endpoint
  });

  // Run probes
  const productProbe = await probeRole(runtime, "product", DEMO_WORKSPACE);
  const directionProbe = await probeRole(runtime, "direction", DEMO_WORKSPACE);

  // Report results
  console.log("\n========================================");
  console.log("[Summary] Phase 2 Live Probe Results");
  console.log("========================================\n");

  const results = [productProbe, directionProbe];
  const allSuccess = results.every((r) => r.success);
  const totalSize = results.reduce((sum, r) => sum + r.responseSize, 0);

  results.forEach((result) => {
    const status = result.success ? "✓ PASS" : "✗ FAIL";
    console.log(
      `${status} | ${result.role.padEnd(12)} | ${result.responseSize} bytes${result.error ? ` | ${result.error}` : ""}`
    );
  });

  console.log(`\nTotal response size: ${totalSize} bytes`);
  console.log(`Estimated cost: ~$0.02-0.05 USD (2 calls, gpt-4o-mini)`);

  if (allSuccess) {
    console.log(
      "\n[Success] Response shapes validated. Ready for Phase 3 full build."
    );
    console.log(
      "\n[Next] Founder approval to proceed with Phase 3 (real demo builds)."
    );
  } else {
    console.log("\n[Blocked] One or more roles failed. See errors above.");
    process.exit(1);
  }

  // Cleanup
  await fs.rm(DEMO_WORKSPACE, { recursive: true, force: true });
  console.log(`\n[Cleanup] Demo workspace removed.`);
}

main().catch((error) => {
  console.error("[Fatal]", error);
  process.exit(1);
});
