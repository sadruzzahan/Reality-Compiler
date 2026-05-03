import { Storage, type File as GcsFile } from "@google-cloud/storage";
import type { Response } from "express";
import { logger } from "./logger";

const REPLIT_SIDECAR_ENDPOINT = "http://127.0.0.1:1106";

export const objectStorageClient = new Storage({
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

export const STORAGE_PUBLIC_PREFIX = "/api/storage/objects/";
export const IMMUTABLE_CACHE_HEADER = "public, max-age=31536000, immutable";

function getPrivateDir(): string {
  const dir = process.env.PRIVATE_OBJECT_DIR;
  if (!dir) throw new Error("PRIVATE_OBJECT_DIR not set");
  return dir.endsWith("/") ? dir.slice(0, -1) : dir;
}

function parseObjectPath(path: string): {
  bucketName: string;
  objectName: string;
} {
  const trimmed = path.startsWith("/") ? path.slice(1) : path;
  const parts = trimmed.split("/");
  if (parts.length < 2) throw new Error(`Invalid object path: ${path}`);
  return { bucketName: parts[0], objectName: parts.slice(1).join("/") };
}

function fileForKey(key: string): GcsFile {
  const dir = getPrivateDir();
  const full = `${dir}/${key}`;
  const { bucketName, objectName } = parseObjectPath(full);
  return objectStorageClient.bucket(bucketName).file(objectName);
}

export function urlForObjectKey(key: string): string {
  return STORAGE_PUBLIC_PREFIX + key;
}

export function objectKeyFromUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  if (!url.startsWith(STORAGE_PUBLIC_PREFIX)) return null;
  return url.slice(STORAGE_PUBLIC_PREFIX.length);
}

export function isStorageUrl(url: string | null | undefined): boolean {
  return objectKeyFromUrl(url) != null;
}

export function isDataUrl(url: string | null | undefined): boolean {
  return typeof url === "string" && url.startsWith("data:");
}

export async function putImage(
  key: string,
  body: Buffer,
  contentType: string,
): Promise<string> {
  const file = fileForKey(key);
  await file.save(body, {
    contentType,
    metadata: { cacheControl: IMMUTABLE_CACHE_HEADER },
    resumable: false,
  });
  return urlForObjectKey(key);
}

export async function deleteObjectByKey(key: string): Promise<void> {
  try {
    await fileForKey(key).delete({ ignoreNotFound: true });
  } catch (err) {
    logger.warn({ err, key }, "object storage delete failed");
  }
}

export async function deleteObjectByUrl(
  url: string | null | undefined,
): Promise<void> {
  const key = objectKeyFromUrl(url);
  if (!key) return;
  await deleteObjectByKey(key);
}

export async function streamObject(key: string, res: Response): Promise<void> {
  const file = fileForKey(key);
  const [exists] = await file.exists();
  if (!exists) {
    res.status(404).json({ error: "Not found" });
    return;
  }
  const [metadata] = await file.getMetadata();
  res.setHeader(
    "Content-Type",
    String(metadata.contentType ?? "application/octet-stream"),
  );
  res.setHeader("Cache-Control", IMMUTABLE_CACHE_HEADER);
  if (metadata.size) res.setHeader("Content-Length", String(metadata.size));
  await new Promise<void>((resolve, reject) => {
    file
      .createReadStream()
      .on("error", reject)
      .on("end", resolve)
      .pipe(res);
  });
}
