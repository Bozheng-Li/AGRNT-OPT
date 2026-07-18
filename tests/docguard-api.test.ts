import { describe, expect, test } from "vitest";
import { POST } from "../src/app/api/plugins/[slug]/invoke/route";

const files = [
  {
    path: ".docguard.json",
    content: JSON.stringify({
      projectName: "ledger-api",
      profile: "standard",
      sourcePatterns: { routes: "src/**/*.js" },
    }),
  },
  { path: "package.json", content: JSON.stringify({ name: "ledger-api", version: "2.0.0", private: true }) },
  { path: "README.md", content: "# Ledger API\n\nThe service supports 3 retries and 40 connections. See `src/server.js`.\n" },
  {
    path: "docs-canonical/API-REFERENCE.md",
    content: "# API Reference\n\nThe API permits 100 requests/min. See `src/server.js`.\n\n### POST /transfer\nCreates a transfer.\n\nStatus values are PENDING, SETTLED, or FAILED.\n",
  },
  { path: "docs-canonical/ENVIRONMENT.md", content: "# Environment\n\n`DATABASE_URL` is required.\n" },
  { path: ".env.example", content: "DATABASE_URL=postgres://localhost/ledger\nJWT_SECRET=change-me\n" },
  {
    path: "src/server.js",
    content: "const MAX_RETRIES=5, MAX_CONNECTIONS=80, RATE_LIMIT=250; const key=process.env.JWT_SECRET; export const routes=['POST /transfer','POST /reverse'];\n",
  },
];

async function invoke(tool: string, args: Record<string, unknown>) {
  return POST(
    new Request("http://localhost/api/plugins/docguard-drift-lab/invoke", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ operation: "tool", tool, arguments: args }),
    }),
    { params: Promise.resolve({ slug: "docguard-drift-lab" }) },
  );
}

describe("DocGuard public API", () => {
  test("runs all six real tools and returns sanitized capability-specific results", async () => {
    const guard = await invoke("docguard_guard", { files });
    expect(guard.status).toBe(200);
    const guardJson = await guard.json();
    expect(guardJson.plugin).toBe("io.github.raccioly/docguard");
    expect(guardJson.result.structuredContent.status).toMatch(/WARN|FAIL/);
    expect(guardJson.result.structuredContent.findings.length).toBeGreaterThan(0);

    const score = await invoke("docguard_score", { files });
    expect(score.status).toBe(200);
    expect((await score.json()).result.structuredContent).toMatchObject({ score: expect.any(Number), grade: expect.any(String) });

    const claims = await invoke("docguard_verify_claims", { files });
    expect(claims.status).toBe(200);
    const claimJson = await claims.json();
    expect(claimJson.result.structuredContent.claimCount).toBeGreaterThanOrEqual(3);
    expect(JSON.stringify(claimJson)).toContain("verify.semantic");

    const report = await invoke("docguard_report", { files });
    expect(report.status).toBe(200);
    const reportJson = await report.json();
    expect(reportJson.result.structuredContent.tool).toEqual({ name: "docguard", version: "0.33.1" });
    expect(reportJson.result.structuredContent.integrity).toMatch(/^sha256:[a-f0-9]{64}$/);

    const diagnose = await invoke("docguard_diagnose", { files });
    expect(diagnose.status).toBe(200);
    expect((await diagnose.json()).result.structuredContent.problems.length).toBeGreaterThan(0);

    const explain = await invoke("docguard_explain", { code: "STR001" });
    expect(explain.status).toBe(200);
    expect((await explain.json()).result.structuredContent).toMatchObject({ code: "STR001", validator: "structure" });

    expect(JSON.stringify([guardJson, claimJson, reportJson])).not.toMatch(/[A-Za-z]:\\|\/tmp\/agent-opt-docguard|var[\\/]runtime[\\/]docguard/);
  }, 180_000);

  test("preserves upstream errors and rejects caller-selected host semantics", async () => {
    const unknown = await invoke("docguard_explain", { code: "BAD999" });
    expect(unknown.status).toBe(200);
    const unknownJson = await unknown.json();
    expect(unknownJson.result.isError).toBe(true);
    expect(JSON.stringify(unknownJson)).toMatch(/Unknown finding code|BAD999/);

    const attempts = [
      { files, projectDir: "C:/host" },
      { files: [{ path: "../host.txt", content: "x" }] },
      { files: [{ path: ".git/config", content: "x" }] },
      { files: [{ path: "README.md", content: "x" }, { path: "readme.md", content: "y" }] },
    ];
    for (const attempt of attempts) {
      const response = await invoke("docguard_guard", attempt);
      expect(response.status).toBe(400);
      expect((await response.json()).error).toMatch(/files|路径|重复|参数|Unrecognized|unrecognized/i);
    }
  }, 90_000);
});
