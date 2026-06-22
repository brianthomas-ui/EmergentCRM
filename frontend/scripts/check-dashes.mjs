// Standing guard for Brian's "no em dashes" rule. Fails the build if an em dash
// (U+2014) or en dash (U+2013) appears anywhere under src/. Replace with a comma,
// colon, period, parentheses, or a spaced hyphen ( - ).
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, extname } from "node:path";
import { fileURLToPath } from "node:url";
import { dirname } from "node:path";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "src");
const EXTS = new Set([".js", ".jsx", ".ts", ".tsx", ".css"]);
const BAD = /[—–]/;

const offenders = [];

function walk(dir) {
  for (const entry of readdirSync(dir)) {
    const p = join(dir, entry);
    const st = statSync(p);
    if (st.isDirectory()) {
      walk(p);
    } else if (EXTS.has(extname(p))) {
      const lines = readFileSync(p, "utf8").split("\n");
      lines.forEach((line, i) => {
        if (BAD.test(line)) offenders.push(`${p}:${i + 1}: ${line.trim()}`);
      });
    }
  }
}

walk(ROOT);

if (offenders.length) {
  console.error(`\nFound ${offenders.length} em/en dash(es). Remove them (house rule):\n`);
  console.error(offenders.join("\n"));
  process.exit(1);
}
console.log("No em/en dashes found in src. Clean.");
