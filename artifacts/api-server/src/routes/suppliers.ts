import { Router, type IRouter } from "express";
import { eq, asc } from "drizzle-orm";
import { db, suppliersTable, type Supplier } from "@workspace/db";
import {
  GetSupplierParams,
  ListSuppliersQueryParams,
} from "@workspace/api-zod";
import { asyncHandler } from "../middlewares/asyncHandler";
import { parseOrThrow } from "../middlewares/validate";
import { notFound } from "../lib/errors";

const router: IRouter = Router();

export function serializeSupplier(s: Supplier) {
  return {
    id: s.id,
    slug: s.slug,
    name: s.name,
    tagline: s.tagline,
    description: s.description,
    location: s.location,
    country: s.country,
    capabilities: s.capabilities,
    materials: s.materials,
    certifications: s.certifications,
    leadTimeMinDays: s.leadTimeMinDays,
    leadTimeMaxDays: s.leadTimeMaxDays,
    pricingMultiplier: Number(s.pricingMultiplier),
    setupFee: Number(s.setupFee),
    rating: Number(s.rating),
    capacityLevel: s.capacityLevel as "low" | "medium" | "high",
  };
}

router.get(
  "/suppliers",
  asyncHandler(async (req, res) => {
    const query = parseOrThrow(ListSuppliersQueryParams, req.query);

    const all = await db
      .select()
      .from(suppliersTable)
      .orderBy(asc(suppliersTable.name));

    const filter = query.capability?.toLowerCase().trim();
    const filtered = filter
      ? all.filter((s) =>
          s.capabilities.some((c) => c.toLowerCase().includes(filter)),
        )
      : all;

    res.json(filtered.map(serializeSupplier));
  }),
);

router.get(
  "/suppliers/:id",
  asyncHandler(async (req, res) => {
    const params = parseOrThrow(GetSupplierParams, req.params);
    const [supplier] = await db
      .select()
      .from(suppliersTable)
      .where(eq(suppliersTable.id, params.id));
    if (!supplier) throw notFound("Supplier");
    res.json(serializeSupplier(supplier));
  }),
);

export default router;
