import path from "path";
import fs from "fs/promises";

/** OpenRouter applies its own (undocumented, model-dependent) default
 * completion cap when max_tokens is omitted. Reasoning-capable free-tier
 * models spend a large, non-optional share of that budget on hidden
 * chain-of-thought before ever emitting the requested JSON -- a real
 * production "direction" role response was cut off mid-string
 * (SyntaxError: Unterminated string in JSON) because reasoning tokens
 * consumed most of an unset/small default before the multi-file JSON
 * payload could finish. Set explicitly generous so both reasoning and a
 * full multi-file response fit. */
const MAX_COMPLETION_TOKENS = 16000;

// ============================================================================
// Types & Interfaces
// ============================================================================

export interface CodegenRoleConfig {
  readonly mutatesFiles: boolean;
  readonly instructions: string;
}

export interface FileWrite {
  path: string;
  contents: string;
}

export interface CodegenResponse {
  files: FileWrite[];
  result: Record<string, unknown>;
}

/** Models frequently wrap JSON replies in a ```json ... ``` fence even when
 * told to return raw JSON. The first version of this only matched when the
 * ENTIRE trimmed response was one closed fence -- a production remediation
 * response (a large multi-file `builder` payload, more likely to brush a
 * completion token limit) came back with the closing ``` never written,
 * so the anchored regex didn't match and the raw fenced text reached
 * JSON.parse unstripped. Now finds a fence anywhere in the text rather
 * than requiring it to BE the whole text, and if no fence closes at all,
 * falls back to slicing from the first '{' to the last '}' -- every
 * CodegenResponse is a JSON object, so that boundary is always valid when
 * present, closed-fence or not. */
export function stripJsonFence(content: string): string {
  const trimmed = content.trim();
  const fenced = trimmed.match(/```(?:json)?\s*\n?([\s\S]*?)```/);
  if (fenced) return fenced[1].trim();

  const start = trimmed.indexOf("{");
  const end = trimmed.lastIndexOf("}");
  if (start !== -1 && end > start) return trimmed.slice(start, end + 1);

  return trimmed;
}

export interface WorkspaceFs {
  exists: (path: string) => Promise<boolean>;
  readFile: (path: string) => Promise<string>;
  writeFile: (path: string, contents: string) => Promise<void>;
  isSymlink: (path: string) => Promise<boolean>;
  realpath: (path: string) => Promise<string>;
  stat: (path: string) => Promise<{ isDirectory: () => boolean; size: number }>;
  readdir: (path: string) => Promise<string[]>;
}

// ============================================================================
// Role Configuration
// ============================================================================

export const ROLE_CONFIG: Record<string, CodegenRoleConfig> = {
  product: {
    mutatesFiles: true,
    instructions: "Define product intent, features, and user flows for the site.",
  },
  direction: {
    mutatesFiles: true,
    instructions: "Create visual direction, brand intent, and design decisions.",
  },
  builder: {
    mutatesFiles: true,
    instructions: "Generate HTML, CSS, and JavaScript for the site.",
  },
  design_assessor: {
    mutatesFiles: false,
    instructions: "Assess design quality, critique, and scores.",
  },
  remediator: {
    mutatesFiles: true,
    instructions: "Fix quality issues and improve the build.",
  },
  finish_reviewer: {
    mutatesFiles: false,
    instructions: "Final review and verdict on site readiness.",
  },
  documenter: {
    mutatesFiles: true,
    instructions: "Generate documentation for the site build.",
  },
};

// ============================================================================
// JSON Schema for Structured Output
// ============================================================================

export const FILE_WRITE_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["files", "result"],
  properties: {
    files: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["path", "contents"],
        properties: {
          path: { type: "string" },
          contents: { type: "string" },
        },
      },
    },
    result: { type: "object" },
  },
} as const;

// ============================================================================
// Error Classes
// ============================================================================

export class WorkspacePathEscapeError extends Error {
  constructor(path: string, reason: string) {
    super(`Workspace path escape rejected: ${path} (${reason})`);
    this.name = "WorkspacePathEscapeError";
  }
}

export class ReadOnlyRoleFileModificationError extends Error {
  constructor(role: string, fileCount: number) {
    super(`Read-only role '${role}' attempted to modify ${fileCount} file(s)`);
    this.name = "ReadOnlyRoleFileModificationError";
  }
}

export class MalformedCodegenResponseError extends Error {
  constructor(message: string, originalError?: Error) {
    super(`Codegen response malformed: ${message}`);
    this.name = "MalformedCodegenResponseError";
    if (originalError) this.cause = originalError;
  }
}

