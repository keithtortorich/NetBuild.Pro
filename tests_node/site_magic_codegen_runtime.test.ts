import test from "node:test";
import assert from "node:assert/strict";
import {
  OpenRouterCodegenRuntime,
  callReadOnlyRole,
  WorkspacePathEscapeError,
  ReadOnlyRoleFileModificationError,
  MalformedCodegenResponseError,
  CodexRuntimeNotConfiguredError,
} from "../webstaffr/site_magic_codegen_runtime.ts";

// ============================================================================
// Mock Setup
// ============================================================================

function createFakeFs(overrides?: any): any {
  const files = new Map<string, string>();
  const links = new Map<string, string>();

  const defaultFs: WorkspaceFs = {
    exists: async (p: string) => files.has(p) || links.has(p),
    readFile: async (p: string) => {
      if (files.has(p)) return files.get(p)!;
      throw new Error(`ENOENT: ${p}`);
    },
    writeFile: async (p: string, contents: string) => {
      files.set(p, contents);
    },
    isSymlink: async (p: string) => links.has(p),
    realpath: async (p: string) => {
      if (links.has(p)) {
        return links.get(p)!;
      }
      return p;
    },
    stat: async (p: string) => {
      const content = files.get(p);
      if (content !== undefined) {
        return {
          isDirectory: () => false,
          size: content.length,
        };
      }
      const isDirContent = Array.from(files.keys()).some((key) =>
        key.startsWith(p + "/")
      );
      if (isDirContent) {
        return {
          isDirectory: () => true,
          size: 0,
        };
      }
      throw new Error(`ENOENT: ${p}`);
    },
    readdir: async (p: string) => {
      const prefix = p.endsWith("/") ? p : p + "/";
      const entries = new Set<string>();
      for (const key of files.keys()) {
        if (key.startsWith(prefix)) {
          const rel = key.slice(prefix.length);
          const parts = rel.split("/");
          if (parts.length > 0) {
            entries.add(parts[0]);
          }
        }
      }
      return Array.from(entries);
    },
  };

  return { ...defaultFs, ...overrides };
}

// ============================================================================
// Constructor Tests
// ============================================================================

test("constructor: throws if OPENROUTER_API_KEY not set", () => {
  const oldEnv = process.env.OPENROUTER_API_KEY;
  delete process.env.OPENROUTER_API_KEY;

  try {
    assert.throws(
      () => new OpenRouterCodegenRuntime({ fetchImpl: async () => ({}) as any }),
      CodexRuntimeNotConfiguredError
    );
  } finally {
    process.env.OPENROUTER_API_KEY = oldEnv;
  }
});

test("constructor: accepts apiKey via constructor option", () => {
  const runtime = new OpenRouterCodegenRuntime({
    apiKey: "test-key",
    fetchImpl: async () => ({}) as any,
  });
  assert.ok(runtime instanceof OpenRouterCodegenRuntime);
});

test("constructor: uses SITE_MAGIC_DESIGN_MODEL env var if set", async () => {
  const oldEnv = process.env.SITE_MAGIC_DESIGN_MODEL;
  process.env.SITE_MAGIC_DESIGN_MODEL = "test-model";

  try {
    let capturedModel = "";
    const mockFetch = async (url: string, opts: any) => {
      const body = JSON.parse(opts.body);
      capturedModel = body.model;
      return {
        ok: true,
        json: async () => ({
          choices: [{ message: { content: JSON.stringify({ files: [], result: {} }) } }],
        }),
      };
    };

    const runtime = new OpenRouterCodegenRuntime({
      apiKey: "test-key",
      fetchImpl: mockFetch,
      fs: createFakeFs(),
    });

    await runtime.run({
      role: "product",
      workspace: "/tmp",
      instructions: "test",
    });

    assert.equal(capturedModel, "test-model");
  } finally {
    process.env.SITE_MAGIC_DESIGN_MODEL = oldEnv;
  }
});

test("constructor: accepts injected fetch and fs", () => {
  const mockFetch = async () => ({});
  const mockFs = createFakeFs();

  const runtime = new OpenRouterCodegenRuntime({
    apiKey: "test-key",
    fetchImpl: mockFetch,
    fs: mockFs,
  });

  assert.ok(runtime instanceof OpenRouterCodegenRuntime);
});

