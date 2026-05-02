import { Router, type IRouter } from "express";
import { eq, asc } from "drizzle-orm";
import { db, suppliersTable, type Supplier } from "@workspace/db";
import {
  GetSupplierParams,
  ListSuppliersQueryParams,
} from "@workspace/api-zod";

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

router.get("/suppliers", async (req, res): Promise<void> => {
  const query = ListSuppliersQueryParams.safeParse(req.query);
  if (!query.success) {
    res.status(400).json({ error: query.error.message });
    return;
  }

  const all = await db
    .select()
    .from(suppliersTable)
    .orderBy(asc(suppliersTable.name));

  const filter = query.data.capability?.toLowerCase().trim();
  const filtered = filter
    ? all.filter((s) =>
        s.capabilities.some((c) => c.toLowerCase().includes(filter)),
      )
    : all;

  res.json(filtered.map(serializeSupplier));
});

router.get("/suppliers/:id", async (req, res): Promise<void> => {
  const params = GetSupplierParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const [supplier] = await db
    .select()
    .from(suppliersTable)
    .where(eq(suppliersTable.id, params.data.id));
  if (!supplier) {
    res.status(404).json({ error: "Supplier not found" });
    return;
  }
  res.json(serializeSupplier(supplier));
});

export default router;
