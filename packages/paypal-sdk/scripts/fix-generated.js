import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const generatedDir = path.join(__dirname, "../generated");

console.log("🔧 Fixing generated code issues...\n");

// Fix invalid type exports and duplicate exports
function fixIndexFile(filePath) {
  let content = fs.readFileSync(filePath, "utf8");
  let fixed = false;

  // Remove empty exports: export type {  } from './models/';
  const before = content;
  content = content.replace(
    /export type\s*{\s*}\s*from\s*['"][^'"]*['"];?\s*\n/g,
    ""
  );

  // Remove duplicate exports by tracking seen exports
  const lines = content.split("\n");
  const seenExports = new Set();
  const filteredLines = lines.filter((line) => {
    const match = line.match(/export type\s*{\s*([^}]+)\s*}\s*from/);
    if (match) {
      const exportName = match[1].trim();
      if (seenExports.has(exportName)) {
        fixed = true;
        return false; // Skip duplicate
      }
      seenExports.add(exportName);
    }
    return true;
  });

  content = filteredLines.join("\n");

  if (content !== before) {
    fs.writeFileSync(filePath, content);
    fixed = true;
  }

  return fixed;
}

// Fix invalid type definitions
function fixTypeFile(filePath) {
  let content = fs.readFileSync(filePath, "utf8");
  let fixed = false;

  // Fix: export type foo = (bar & );
  if (content.includes("& );")) {
    content = content.replace(/=\s*\(([^)]+)\s*&\s*\);/g, "= $1;");
    fixed = true;
  }

  // Fix: export type foo = ;
  if (content.match(/export type\s+\w+\s*=\s*;/)) {
    content = content.replace(
      /(export type\s+\w+\s*=\s*);/g,
      "$1Record<string, any>;"
    );
    fixed = true;
  }

  // Fix: import type {  } from './';
  if (content.includes("import type {  } from './';")) {
    content = content.replace(
      /import type\s*{\s*}\s*from\s*['"][^'"]*['"];?\s*\n/g,
      ""
    );
    fixed = true;
  }

  if (fixed) {
    fs.writeFileSync(filePath, content);
  }

  return fixed;
}

// Recursively process all TypeScript files
function processDirectory(dir) {
  let fixedCount = 0;

  const entries = fs.readdirSync(dir, { withFileTypes: true });

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);

    if (entry.isDirectory()) {
      fixedCount += processDirectory(fullPath);
    } else if (entry.name.endsWith(".ts")) {
      let fixed = false;

      if (entry.name === "index.ts") {
        fixed = fixIndexFile(fullPath);
      } else {
        fixed = fixTypeFile(fullPath);
      }

      if (fixed) {
        const relativePath = path.relative(generatedDir, fullPath);
        console.log(`  ✓ Fixed: ${relativePath}`);
        fixedCount++;
      }
    }
  }

  return fixedCount;
}

const fixedCount = processDirectory(generatedDir);

if (fixedCount > 0) {
  console.log(`\n✅ Fixed ${fixedCount} file(s)\n`);
} else {
  console.log("✅ No issues found\n");
}