export class CodexRuntimeNotConfiguredError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CodexRuntimeNotConfiguredError";
  }
}

// ============================================================================
// Path Validator
// ============================================================================

class PathValidator {
  private fs: WorkspaceFs;

  constructor(fs: WorkspaceFs) {
    this.fs = fs;
  }

  async validatePath(relativePath: string, workspaceRoot: string): Promise<string> {
    // 1. Reject if absolute
    if (path.isAbsolute(relativePath)) {
      throw new WorkspacePathEscapeError(relativePath, "absolute path");
    }

    // 2. Reject if contains ..
    if (relativePath.includes("..")) {
      throw new WorkspacePathEscapeError(relativePath, "contains traversal");
    }

    // 3. Reject reserved names
    const basename = path.basename(relativePath);
    const reserved = [".env", ".git", ".gitignore", ".impeccable"];
    if (reserved.includes(basename)) {
      throw new WorkspacePathEscapeError(relativePath, `reserved name: ${basename}`);
    }

    // 4. Reject control characters, null bytes
    if (/[\x00-\x1f]/.test(relativePath)) {
      throw new WorkspacePathEscapeError(relativePath, "contains control characters");
    }

    // 5. Resolve and check still inside workspace. realpath requires its
    // target to exist, but this validates paths for files codegen is about
    // to *create* -- a brand-new file has never existed on disk, so
    // realpath(fullPath) throws ENOENT before the escape check even runs.
    // Walk up to the nearest existing ancestor instead (workspaceRoot is
    // the guaranteed base case, created by mkdtemp before any write) and
    // realpath that -- anything written under a workspace-contained
    // ancestor is itself workspace-contained.
    const fullPath = path.join(workspaceRoot, relativePath);
    const realWorkspace = await this.fs.realpath(workspaceRoot);

    let ancestor = fullPath;
    while (!(await this.fs.exists(ancestor))) {
      const parent = path.dirname(ancestor);
      if (parent === ancestor) break;
      ancestor = parent;
    }
    const realAncestor = await this.fs.realpath(ancestor);

    const sep = path.sep;
    if (!realAncestor.startsWith(realWorkspace + sep) && realAncestor !== realWorkspace) {
      throw new WorkspacePathEscapeError(
        relativePath,
        `symlink escapes workspace (${realAncestor})`
      );
    }

    return fullPath;
  }
}

// ============================================================================
// Default Workspace FS Implementation
// ============================================================================

function createDefaultWorkspaceFs(): WorkspaceFs {
  return {
    exists: (p: string) => fs.access(p).then(() => true).catch(() => false),
    readFile: (p: string) => fs.readFile(p, "utf-8"),
    writeFile: (p: string, contents: string) => fs.writeFile(p, contents, "utf-8"),
    isSymlink: async (p: string) => {
      const stat = await fs.lstat(p);
      return stat.isSymbolicLink();
    },
    realpath: (p: string) => fs.realpath(p),
    stat: async (p: string) => {
      const s = await fs.stat(p);
      return {
        isDirectory: () => s.isDirectory(),
        size: s.size,
      };
    },
    readdir: (p: string) => fs.readdir(p),
  };
}

// ============================================================================
// OpenRouterCodegenRuntime
// ============================================================================

export class OpenRouterCodegenRuntime {
  private apiKey: string;
  private model: string;
  private baseUrl: string;
  private fetch: typeof global.fetch;
  private fs: WorkspaceFs;
  private pathValidator: PathValidator;

  constructor(opts?: {
    apiKey?: string;
    model?: string;
    baseUrl?: string;
    fetchImpl?: typeof global.fetch;
    fs?: WorkspaceFs;
  }) {
    this.apiKey = opts?.apiKey ?? process.env.OPENROUTER_API_KEY ?? "";
    this.model = opts?.model ?? process.env.SITE_MAGIC_DESIGN_MODEL ?? "openai/gpt-4o-mini";
    // SITE_MAGIC_CODEGEN_BASE_URL, not SITE_MAGIC_API_BASE_URL: this is an
    // OpenAI-compatible LLM endpoint (a `/chat/completions` gets appended),
    // whereas SITE_MAGIC_API_BASE_URL is this repo's own control-plane URL
    // that HTTPJobStateSink/fetchJobRecord append `/site-magic/internal/...`
    // to. They were the same var until 2026-08-11, which meant the
    // production worker (SITE_MAGIC_API_BASE_URL=https://netbuild.pro) would
    // have sent every codegen call to https://netbuild.pro/chat/completions.
    this.baseUrl =
      opts?.baseUrl ??
      process.env.SITE_MAGIC_CODEGEN_BASE_URL ??
      "https://openrouter.ai/api/v1";
    this.fetch = opts?.fetchImpl ?? global.fetch;
    this.fs = opts?.fs ?? createDefaultWorkspaceFs();
    this.pathValidator = new PathValidator(this.fs);

    if (!this.apiKey && !this.baseUrl.includes("localhost")) {
      throw new CodexRuntimeNotConfiguredError("OPENROUTER_API_KEY not set");
    }
  }

