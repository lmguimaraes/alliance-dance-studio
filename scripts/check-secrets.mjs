import { readdir, readFile, stat } from "node:fs/promises";
import path from "node:path";
import process from "node:process";

const root = process.cwd();
const ignoredDirectories = new Set([
  ".git",
  "node_modules",
  "dist",
  ".turbo",
  ".vite",
  "coverage",
]);
const ignoredFiles = new Set([
  ".env",
  ".env.local",
  ".env.production",
  ".env.development",
]);
const patterns = [
  {
    name: "Stripe secret",
    expression: /\bsk_(?:live|test)_[A-Za-z0-9]{16,}\b/g,
  },
  {
    name: "GitHub personal access token",
    expression: /\bgh[pousr]_[A-Za-z0-9_]{20,}\b/g,
  },
  { name: "Stripe webhook secret", expression: /\bwhsec_[A-Za-z0-9]{16,}\b/g },
];
const findings = [];

async function visit(directory) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    if (entry.isDirectory() && ignoredDirectories.has(entry.name)) continue;
    const absolute = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      await visit(absolute);
      continue;
    }
    if (!entry.isFile() || ignoredFiles.has(entry.name)) continue;
    const info = await stat(absolute);
    if (info.size > 2_000_000) continue;
    const buffer = await readFile(absolute);
    if (buffer.includes(0)) continue;
    const content = buffer.toString("utf8");
    for (const pattern of patterns) {
      pattern.expression.lastIndex = 0;
      if (pattern.expression.test(content))
        findings.push(`${path.relative(root, absolute)}: ${pattern.name}`);
    }
  }
}

await visit(root);
if (findings.length) {
  console.error(
    "Potential credentials found:\n" +
      findings.map(item => `- ${item}`).join("\n")
  );
  process.exit(1);
}
console.log("PASS: no embedded Stripe or GitHub credentials detected");
