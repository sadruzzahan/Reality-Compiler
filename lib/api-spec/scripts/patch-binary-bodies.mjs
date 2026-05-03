#!/usr/bin/env node
import { readFileSync, writeFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const target = resolve(__dirname, "..", "..", "api-client-react", "src", "generated", "api.ts");

const BINARY_OPERATIONS = [
  {
    name: "uploadAvatar",
    bodyType: "Blob | File",
  },
];

let source = readFileSync(target, "utf8");
let changed = false;

for (const op of BINARY_OPERATIONS) {
  const re = new RegExp(
    String.raw`export const ${op.name} = async \(\s*${op.name}Body: [^,]+,\s*options\?: RequestInit,\s*\): Promise<([^>]+)> => \{\s*return customFetch<\1>\(get${op.name[0].toUpperCase()}${op.name.slice(1)}Url\(\), \{\s*\.\.\.options,\s*method: "POST",\s*headers: \{ "Content-Type": "[^"]+", \.\.\.options\?\.headers \},\s*body: JSON\.stringify\(${op.name}Body\),\s*\}\);\s*\};`,
    "m",
  );

  const cap = `${op.name[0].toUpperCase()}${op.name.slice(1)}`;
  const replacement = `export const ${op.name} = async (
  ${op.name}Body: ${op.bodyType},
  options?: RequestInit,
): Promise<Me> => {
  const contentType =
    (${op.name}Body as Blob).type && (${op.name}Body as Blob).type.length > 0
      ? (${op.name}Body as Blob).type
      : "application/octet-stream";
  return customFetch<Me>(get${cap}Url(), {
    ...options,
    method: "POST",
    headers: { "Content-Type": contentType, ...options?.headers },
    body: ${op.name}Body,
  });
};`;

  if (!re.test(source)) {
    console.warn(`[patch-binary-bodies] WARN: pattern for ${op.name} not found; skipping.`);
    continue;
  }
  source = source.replace(re, replacement);
  changed = true;
  console.log(`[patch-binary-bodies] patched ${op.name}`);
}

if (changed) {
  writeFileSync(target, source);
}