  async run(args: {
    role: string;
    workspace: string;
    instructions: string;
    model?: string;
  }): Promise<Record<string, unknown>> {
    const { role, workspace, instructions } = args;
    const model = args.model ?? this.model;

    // Validate role exists
    if (!ROLE_CONFIG[role]) {
      throw new Error(`Unknown role: ${role}`);
    }

    const roleConfig = ROLE_CONFIG[role];

    // 1. Assemble workspace context
    const workspaceContext = await this.assembleWorkspaceContext(workspace);

    // 2. Build prompt
    const prompt = this.buildPrompt(role, instructions, workspaceContext);

    // 3. Call OpenRouter
    const response = await this.callOpenRouter(model, prompt);

    // 4. Validate response shape
    let parsed: CodegenResponse;
    try {
      parsed = JSON.parse(stripJsonFence(response));
      this.validateCodegenResponse(parsed);
    } catch (e) {
      throw new MalformedCodegenResponseError(
        `Failed to parse or validate response: ${e instanceof Error ? e.message : String(e)}`,
        e instanceof Error ? e : undefined
      );
    }

    // 5. Check read-only role constraint
    if (!roleConfig.mutatesFiles && parsed.files.length > 0) {
      throw new ReadOnlyRoleFileModificationError(role, parsed.files.length);
    }

    // 6. Validate all paths before writing any
    const validatedWrites = await Promise.all(
      parsed.files.map(async (write) => ({
        fullPath: await this.pathValidator.validatePath(write.path, workspace),
        contents: write.contents,
      }))
    );

    // 7. Write files (no partial writes)
    for (const { fullPath, contents } of validatedWrites) {
      await this.fs.writeFile(fullPath, contents);
    }

    // 8. Return result
    return parsed.result;
  }

  private async assembleWorkspaceContext(workspace: string): Promise<string> {
    const files: Array<{ path: string; size: number; contents?: string }> = [];

    const walk = async (dir: string, depth: number = 0) => {
      if (depth > 5) return;

      try {
        const entries = await this.fs.readdir(dir);
        for (const entry of entries) {
          const fullPath = path.join(dir, entry);
          const stat = await this.fs.stat(fullPath);

          if (stat.isDirectory()) {
            if (![".git", "node_modules", ".impeccable"].includes(entry)) {
              await walk(fullPath, depth + 1);
            }
          } else {
            const relativePath = path.relative(workspace, fullPath);
            const size = stat.size;

            if (size < 10 * 1024) {
              const contents = await this.fs.readFile(fullPath);
              files.push({ path: relativePath, size, contents });
            } else {
              files.push({ path: relativePath, size });
            }
          }
        }
      } catch {
        // Skip directories we can't read
      }
    };

    await walk(workspace);

    // Sort for deterministic output
    files.sort((a, b) => a.path.localeCompare(b.path));

    let context = "## Current workspace state:\n\n";
    for (const file of files) {
      if (file.contents !== undefined) {
        context += `### ${file.path} (${file.size} bytes)\n\`\`\`\n${file.contents}\n\`\`\`\n\n`;
      } else {
        context += `- ${file.path} (${file.size} bytes, not shown)\n`;
      }
    }

    return context;
  }

  private buildPrompt(
    role: string,
    instructions: string,
    workspaceContext: string
  ): string {
    const roleConfig = ROLE_CONFIG[role];

    let prompt = `You are a structured code generator role: "${role}".

${workspaceContext}

## Your task:

${instructions}

## Output format:

You MUST respond with valid JSON matching this schema:
\`\`\`json
{
  "files": [
    {"path": "relative/path/to/file.html", "contents": "..."},
    ...
  ],
  "result": { /* role-specific JSON */ }
}
\`\`\`

## Constraints:

1. All paths must be relative to the workspace root.
2. Do NOT use absolute paths or ".." traversal.
3. Do NOT create files outside the workspace.`;

    if (!roleConfig.mutatesFiles) {
      prompt += `
4. Do NOT modify any files. Leave the "files" array empty.
5. Return ONLY JSON data containing analysis/review results, no file modifications.`;
    }

    prompt += `

Return ONLY the JSON object, nothing else.`;

    return prompt.trim();
  }

