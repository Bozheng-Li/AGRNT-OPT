import { loadCatalog } from "../src/lib/catalog";

const catalog = loadCatalog();
const lifecycle = new Map<string, number>();
const verification = new Map<string, number>();

for (const plugin of catalog) {
  lifecycle.set(plugin.lifecycle.status, (lifecycle.get(plugin.lifecycle.status) ?? 0) + 1);
  verification.set(plugin.verification.overall, (verification.get(plugin.verification.overall) ?? 0) + 1);
}

console.log(`Curated entries: ${catalog.length}`);
console.log("Lifecycle coverage:");
for (const [status, count] of [...lifecycle.entries()].sort()) console.log(`  ${status}: ${count}`);
console.log("Verification coverage:");
for (const [status, count] of [...verification.entries()].sort()) console.log(`  ${status}: ${count}`);

