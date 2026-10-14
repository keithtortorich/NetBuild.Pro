/**
 * OpenAI-compatible Site Magic adapters.
 *
 * Code generation deliberately delegates to the established OpenRouter
 * runtime because that runtime already implements role constraints, safe
 * workspace writes, response repair, and split-file generation. Only the
 * endpoint, credential, and model defaults differ here.
 */

import type { ImageBrief, ImageGenerator } from "./site_maker_engine.ts";
import {
  CodexRuntimeNotConfiguredError,
  OpenRouterCodegenRuntime,
  type WorkspaceFs,
} from "./site_magic_codegen_runtime.ts";

export { CodexRuntimeNotConfiguredError };
export class ImageGeneratorNotConfiguredError extends Error {}

export class OpenAICompatibleCodegenRuntime extends OpenRouterCodegenRuntime {
  constructor(opts?: {
    apiKey?: string;
    model?: string;
    baseUrl?: string;
    fetchImpl?: typeof global.fetch;
    fs?: WorkspaceFs;
  }) {
    const baseUrl = (
      opts?.baseUrl ??
      process.env.OPENAI_COMPATIBLE_BASE_URL ??
      "http://localhost:11434/v1"
    ).replace(/\/+$/, "");
    const configuredKey = opts?.apiKey ?? process.env.OPENAI_COMPATIBLE_API_KEY;
    const apiKey = configuredKey ?? (baseUrl.includes("localhost") ? "dummy" : "");

    if (!apiKey) {
      throw new CodexRuntimeNotConfiguredError(
        "OpenAICompatibleCodegenRuntime requires OPENAI_COMPATIBLE_API_KEY for non-local endpoints."
      );
    }

    super({
      apiKey,
      model: opts?.model ?? process.env.OPENAI_COMPATIBLE_MODEL ?? "llama3.1:8b",
      baseUrl,
      fetchImpl: opts?.fetchImpl,
      fs: opts?.fs,
    });
  }
}

/**
 * Image adapter for endpoints implementing OpenAI's images/generations
 * response shape. It accepts only inline b64_json results so private build
 * inputs never depend on a provider-hosted URL remaining available.
 */
export class OpenAICompatibleImageGenerator implements ImageGenerator {
  private readonly apiKey: string;
  private readonly baseUrl: string;
  private readonly model?: string;
  private readonly fetchImpl: typeof fetch;

  constructor(opts?: {
    apiKey?: string;
    baseUrl?: string;
    model?: string;
    fetchImpl?: typeof fetch;
  }) {
    this.baseUrl = (
      opts?.baseUrl ??
      process.env.OPENAI_COMPATIBLE_BASE_URL ??
      "http://localhost:11434/v1"
    ).replace(/\/+$/, "");
    const configuredKey = opts?.apiKey ?? process.env.OPENAI_COMPATIBLE_API_KEY;
    this.apiKey = configuredKey ?? (this.baseUrl.includes("localhost") ? "dummy" : "");
    this.model = opts?.model ?? process.env.OPENAI_COMPATIBLE_IMAGE_MODEL;
    this.fetchImpl = opts?.fetchImpl ?? fetch;

    if (!this.apiKey) {
      throw new ImageGeneratorNotConfiguredError(
        "OpenAICompatibleImageGenerator requires OPENAI_COMPATIBLE_API_KEY for non-local endpoints."
      );
    }
  }

  async generate(args: {
    model: string;
    brief: string;
    count: 3;
    briefs?: readonly ImageBrief[];
  }): Promise<string[]> {
    const endpoint = `${this.baseUrl}/images/generations`;
    const model = this.model ?? args.model;
    const images: string[] = [];

    for (let i = 0; i < args.count; i += 1) {
      const brief = args.briefs?.[i] ?? {
        role: i === 0 ? "hero" : "service",
        aspectRatio: i === 0 ? "16:9" : "4:3",
        prompt: args.brief,
        altText: "",
      };
      const response = await this.fetchImpl(endpoint, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model,
          prompt: brief.prompt,
          n: 1,
          size: brief.aspectRatio === "16:9" ? "1536x1024" : "1024x1024",
          response_format: "b64_json",
        }),
      });

      if (!response.ok) {
        throw new Error(
          `OpenAI-compatible image generation failed: ${response.status} ${await response.text()}`
        );
      }

      const data = (await response.json()) as { data?: Array<{ b64_json?: string }> };
      const encoded = data.data?.[0]?.b64_json;
      if (!encoded) {
        throw new Error("OpenAI-compatible image generation returned no b64_json");
      }
      images.push(`data:image/png;base64,${encoded}`);
    }

    return images;
  }
}
