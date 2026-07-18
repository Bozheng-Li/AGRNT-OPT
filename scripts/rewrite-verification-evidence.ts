/**
 * Promote web-ready entries only from a real Playwright JSON report.
 *
 * Dry-run (default):
 *   npx tsx scripts/rewrite-verification-evidence.ts
 * Apply after all non-Web evidence is already passed:
 *   npx tsx scripts/rewrite-verification-evidence.ts --apply
 */
import { existsSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { pluginManifestSchema, type PluginManifest } from "../src/lib/catalog/schema";

type PlaywrightResult = { status?: string };
type PlaywrightTest = { projectName?: string; results?: PlaywrightResult[] };
type PlaywrightSpec = { title?: string; tests?: PlaywrightTest[] };
type PlaywrightSuite = { title?: string; specs?: PlaywrightSpec[]; suites?: PlaywrightSuite[] };
type PlaywrightReport = { suites?: PlaywrightSuite[] };

const reportPath = path.resolve(
  process.argv.find((argument) => argument.endsWith(".json")) ??
    path.join("var", "test-results", "playwright.json"),
);
const shouldApply = process.argv.includes("--apply");
const pluginsDir = path.join(process.cwd(), "catalog", "plugins");

if (!existsSync(reportPath)) {
  throw new Error(`Playwright JSON report not found: ${reportPath}. Run npm run test:e2e first.`);
}

const report = JSON.parse(readFileSync(reportPath, "utf8")) as PlaywrightReport;
const coverage = new Map<string, { titles: string[]; passed: boolean }>();

function visit(suites: PlaywrightSuite[], parents: string[] = []) {
  for (const suite of suites) {
    const nextParents = suite.title ? [...parents, suite.title] : parents;
    for (const spec of suite.specs ?? []) {
      const title = [...nextParents, spec.title ?? ""].filter(Boolean).join(" › ");
      const match = /@web-e2e\s+\[([a-z0-9][a-z0-9-]*)\]/.exec(title);
      if (!match) continue;
      const chromium = (spec.tests ?? []).filter((test) => test.projectName === "chromium");
      const passed = chromium.length > 0 && chromium.every(
        (test) => (test.results?.length ?? 0) > 0 && test.results!.every((result) => result.status === "passed"),
      );
      const current = coverage.get(match[1]) ?? { titles: [], passed: true };
      current.titles.push(title);
      current.passed = current.passed && passed;
      coverage.set(match[1], current);
    }
    visit(suite.suites ?? [], nextParents);
  }
}

visit(report.suites ?? []);

const manifests = new Map<string, { file: string; value: PluginManifest }>();
for (const file of readdirSync(pluginsDir).filter((name) => name.endsWith(".json"))) {
  const value = pluginManifestSchema.parse(JSON.parse(readFileSync(path.join(pluginsDir, file), "utf8")));
  manifests.set(value.slug, { file, value });
}

const promoted: string[] = [];
const evidencedWebReady: string[] = [];
const skipped: Array<{ slug: string; reason: string }> = [];
const checkedAt = new Date().toISOString();
for (const [slug, result] of [...coverage.entries()].sort(([left], [right]) => left.localeCompare(right))) {
  if (!result.passed) {
    skipped.push({ slug, reason: "one or more Chromium results were not passed" });
    continue;
  }
  const item = manifests.get(slug);
  if (!item) {
    skipped.push({ slug, reason: "no curated manifest" });
    continue;
  }
  const manifest = item.value;
  if (manifest.lifecycle?.status !== "web-ready") {
    skipped.push({ slug, reason: `lifecycle is ${manifest.lifecycle?.status ?? "missing"}, not web-ready` });
    continue;
  }
  const tests = manifest.verification.tests;
  const required = ["core", "scenario", "error"];
  if (!required.every((category) => tests.some((test) => test.category === category && test.status === "passed"))) {
    skipped.push({ slug, reason: "core/scenario/error evidence is not passed" });
    continue;
  }
  const needsPermission =
    manifest.permissions?.filesystem !== "none" ||
    manifest.permissions?.network !== "none" ||
    manifest.permissions?.commands !== "none" ||
    (manifest.permissions?.secrets?.length ?? 0) > 0 ||
    (manifest.permissions?.externalAccounts?.length ?? 0) > 0;
  if (
    needsPermission &&
    !tests.some((test) => (test.category === "permission" || test.category === "security") && test.status === "passed")
  ) {
    skipped.push({ slug, reason: "required permission/security evidence is not passed" });
    continue;
  }
  const web = tests.find((test) => test.category === "web-e2e");
  if (!web) {
    skipped.push({ slug, reason: "manifest has no web-e2e evidence slot" });
    continue;
  }
  web.status = "passed";
  web.command = "npm run test:e2e";
  web.checkedAt = checkedAt;
  web.evidence = [
    "runner=playwright",
    "browser=chromium",
    `report=${path.relative(process.cwd(), reportPath).replace(/\\/g, "/")}`,
    `testIds=${result.titles.join(" | ")}`,
    `route=${manifest.web?.route ?? `/plugins/${slug}`}`,
    "result=passed",
  ].join("; ");
  manifest.verification.overall = "passed";
  manifest.verification.testedVersion = manifest.version.value;
  if (manifest.kind === "agent-skill") {
    manifest.verification.blockers = [
      "The shipped bilingual Web adaptation is verified; optional upstream scripts and downstream agent outcomes are outside this adapter and are not claimed as executed.",
    ];
    evidencedWebReady.push(slug);
    if (shouldApply) {
      writeFileSync(path.join(pluginsDir, item.file), `${JSON.stringify(manifest, null, 2)}\n`);
    }
    continue;
  }
  manifest.verification.blockers = [];
  manifest.lifecycle = { status: "verified", changedAt: checkedAt };
  promoted.push(slug);
  if (shouldApply) {
    writeFileSync(path.join(pluginsDir, item.file), `${JSON.stringify(manifest, null, 2)}\n`);
  }
}

console.log(JSON.stringify({
  reportPath,
  mode: shouldApply ? "apply" : "dry-run",
  covered: coverage.size,
  promoted,
  evidencedWebReady,
  skipped,
}, null, 2));
