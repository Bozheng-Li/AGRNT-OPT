import { z } from "zod";

export const lifecycleStatuses = [
  "discovered",
  "qualified",
  "translated",
  "adapted",
  "web-ready",
  "verified",
  "blocked",
  "deprecated",
] as const;

export const lifecycleStatusSchema = z.enum(lifecycleStatuses);

export const testStatuses = [
  "not-run",
  "passed",
  "failed",
  "blocked",
  "not-applicable",
] as const;

export const testStatusSchema = z.enum(testStatuses);

const localizedTextSchema = z.object({
  original: z.string().min(1),
  zhCN: z.string().min(1),
  sourceLanguage: z.string().min(2).default("en"),
});

const sourceEvidenceSchema = z.object({
  kind: z.enum([
    "registry-api",
    "package-registry",
    "official-repository",
    "official-documentation",
    "official-marketplace",
    "corroborating-source",
  ]),
  url: z.string().url(),
  retrievedAt: z.string().datetime(),
  note: z.string().min(1),
});

const capabilitySchema = z.object({
  id: z.string().regex(/^[a-z0-9][a-z0-9-]*$/),
  name: localizedTextSchema,
  description: localizedTextSchema,
  risk: z.enum(["low", "medium", "high", "critical"]),
});

const permissionSchema = z.object({
  filesystem: z.enum(["none", "sandboxed-read", "sandboxed-write", "host-read", "host-write"]),
  network: z.enum(["none", "restricted", "unrestricted"]),
  commands: z.enum(["none", "fixed", "parameterized", "arbitrary"]),
  secrets: z.array(z.string()).default([]),
  externalAccounts: z.array(z.string()).default([]),
  notes: z.array(z.string()).default([]),
});

const runtimeSchema = z.object({
  adapter: z.string().min(1),
  transport: z.enum(["stdio", "streamable-http", "sse", "in-process", "none"]),
  package: z
    .object({
      registry: z.enum(["npm", "pypi", "oci", "nuget", "source", "remote"]),
      name: z.string().min(1),
      version: z.string().min(1),
    })
    .optional(),
  requirements: z.array(z.string()).default([]),
  configuration: z.array(
    z.object({
      key: z.string().min(1),
      required: z.boolean(),
      secret: z.boolean(),
      description: localizedTextSchema,
    }),
  ),
});

const testEvidenceSchema = z.object({
  id: z.string().min(1),
  category: z.enum([
    "core",
    "scenario",
    "error",
    "web-e2e",
    "permission",
    "security",
  ]),
  status: testStatusSchema,
  command: z.string().min(1).optional(),
  checkedAt: z.string().datetime().optional(),
  evidence: z.string().min(1),
});

export const pluginManifestSchema = z.object({
  schemaVersion: z.literal(1),
  id: z.string().regex(/^[a-z0-9][a-z0-9._/-]*$/),
  slug: z.string().regex(/^[a-z0-9][a-z0-9-]*$/),
  kind: z.enum(["mcp-server", "agent-skill", "plugin", "remote-tool"]),
  lifecycle: z.object({
    status: lifecycleStatusSchema,
    lastProvenStatus: lifecycleStatusSchema.optional(),
    reason: z.string().min(1).optional(),
    changedAt: z.string().datetime(),
  }),
  name: localizedTextSchema,
  summary: localizedTextSchema,
  description: localizedTextSchema,
  author: z.object({
    name: z.string().min(1),
    url: z.string().url().optional(),
    verifiedIdentity: z.boolean(),
  }),
  version: z.object({
    value: z.string().min(1),
    releasedAt: z.string().datetime().optional(),
    checkedAt: z.string().datetime(),
  }),
  categories: z.array(z.string().min(1)).min(1),
  tags: z.array(z.string().min(1)).min(1),
  source: z.object({
    primaryUrl: z.string().url(),
    repositoryUrl: z.string().url().optional(),
    packageUrl: z.string().url().optional(),
    marketplaces: z.array(
      z.object({
        sourceId: z.string().min(1),
        url: z.string().url(),
        listingId: z.string().optional(),
        checkedAt: z.string().datetime(),
      }),
    ),
    evidence: z.array(sourceEvidenceSchema).min(2),
  }),
  license: z.object({
    spdx: z.string().min(1),
    url: z.string().url(),
    redistribution: z.enum(["allowed", "conditional", "metadata-only", "forbidden", "unknown"]),
    evidence: z.string().min(1),
    checkedAt: z.string().datetime(),
  }),
  capabilities: z.array(capabilitySchema).min(1),
  permissions: permissionSchema,
  runtime: runtimeSchema,
  quality: z.object({
    score: z.number().min(0).max(100),
    usefulness: z.number().min(0).max(5),
    uniqueness: z.number().min(0).max(5),
    reliability: z.number().min(0).max(5),
    maintenance: z.number().min(0).max(5),
    provenance: z.number().min(0).max(5),
    licenseClarity: z.number().min(0).max(5),
    security: z.number().min(0).max(5),
    webFitness: z.number().min(0).max(5),
    notes: z.array(z.string().min(1)).min(1),
  }),
  translation: z.object({
    status: z.enum(["draft", "reviewed", "verified"]),
    glossaryVersion: z.string().min(1),
    translatedAt: z.string().datetime(),
    notes: z.array(z.string()).default([]),
  }),
  web: z.object({
    status: z.enum(["not-started", "in-progress", "ready", "blocked"]),
    component: z.string().min(1).optional(),
    route: z.string().startsWith("/").optional(),
    features: z.array(z.string().min(1)),
    dedicatedElements: z.array(z.string().min(1)),
  }),
  verification: z.object({
    overall: testStatusSchema,
    testedVersion: z.string().optional(),
    tests: z.array(testEvidenceSchema),
    blockers: z.array(z.string().min(1)).default([]),
  }),
});