  private async callOpenRouter(model: string, prompt: string): Promise<string> {
    const endpoint = `${this.baseUrl}/chat/completions`;
    const response = await this.fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify({
        model,
        messages: [{ role: "user", content: prompt }],
        stream: false,
        max_tokens: MAX_COMPLETION_TOKENS,
      }),
    });

    if (!response.ok) {
      throw new Error(
        `OpenRouter API error: ${response.status} ${response.statusText}`
      );
    }

    const data = (await response.json()) as any;
    return data.choices?.[0]?.message?.content ?? "";
  }

  private validateCodegenResponse(obj: any): void {
    if (typeof obj !== "object" || obj === null) {
      throw new Error("Response must be an object");
    }

    if (!Array.isArray(obj.files)) {
      throw new Error("Response.files must be an array");
    }

    for (const file of obj.files) {
      if (typeof file !== "object" || file === null) {
        throw new Error("Each file must be an object");
      }
      if (typeof file.path !== "string") {
        throw new Error("Each file must have a string path");
      }
      if (typeof file.contents !== "string") {
        throw new Error("Each file must have string contents");
      }
    }

    if (typeof obj.result !== "object" || obj.result === null) {
      throw new Error("Response.result must be an object");
    }
  }
}

// ============================================================================
// Read-Only Roles (Plain Chat Path)
// ============================================================================

export async function callReadOnlyRole(opts: {
  role: "design_assessor" | "finish_reviewer";
  instructions: string;
  workspaceContext?: string;
  fetch?: typeof global.fetch;
  apiKey?: string;
  model?: string;
  baseUrl?: string;
}): Promise<Record<string, unknown>> {
  const { role, instructions, workspaceContext = "" } = opts;
  const fetchImpl = opts.fetch ?? global.fetch;
  const apiKey = opts.apiKey ?? process.env.OPENROUTER_API_KEY ?? "";
  const model = opts.model ?? process.env.SITE_MAGIC_DESIGN_MODEL ?? "openai/gpt-4o-mini";
  const baseUrl =
    opts.baseUrl ?? process.env.SITE_MAGIC_CODEGEN_BASE_URL ?? "https://openrouter.ai/api/v1";

  if (!apiKey) {
    throw new CodexRuntimeNotConfiguredError("OPENROUTER_API_KEY not set");
  }

  const roleInstructions =
    role === "design_assessor"
      ? "Provide a design critique with a quality score."
      : "Provide a final review verdict.";

  const prompt = `You are a read-only analysis role: "${role}".

${workspaceContext}

## Your task:

${instructions}

## Output format:

Respond with valid JSON. Do NOT modify any files.

${
  role === "design_assessor"
    ? 'Return: {"designScore": number (0-100), "applicableMax": number, "findings": string[]}'
    : 'Return: {"verdict": "PASS"|"REBUILD"|"REMEDIATE", "authoredNotInterchangeable": boolean, "materialFindings": string[]}'
}

Return ONLY the JSON object, nothing else.`;

  const responseSchema =
    role === "design_assessor"
      ? {
          type: "object",
          additionalProperties: false,
          required: ["designScore", "applicableMax", "findings"],
          properties: {
            designScore: { type: "number" },
            applicableMax: { type: "number" },
            findings: { type: "array", items: { type: "string" } },
          },
        }
      : {
          type: "object",
          additionalProperties: false,
          required: ["verdict", "authoredNotInterchangeable", "materialFindings"],
          properties: {
            verdict: { enum: ["PASS", "REBUILD", "REMEDIATE"] },
            authoredNotInterchangeable: { type: "boolean" },
            materialFindings: { type: "array", items: { type: "string" } },
          },
        };

  const endpoint = `${baseUrl}/chat/completions`;
  const response = await fetchImpl(endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      messages: [{ role: "user", content: prompt }],
      stream: false,
      max_tokens: MAX_COMPLETION_TOKENS,
    }),
  });

  if (!response.ok) {
    throw new Error(`OpenRouter API error: ${response.status} ${response.statusText}`);
  }

  const data = (await response.json()) as any;
  const content = data.choices?.[0]?.message?.content ?? "";

  try {
    return JSON.parse(stripJsonFence(content));
  } catch {
    throw new MalformedCodegenResponseError(`Invalid JSON in response: ${content}`);
  }
}