// ============================================================================
// Path Validation Tests
// ============================================================================

test("path validation: accepts valid relative paths", async () => {
  const mockFetch = async () => ({
    ok: true,
    json: async () => ({
      choices: [
        {
          message: {
            content: JSON.stringify({
              files: [{ path: "index.html", contents: "ok" }],
              result: {},
            }),
          },
        },
      ],
    }),
  });

  const fs = createFakeFs();
  const runtime = new OpenRouterCodegenRuntime({
    apiKey: "test-key",
    fetchImpl: mockFetch,
    fs,
  });

  await runtime.run({
    role: "builder",
    workspace: "/tmp",
    instructions: "test",
  });

  assert.equal(await fs.readFile("/tmp/index.html"), "ok");
});

test("path validation: rejects absolute paths", async () => {
  const mockFetch = async () => ({
    ok: true,
    json: async () => ({
      choices: [
        {
          message: {
            content: JSON.stringify({
              files: [{ path: "/etc/passwd", contents: "bad" }],
              result: {},
            }),
          },
        },
      ],
    }),
  });

  const runtime = new OpenRouterCodegenRuntime({
    apiKey: "test-key",
    fetchImpl: mockFetch,
    fs: createFakeFs(),
  });

  await assert.rejects(
    () =>
      runtime.run({
        role: "builder",
        workspace: "/tmp",
        instructions: "test",
      }),
    WorkspacePathEscapeError
  );
});

test("path validation: rejects paths with ..", async () => {
  const mockFetch = async () => ({
    ok: true,
    json: async () => ({
      choices: [
        {
          message: {
            content: JSON.stringify({
              files: [{ path: "../../etc/passwd", contents: "bad" }],
              result: {},
            }),
          },
        },
      ],
    }),
  });

  const runtime = new OpenRouterCodegenRuntime({
    apiKey: "test-key",
    fetchImpl: mockFetch,
    fs: createFakeFs(),
  });

  await assert.rejects(
    () =>
      runtime.run({
        role: "builder",
        workspace: "/tmp",
        instructions: "test",
      }),
    WorkspacePathEscapeError
  );
});

test("path validation: rejects reserved names", async () => {
  const reserved = [".env", ".git", ".gitignore", ".impeccable"];

  for (const name of reserved) {
    const mockFetch = async () => ({
      ok: true,
      json: async () => ({
        choices: [
          {
            message: {
              content: JSON.stringify({
                files: [{ path: name, contents: "bad" }],
                result: {},
              }),
            },
          },
        ],
      }),
    });

    const runtime = new OpenRouterCodegenRuntime({
      apiKey: "test-key",
      fetchImpl: mockFetch,
      fs: createFakeFs(),
    });

    await assert.rejects(
      () =>
        runtime.run({
          role: "builder",
          workspace: "/tmp",
          instructions: "test",
        }),
      WorkspacePathEscapeError
    );
  }
});

test("path validation: rejects paths with control characters", async () => {
  const mockFetch = async () => ({
    ok: true,
    json: async () => ({
      choices: [
        {
          message: {
            content: JSON.stringify({
              files: [{ path: "file\x00null.html", contents: "bad" }],
              result: {},
            }),
          },
        },
      ],
    }),
  });

  const runtime = new OpenRouterCodegenRuntime({
    apiKey: "test-key",
    fetchImpl: mockFetch,
    fs: createFakeFs(),
  });

  await assert.rejects(
    () =>
      runtime.run({
        role: "builder",
        workspace: "/tmp",
        instructions: "test",
      }),
    WorkspacePathEscapeError
  );
});

// ============================================================================
// Response Validation Tests
// ============================================================================

test("response validation: accepts valid CodegenResponse", async () => {
  const mockFetch = async () => ({
    ok: true,
    json: async () => ({
      choices: [
        {
          message: {
            content: JSON.stringify({
              files: [{ path: "index.html", contents: "hello" }],
              result: { custom: "data" },
            }),
          },
        },
      ],
    }),
  });

  const fs = createFakeFs();
  const runtime = new OpenRouterCodegenRuntime({
    apiKey: "test-key",
    fetchImpl: mockFetch,
    fs,
  });

  const result = await runtime.run({
    role: "builder",
    workspace: "/tmp",
    instructions: "test",
  });

  assert.deepEqual(result, { custom: "data" });
});