export type PluginManifest = z.infer<typeof pluginManifestSchema>;
export type LifecycleStatus = z.infer<typeof lifecycleStatusSchema>;

const requiredVerificationCategories = ["core", "scenario", "error", "web-e2e"] as const;

export function validateManifestBusinessRules(manifest: PluginManifest): string[] {
  const errors: string[] = [];
  const publicLifecycle = manifest.lifecycle.status === "web-ready" || manifest.lifecycle.status === "verified";

  if (publicLifecycle && manifest.web.status !== "ready") {
    errors.push("web-ready and verified entries require web.status=ready");
  }

  if (manifest.web.status === "ready" && (!manifest.web.component || !manifest.web.route)) {
    errors.push("ready Web adaptations require both component and route");
  }

  if (publicLifecycle && manifest.web.dedicatedElements.length < 3) {
    errors.push("public entries require at least three capability-specific Web elements");
  }

  if (manifest.lifecycle.status === "blocked" && !manifest.lifecycle.reason) {
    errors.push("blocked entries require a lifecycle reason");
  }

  if (manifest.lifecycle.status === "deprecated" && !manifest.lifecycle.reason) {
    errors.push("deprecated entries require a lifecycle reason");
  }

  if (manifest.lifecycle.status === "verified") {
    if (manifest.verification.overall !== "passed") {
      errors.push("verified entries require verification.overall=passed");
    }

    if (manifest.verification.testedVersion !== manifest.version.value) {
      errors.push("verified entries must be tested against the current recorded version");
    }

    for (const category of requiredVerificationCategories) {
      if (!manifest.verification.tests.some((test) => test.category === category && test.status === "passed")) {
        errors.push(`verified entries require a passing ${category} test`);
      }
    }

    const needsPermissionTest =
      manifest.permissions.filesystem !== "none" ||
      manifest.permissions.network !== "none" ||
      manifest.permissions.commands !== "none" ||
      manifest.permissions.secrets.length > 0 ||
      manifest.permissions.externalAccounts.length > 0;

    if (
      needsPermissionTest &&
      !manifest.verification.tests.some(
        (test) => (test.category === "permission" || test.category === "security") && test.status === "passed",
      )
    ) {
      errors.push("verified entries with privileged capabilities require a passing permission or security test");
    }
  }

  if (manifest.license.redistribution === "unknown" && publicLifecycle) {
    errors.push("public entries require a resolved redistribution decision");
  }

  if (manifest.kind === "mcp-server" && manifest.runtime.transport === "in-process") {
    errors.push("mcp-server entries require an MCP protocol transport; classify in-process capabilities as plugin");
  }

  return errors;
}

export function isPublicManifest(manifest: PluginManifest): boolean {
  return manifest.lifecycle.status === "web-ready" || manifest.lifecycle.status === "verified";
}
