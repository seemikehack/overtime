import { readFileSync, writeFileSync } from "node:fs";
import format from "html-format";

const files = process.argv.slice(2);
if (files.length === 0) files.push("index.html");

const indent = "  ";
const width = 160;

for (const file of files) {
  const original = readFileSync(file, "utf8");
  const formatted = format(original, indent, width);

  if (formatted !== original) {
    writeFileSync(file, formatted, "utf8");
    console.log(`Formatted ${file}`);
  }
}
