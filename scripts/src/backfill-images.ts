/**
 * One-shot backfill: migrate any `design_outputs.image_url` values still
 * stored as `data:image/...;base64,...` data URLs into App Storage and
 * rewrite the row to point at the hosted `/api/storage/objects/...` URL.
 *
 * Idempotent: rows whose `image_url` is already a hosted URL (or null) are
 * skipped. Safe to re-run.
 *
 * Run: `pnpm --filter @workspace/scripts run backfill:images`
 */
import { Storage } from "@google-cloud/storage";
import { randomUUID } from "crypto";
import { eq } from "drizzle-orm";
import { db, designOutputsTable, designSessionsTable } from "@workspace/db";

const REPLIT_SIDECAR_ENDPOINT = "http://127.0.0.1:1106";
const STORAGE_PUBLIC_PREFIX = "/api/storage/objects/";

const storage = new Storage({
  credentials: {
    audience: "replit",
    subject_token_type: "access_token",
    token_url: `${REPLIT_SIDECAR_ENDPOINT}/token`,
    type: "external_account",
    credential_source: {
      url: `${REPLIT_SIDECAR_ENDPOINT}/credential`,
      format: { type: "json", subject_token_field_name: "access_token" },
    },
    universe_domain: "googleapis.com",
  },
  projectId: "",
});

function privateDir(): string {
  const dir = process.env.PRIVATE_OBJECT_DIR;
  if (!dir) throw new Error("PRIVATE_OBJECT_DIR not set");
  return dir.endsWith("/") ? dir.slice(0, -1) : dir;
}

function parsePath(path: string) {
  const trimmed = path.startsWith("/") ? path.slice(1) : path;
  const parts = trimmed.split("/");
  if (parts.length < 2) throw new Error(`Invalid path: ${path}`);
  return { bucketName: parts[0], objectName: parts.slice(1).join("/") };
}

async function putImage(key: string, body: Buffer, contentType: string) {
  const full = `${privateDir()}/${key}`;
  const { bucketName, objectName } = parsePath(full);
  await storage
    .bucket(bucketName)
    .file(objectName)
    .save(body, {
      contentType,
      metadata: { cacheControl: "public, max-age=31536000, immutable" },
      resumable: false,
    });
  return STORAGE_PUBLIC_PREFIX + key;
}

function parseDataUrl(url: string): { contentType: string; buffer: Buffer } | null {
  const m = /^data:([^;,]+);base64,(.+)$/.exec(url);
  if (!m) return null;
  return { contentType: m[1], buffer: Buffer.from(m[2], "base64") };
}

async function main() {
  const rows = await db
    .select({
      id: designOutputsTable.id,
      sessionId: designOutputsTable.sessionId,
      imageUrl: designOutputsTable.imageUrl,
    })
    .from(designOutputsTable);

  let migrated = 0;
  let skipped = 0;
  let failed = 0;

  for (const row of rows) {
    if (!row.imageUrl || !row.imageUrl.startsWith("data:")) {
      skipped++;
      continue;
    }
    const parsed = parseDataUrl(row.imageUrl);
    if (!parsed) {
      console.warn(`[skip] output ${row.id}: unparsable data URL`);
      failed++;
      continue;
    }

    const [session] = await db
      .select({ userId: designSessionsTable.userId })
      .from(designSessionsTable)
      .where(eq(designSessionsTable.id, row.sessionId));
    if (!session) {
      console.warn(`[skip] output ${row.id}: orphaned session ${row.sessionId}`);
      failed++;
      continue;
    }

    const ext = parsed.contentType === "image/png" ? "png" : "jpg";
    const key = `sessions/${encodeURIComponent(session.userId)}/${row.sessionId}/${randomUUID()}.${ext}`;

    try {
      const url = await putImage(key, parsed.buffer, parsed.contentType);
      await db
        .update(designOutputsTable)
        .set({ imageUrl: url })
        .where(eq(designOutputsTable.id, row.id));
      migrated++;
      console.log(`[ok] output ${row.id} -> ${url}`);
    } catch (err) {
      console.error(`[err] output ${row.id}:`, err);
      failed++;
    }
  }

  console.log(
    `Backfill complete. migrated=${migrated} skipped=${skipped} failed=${failed} total=${rows.length}`,
  );
  process.exit(failed > 0 ? 1 : 0);
}

void main();
