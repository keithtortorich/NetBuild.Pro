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
    exists: async (p: string) => {
      if (files.has(p) || links.has(p)) return true;
      // "/tmp" is every test's workspace root -- mkdtemp guarantees it
      // exists in production before any write, same as a real directory.
      if (p === "/tmp") return true;
      return Array.from(files.keys()).some((key) => key.startsWith(p + "/"));
    },
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
      // Real fs.realpath throws ENOENT for a target that doesn't exist --
      // the earlier version of this mock always succeeded, which is
      // exactly what let PathValidator's realpath-on-a-not-yet-written-file
      // bug ship to production undetected by any test.
      if (p === "/tmp" || files.has(p) || Array.from(files.keys()).some((k) => k.startsWith(p + "/"))) {
        return p;
      }
      throw Object.assign(new Error(`ENOENT: no such file or directory, realpath '${p}'`), { code: "ENOENT" });
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

test("callOpenRouter: sets an explicit generous max_tokens", async () => {
  // Regression: a real production "direction" role response on a
  // reasoning-capable free-tier model got cut off mid-string
  // (SyntaxError: Unterminated string in JSON). Reasoning-capable models
  // spend a large, non-optional share of the completion budget on hidden
  // chain-of-thought before the requested JSON, and without max_tokens
  // set, OpenRouter applies its own small/unpredictable default.
  let capturedMaxTokens: number | undefined;
  const mockFetch = async (url: string, opts: any) => {
    capturedMaxTokens = JSON.parse(opts.body).max_tokens;
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

  await runtime.run({ role: "product", workspace: "/tmp", instructions: "test" });

  assert.ok(typeof capturedMaxTokens === "number" && capturedMaxTokens >= 8000);
});

test("callOpenRouter: enforces JSON output at the provider", async () => {
  // Regression: Terra obeyed the design task but returned an ASCII wireframe
  // instead of the CodegenResponse envelope when JSON was requested only in
  // prompt prose, aborting the production form-to-site pipeline.
  let capturedResponseFormat: unknown;
  const mockFetch = async (_url: string, opts: any) => {
    capturedResponseFormat = JSON.parse(opts.body).response_format;
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

  await runtime.run({ role: "product", workspace: "/tmp", instructions: "test" });

  assert.deepEqual(capturedResponseFormat, { type: "json_object" });
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

test("path validation: accepts a brand-new file in a not-yet-existing subdirectory", async () => {
  // Regression: the first real production codegen call wrote PRODUCT.md
  // into a freshly mkdtemp'd, otherwise-empty workspace. validatePath
  // called fs.realpath on that not-yet-written file directly, and
  // realpath requires its target to exist -- every write of a genuinely
  // new file threw ENOENT. Every local test passed because the old fake
  // fs's realpath never threw for a nonexistent path.
  const mockFetch = async () => ({
    ok: true,
    json: async () => ({
      choices: [
        {
          message: {
            content: JSON.stringify({
              files: [{ path: "docs/PRODUCT.md", contents: "# Product" }],
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

  assert.equal(await fs.readFile("/tmp/docs/PRODUCT.md"), "# Product");
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

test("response validation: strips a markdown code fence OpenRouter wraps JSON in", async () => {
  // Regression: the first real production codegen call returned
  // "```json\n{...}\n```" instead of raw JSON, and JSON.parse threw on the
  // fence -- MalformedCodegenResponseError with no code path that ever
  // handled it.
  const fenced = "```json\n" + JSON.stringify({
    files: [{ path: "index.html", contents: "hello" }],
    result: { custom: "data" },
  }) + "\n```";
  const mockFetch = async () => ({
    ok: true,
    json: async () => ({
      choices: [{ message: { content: fenced } }],
    }),
  });

  const runtime = new OpenRouterCodegenRuntime({
    apiKey: "test-key",
    fetchImpl: mockFetch,
    fs: createFakeFs(),
  });

  const result = await runtime.run({
    role: "builder",
    workspace: "/tmp",
    instructions: "test",
  });

  assert.deepEqual(result, { custom: "data" });
});

test("response validation: recovers a JSON object from a fence that never closes", async () => {
  // Regression: a real production remediation response (a large multi-file
  // builder payload, more likely to brush a completion token limit) came
  // back as "```json\n{...}" with no closing fence. The first stripJsonFence
  // required the entire response to BE one closed fence, so this fell
  // through unstripped and JSON.parse threw on the leading backticks.
  const unclosed = "```json\n" + JSON.stringify({
    files: [{ path: "index.html", contents: "hello" }],
    result: { custom: "data" },
  });
  const mockFetch = async () => ({
    ok: true,
    json: async () => ({
      choices: [{ message: { content: unclosed } }],
    }),
  });

  const runtime = new OpenRouterCodegenRuntime({
    apiKey: "test-key",
    fetchImpl: mockFetch,
    fs: createFakeFs(),
  });

  const result = await runtime.run({
    role: "builder",
    workspace: "/tmp",
    instructions: "test",
  });

  assert.deepEqual(result, { custom: "data" });
});

test("response validation: recovers from a raw unescaped newline inside a string value", async () => {
  // Regression: a real production "direction" response died with
  // "SyntaxError: Unterminated string in JSON" at a position far short of
  // the 16000-token completion budget -- not a truncation, a genuinely
  // malformed string. RFC 8259 requires a literal newline inside a JSON
  // string to be escaped (\n), and models routinely emit a real line
  // break instead when a string value carries multi-line content.
  const rawContent = `{"files":[{"path":"index.html","contents":"line one\nline two"}],"result":{}}`;
  const mockFetch = async () => ({
    ok: true,
    json: async () => ({
      choices: [{ message: { content: rawContent } }],
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

  assert.deepEqual(result, {});
  assert.equal(await fs.readFile("/tmp/index.html"), "line one\nline two");
});

test("response validation: error snippet windows around the actual parse-error position, not just a prefix", async () => {
  // Regression: a real production failure had its malformation at
  // JSON.parse position 894, but the snippet was a flat 0-300 prefix --
  // useless, the actual bad content was never visible in the log. The
  // snippet must center on wherever V8 reports the error, however deep.
  const padding = "x".repeat(850);
  const malformed = `{"files":[],"result":{"padding":"${padding}","bad": "ok" "trailing"}}`;
  const mockFetch = async () => ({
    ok: true,
    json: async () => ({
      choices: [{ message: { content: malformed } }],
    }),
  });

  const runtime = new OpenRouterCodegenRuntime({
    apiKey: "test-key",
    fetchImpl: mockFetch,
    fs: createFakeFs(),
  });

  try {
    await runtime.run({ role: "builder", workspace: "/tmp", instructions: "test" });
    assert.fail("expected MalformedCodegenResponseError");
  } catch (e) {
    assert.ok(e instanceof MalformedCodegenResponseError);
    assert.ok((e as Error).message.includes("trailing"), `expected the actual malformed region in: ${(e as Error).message}`);
  }
});

test("response validation: recovers a response truncated exactly at its own closing brace", async () => {
  // Regression: a real production finish_reviewer response ended
  // "...engines.\"}]}" -- the findings array and the "result" object
  // both close correctly, but the outer {"files":[],"result":{...}}
  // wrapper's own closing brace never arrived. max_tokens ran out one
  // token short. closeUnbalancedJson should append exactly the missing
  // closer and let this parse successfully instead of failing the job.
  const truncated = `{"files":[],"result":{"designScore":30,"applicableMax":40,"findings":["ok"]}`; // missing final }
  const mockFetch = async () => ({
    ok: true,
    json: async () => ({
      choices: [{ message: { content: truncated } }],
    }),
  });

  const runtime = new OpenRouterCodegenRuntime({
    apiKey: "test-key",
    fetchImpl: mockFetch,
    fs: createFakeFs(),
  });

  const result = await runtime.run({ role: "design_assessor", workspace: "/tmp", instructions: "test" });
  assert.deepEqual(result, { designScore: 30, applicableMax: 40, findings: ["ok"] });
});

test("response validation: uses the final envelope after a planning placeholder", async () => {
  // Regression: Terra emitted a valid placeholder CodegenResponse, then the
  // real 24 KB response. JSON.parse rejected the concatenation at the first
  // character after the placeholder and production failed on remediation 3.
  const placeholder = JSON.stringify({
    files: [{ path: "index.html", contents: "" }],
    result: { status: "placeholder" },
  });
  const final = JSON.stringify({
    files: [{ path: "index.html", contents: "<main>Finished</main>" }],
    result: { status: "complete" },
  });
  const runtime = new OpenRouterCodegenRuntime({
    apiKey: "test-key",
    fetchImpl: async () => ({
      ok: true,
      json: async () => ({ choices: [{ message: { content: `${placeholder}\n${final}` } }] }),
    }) as any,
    fs: createFakeFs(),
  });

  const result = await runtime.run({ role: "builder", workspace: "/tmp", instructions: "test" });

  assert.deepEqual(result, { status: "complete" });
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

test("callReadOnlyRole: sets an explicit generous max_tokens", async () => {
  let capturedMaxTokens: number | undefined;
  const mockFetch = async (url: string, opts: any) => {
    capturedMaxTokens = JSON.parse(opts.body).max_tokens;
    return {
      ok: true,
      json: async () => ({
        choices: [{ message: { content: JSON.stringify({ designScore: 1, applicableMax: 1, findings: [] }) } }],
      }),
    };
  };

  await callReadOnlyRole({
    role: "design_assessor",
    instructions: "assess this design",
    fetch: mockFetch,
    apiKey: "test-key",
  });

  assert.ok(typeof capturedMaxTokens === "number" && capturedMaxTokens >= 8000);
});

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

test("readOnlyRole: strips a markdown code fence OpenRouter wraps JSON in", async () => {
  const fenced = "```json\n" + JSON.stringify({
    designScore: 85,
    applicableMax: 100,
    findings: ["Missing alt text"],
  }) + "\n```";
  const mockFetch = async () => ({
    ok: true,
    json: async () => ({
      choices: [{ message: { content: fenced } }],
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
    findings: ["Missing alt text"],
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