test("response validation: rejects response missing 'files' key", async () => {
  const mockFetch = async () => ({
    ok: true,
    json: async () => ({
      choices: [
        {
          message: {
            content: JSON.stringify({
              result: { custom: "data" },
            }),
          },
        },
      ],
    }),
  });

  const runtime = new OpenRouterCodegenRuntime({
    apiKey: "test-key",
    fetchImpl: mockFetch,
    fs: createFakeFs(),
  });

  await assert.rejects(
    () =>
      runtime.run({
        role: "builder",
        workspace: "/tmp",
        instructions: "test",
      }),
    MalformedCodegenResponseError
  );
});

test("response validation: rejects response missing 'result' key", async () => {
  const mockFetch = async () => ({
    ok: true,
    json: async () => ({
      choices: [
        {
          message: {
            content: JSON.stringify({
              files: [],
            }),
          },
        },
      ],
    }),
  });

  const runtime = new OpenRouterCodegenRuntime({
    apiKey: "test-key",
    fetchImpl: mockFetch,
    fs: createFakeFs(),
  });

  await assert.rejects(
    () =>
      runtime.run({
        role: "builder",
        workspace: "/tmp",
        instructions: "test",
      }),
    MalformedCodegenResponseError
  );
});

// ============================================================================
// Role Constraint Tests
// ============================================================================

test("role constraints: mutating role can write files", async () => {
  const mockFetch = async () => ({
    ok: true,
    json: async () => ({
      choices: [
        {
          message: {
            content: JSON.stringify({
              files: [{ path: "index.html", contents: "ok" }],
              result: {},
            }),
          },
        },
      ],
    }),
  });

  const fs = createFakeFs();
  const runtime = new OpenRouterCodegenRuntime({
    apiKey: "test-key",
    fetchImpl: mockFetch,
    fs,
  });

  await runtime.run({
    role: "builder",
    workspace: "/tmp",
    instructions: "test",
  });

  assert.ok(true);
});

test("role constraints: read-only role throws if attempts to write", async () => {
  const mockFetch = async () => ({
    ok: true,
    json: async () => ({
      choices: [
        {
          message: {
            content: JSON.stringify({
              files: [{ path: "bad.html", contents: "should fail" }],
              result: { verdict: "PASS" },
            }),
          },
        },
      ],
    }),
  });

  const runtime = new OpenRouterCodegenRuntime({
    apiKey: "test-key",
    fetchImpl: mockFetch,
    fs: createFakeFs(),
  });

  await assert.rejects(
    () =>
      runtime.run({
        role: "finish_reviewer",
        workspace: "/tmp",
        instructions: "review",
      }),
    ReadOnlyRoleFileModificationError
  );
});

test("role constraints: unknown role throws", async () => {
  const mockFetch = async () => ({});
  const runtime = new OpenRouterCodegenRuntime({
    apiKey: "test-key",
    fetchImpl: mockFetch,
    fs: createFakeFs(),
  });

  await assert.rejects(
    () =>
      runtime.run({
        role: "nonexistent",
        workspace: "/tmp",
        instructions: "test",
      }),
    /Unknown role/
  );
});

// ============================================================================
// File Write Tests
// ============================================================================

test("file writes: writes all validated files", async () => {
  const mockFetch = async () => ({
    ok: true,
    json: async () => ({
      choices: [
        {
          message: {
            content: JSON.stringify({
              files: [
                { path: "a.html", contents: "a" },
                { path: "b.css", contents: "b" },
              ],
              result: {},
            }),
          },
        },
      ],
    }),
  });

  const fs = createFakeFs();
  const runtime = new OpenRouterCodegenRuntime({
    apiKey: "test-key",
    fetchImpl: mockFetch,
    fs,
  });

  await runtime.run({
    role: "builder",
    workspace: "/tmp",
    instructions: "test",
  });

  assert.equal(await fs.readFile("/tmp/a.html"), "a");
  assert.equal(await fs.readFile("/tmp/b.css"), "b");
});

