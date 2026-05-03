import { Router, type IRouter } from "express";
import {
  db,
  marketplaceListingsTable as marketplaceListings,
  userProfilesTable as userProfiles,
} from "@workspace/db";
import { and, eq, isNull, sql } from "drizzle-orm";
import { asyncHandler } from "../middlewares/asyncHandler";

const router: IRouter = Router();

const STATIC_PAGES: { path: string; priority: string; changefreq: string }[] = [
  { path: "/", priority: "1.0", changefreq: "weekly" },
  { path: "/marketplace", priority: "0.9", changefreq: "daily" },
  { path: "/about", priority: "0.6", changefreq: "monthly" },
  { path: "/pricing", priority: "0.7", changefreq: "monthly" },
  { path: "/contact", priority: "0.4", changefreq: "yearly" },
  { path: "/terms", priority: "0.3", changefreq: "yearly" },
  { path: "/privacy", priority: "0.3", changefreq: "yearly" },
  { path: "/acceptable-use", priority: "0.3", changefreq: "yearly" },
  { path: "/cookies", priority: "0.3", changefreq: "yearly" },
  { path: "/legal/dpa", priority: "0.3", changefreq: "yearly" },
];

function escapeXml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function originFromReq(req: import("express").Request, sitePrefix: string): string {
  const proto =
    (req.headers["x-forwarded-proto"] as string | undefined)?.split(",")[0]?.trim() ||
    req.protocol;
  const host =
    (req.headers["x-forwarded-host"] as string | undefined) ||
    req.headers.host ||
    "localhost";
  const base = `${proto}://${host}`;
  const cleanPrefix = sitePrefix.replace(/\/+$/, "");
  return `${base}${cleanPrefix}`;
}

router.get(
  "/sitemap.xml",
  asyncHandler(async (req, res) => {
    // Front-end artifact base path. The API and the SPA may be mounted at
    // different prefixes, so we accept an explicit override via env to keep
    // sitemap URLs canonical to the marketing surface.
    const sitePrefix =
      process.env["SITE_BASE_PATH"] ?? process.env["BASE_PATH"] ?? "";
    const origin = originFromReq(req, sitePrefix);

    const listings = await db
      .select({
        id: marketplaceListings.id,
        updatedAt: marketplaceListings.updatedAt,
      })
      .from(marketplaceListings)
      .where(
        and(eq(marketplaceListings.status, "active"), isNull(marketplaceListings.deletedAt)),
      )
      .orderBy(marketplaceListings.id);

    // Only include designers who actually have at least one active,
    // non-deleted listing — avoids "thin content" pages for accounts that
    // signed up but never published anything.
    const designers = await db
      .select({
        userId: userProfiles.userId,
        updatedAt: userProfiles.updatedAt,
      })
      .from(userProfiles)
      .where(
        and(
          isNull(userProfiles.deletedAt),
          sql`EXISTS (
            SELECT 1 FROM ${marketplaceListings}
            WHERE ${marketplaceListings.userId} = ${userProfiles.userId}
              AND ${marketplaceListings.status} = 'active'
              AND ${marketplaceListings.deletedAt} IS NULL
          )`,
        ),
      );

    const today = new Date().toISOString().slice(0, 10);

    const urls: string[] = [];

    for (const p of STATIC_PAGES) {
      urls.push(
        `<url><loc>${escapeXml(origin + p.path)}</loc><changefreq>${p.changefreq}</changefreq><priority>${p.priority}</priority><lastmod>${today}</lastmod></url>`,
      );
    }

    for (const l of listings) {
      const lastmod = (l.updatedAt instanceof Date ? l.updatedAt : new Date())
        .toISOString()
        .slice(0, 10);
      urls.push(
        `<url><loc>${escapeXml(`${origin}/marketplace/${l.id}`)}</loc><changefreq>weekly</changefreq><priority>0.8</priority><lastmod>${lastmod}</lastmod></url>`,
      );
    }

    for (const d of designers) {
      const lastmod = (d.updatedAt instanceof Date ? d.updatedAt : new Date())
        .toISOString()
        .slice(0, 10);
      urls.push(
        `<url><loc>${escapeXml(`${origin}/designers/${d.userId}`)}</loc><changefreq>monthly</changefreq><priority>0.5</priority><lastmod>${lastmod}</lastmod></url>`,
      );
    }

    const xml =
      `<?xml version="1.0" encoding="UTF-8"?>\n` +
      `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.join("\n")}\n</urlset>\n`;

    res.setHeader("Content-Type", "application/xml; charset=utf-8");
    res.setHeader("Cache-Control", "public, max-age=600");
    res.send(xml);
  }),
);

export default router;
