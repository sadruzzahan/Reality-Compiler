// Post-build step: upload Vite sourcemaps to Sentry (when configured) and
// then DELETE all `.map` files from the deploy bundle so they aren't served
// to end users in production. Runs unconditionally after `vite build`.
//
// Upload runs only when SENTRY_AUTH_TOKEN, SENTRY_ORG, and SENTRY_PROJECT
// are set in the build environment. If any are missing, we log a warning
// and skip the upload — but we still delete the maps so source code never
// leaks publicly.
import { execSync } from "node:child_process";
import { readdirSync, statSync, rmSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const distDir = path.resolve(here, "..", "dist", "public");

function findMaps(dir) {
  const out = [];
  for (const entry of readdirSync(dir)) {
    const full = path.join(dir, entry);
    const st = statSync(full);
    if (st.isDirectory()) out.push(...findMaps(full));
    else if (entry.endsWith(".map")) out.push(full);
  }
  return out;
}

function tryUpload() {
  const token = process.env.SENTRY_AUTH_TOKEN;
  const org = process.env.SENTRY_ORG;
  const project = process.env.SENTRY_PROJECT;
  const release = process.env.SENTRY_RELEASE;

  if (!token || !org || !project) {
    console.warn(
      "[upload-sourcemaps] SENTRY_AUTH_TOKEN/SENTRY_ORG/SENTRY_PROJECT not all set — skipping upload (maps will still be deleted from the bundle).",
    );
    return false;
  }

  const args = [
    "--yes",
    "@sentry/cli",
    "sourcemaps",
    "upload",
    "--org",
    org,
    "--project",
    project,
  ];
  if (release) args.push("--release", release);
  args.push(distDir);

  try {
    execSync(`npx ${args.map((a) => JSON.stringify(a)).join(" ")}`, {
      stdio: "inherit",
      env: { ...process.env, SENTRY_AUTH_TOKEN: token },
    });
    return true;
  } catch (err) {
    console.error("[upload-sourcemaps] upload failed:", err?.message ?? err);
    return false;
  }
}

function deleteMaps() {
  let count = 0;
  for (const file of findMaps(distDir)) {
    rmSync(file);
    count += 1;
  }
  console.log(`[upload-sourcemaps] deleted ${count} .map file(s) from ${distDir}`);
}

tryUpload();
deleteMaps();