test("file writes: validates all paths before writing any (no partial writes)", async () => {
  const mockFetch = async () => ({
    ok: true,
    json: async () => ({
      choices: [
        {
          message: {
            content: JSON.stringify({
              files: [
                { path: "valid.html", contents: "ok" },
                { path: "../bad.js", contents: "nope" },
              ],
              result: {},
            }),
          },
        },
      ],
    }),
  });

  const fs = createFakeFs();
  const runtime = new OpenRouterCodegenRuntime({
    apiKey: "test-key",
    fetchImpl: mockFetch,
    fs,
  });

  await assert.rejects(
    () =>
      runtime.run({
        role: "builder",
        workspace: "/tmp",
        instructions: "test",
      }),
    WorkspacePathEscapeError
  );

  await assert.rejects(() => fs.readFile("/tmp/valid.html"), /ENOENT/);
});

// ============================================================================
// Workspace Context Tests
// ============================================================================

test("workspace context: includes small files with full contents", async () => {
  let capturedPrompt = "";

  const mockFetch = async (url: string, opts: any) => {
    capturedPrompt = JSON.parse(opts.body).messages[0].content;
    return {
      ok: true,
      json: async () => ({
        choices: [{ message: { content: JSON.stringify({ files: [], result: {} }) } }],
      }),
    };
  };

  const fs = createFakeFs({
    ...createFakeFs(),
    readFile: async (p: string) => {
      if (p === "/tmp/small.html") return "small file";
      if (p === "/tmp/index.js") return "js code";
      throw new Error(`ENOENT: ${p}`);
    },
    stat: async (p: string) => {
      if (p === "/tmp/small.html" || p === "/tmp/index.js") {
        return { isDirectory: () => false, size: 100 };
      }
      throw new Error(`ENOENT: ${p}`);
    },
    readdir: async (p: string) => (p === "/tmp" ? ["small.html", "index.js"] : []),
  });

  const runtime = new OpenRouterCodegenRuntime({
    apiKey: "test-key",
    fetchImpl: mockFetch,
    fs,
  });

  await runtime.run({
    role: "product",
    workspace: "/tmp",
    instructions: "test",
  });

  assert.ok(capturedPrompt.includes("small.html"));
  assert.ok(capturedPrompt.includes("small file"));
  assert.ok(capturedPrompt.includes("index.js"));
  assert.ok(capturedPrompt.includes("js code"));
});

// ============================================================================
// Read-Only Role Tests
// ============================================================================

test("readOnlyRole: design_assessor returns expected structure", async () => {
  const mockFetch = async () => ({
    ok: true,
    json: async () => ({
      choices: [
        {
          message: {
            content: JSON.stringify({
              designScore: 85,
              applicableMax: 100,
              findings: ["Missing alt text", "Low contrast"],
            }),
          },
        },
      ],
    }),
  });

  const result = await callReadOnlyRole({
    role: "design_assessor",
    instructions: "assess this design",
    fetch: mockFetch,
    apiKey: "test-key",
  });

  assert.deepEqual(result, {
    designScore: 85,
    applicableMax: 100,
    findings: ["Missing alt text", "Low contrast"],
  });
});

test("readOnlyRole: finish_reviewer returns expected structure", async () => {
  const mockFetch = async () => ({
    ok: true,
    json: async () => ({
      choices: [
        {
          message: {
            content: JSON.stringify({
              verdict: "PASS",
              authoredNotInterchangeable: true,
              materialFindings: [],
            }),
          },
        },
      ],
    }),
  });

  const result = await callReadOnlyRole({
    role: "finish_reviewer",
    instructions: "review this",
    fetch: mockFetch,
    apiKey: "test-key",
  });

  assert.deepEqual(result, {
    verdict: "PASS",
    authoredNotInterchangeable: true,
    materialFindings: [],
  });
});

test("readOnlyRole: throws if no OPENROUTER_API_KEY", async () => {
  const oldEnv = process.env.OPENROUTER_API_KEY;
  delete process.env.OPENROUTER_API_KEY;

  try {
    await assert.rejects(
      () =>
        callReadOnlyRole({
          role: "design_assessor",
          instructions: "test",
          fetch: async () => ({}) as any,
        }),
      CodexRuntimeNotConfiguredError
    );
  } finally {
    process.env.OPENROUTER_API_KEY = oldEnv;
  }
});
