import {
  db,
  designSessionsTable,
  designMessagesTable,
  designOutputsTable,
  marketplaceListingsTable,
} from "@workspace/db";
import { eq, sql } from "drizzle-orm";
import { logger } from "./logger";

export async function seedIfEmpty(): Promise<void> {
  try {
    const [{ c }] = await db
      .select({ c: sql<number>`count(*)::int` })
      .from(designSessionsTable);
    if (c > 0) return;

    const seeds = [
      {
        title: "Pocket Pour-Over Brewer",
        prompt:
          "A pocket-sized single-cup pour-over coffee brewer that folds flat for travel.",
        spec: {
          productName: "Drift Pour-Over Brewer",
          category: "Kitchenware",
          summary:
            "A collapsible single-cup pour-over coffee brewer that folds to credit-card thickness. Stainless steel petals snap into a cone over any standard mug, with a silicone collar for a stable rim grip.",
          primaryMaterial: "Stainless Steel",
          materials: [
            "304 Stainless Steel",
            "Food-grade Silicone",
            "Anodized Aluminum",
            "Recycled Polypropylene",
          ],
          dimensions: "100 x 100 x 6 mm folded",
          weightGrams: 78,
          processes: [
            "Laser cutting",
            "Stainless steel forming",
            "Silicone overmolding",
            "Hand assembly",
          ],
          bom: [
            { component: "Petal cone (4x)", material: "304 Stainless Steel", quantity: 1, unit: "set", unitCost: 4.2, totalCost: 4.2 },
            { component: "Hinge pin assembly", material: "Anodized Aluminum", quantity: 1, unit: "pcs", unitCost: 1.1, totalCost: 1.1 },
            { component: "Silicone rim collar", material: "Food-grade Silicone", quantity: 1, unit: "pcs", unitCost: 0.85, totalCost: 0.85 },
            { component: "Travel sleeve", material: "Recycled Polypropylene", quantity: 1, unit: "pcs", unitCost: 0.6, totalCost: 0.6 },
            { component: "Packaging carton", material: "Kraft Cardstock", quantity: 1, unit: "pcs", unitCost: 0.45, totalCost: 0.45 },
          ],
          costEstimate: { low: 8.5, high: 11.25, currency: "USD", leadTimeDays: 28 },
          manufacturingNotes:
            "Source petal stock from Korea or Taiwan; silicone overmolding is the gating step at small batch. Plan for 8% scrap on petal forming during the first run.",
        },
      },
      {
        title: "Modular Desk Lamp",
        prompt:
          "A modular desk lamp with magnetic arm segments that snap together at any angle.",
        spec: {
          productName: "Axis Modular Lamp",
          category: "Lighting",
          summary:
            "A desk lamp built from magnetic aluminum segments that snap together at any angle, letting users reconfigure the arm geometry without tools. The base hides a USB-C power module and a tactile dimmer wheel.",
          primaryMaterial: "Anodized Aluminum",
          materials: [
            "6061 Aluminum",
            "Neodymium Magnets",
            "Frosted PMMA Diffuser",
            "FR4 PCB",
            "Silicone Cable Sleeve",
          ],
          dimensions: "Base 120 x 120 x 35 mm; segments 80 mm each",
          weightGrams: 720,
          processes: [
            "CNC machining",
            "Anodizing",
            "PCB assembly",
            "Magnet press-fitting",
            "Final assembly and QC",
          ],
          bom: [
            { component: "Aluminum arm segment", material: "6061 Aluminum", quantity: 6, unit: "pcs", unitCost: 3.8, totalCost: 22.8 },
            { component: "Magnetic coupling", material: "Neodymium N52", quantity: 6, unit: "pcs", unitCost: 0.9, totalCost: 5.4 },
            { component: "LED head module", material: "PMMA + LED PCB", quantity: 1, unit: "pcs", unitCost: 9.5, totalCost: 9.5 },
            { component: "Dimmer driver PCB", material: "FR4", quantity: 1, unit: "pcs", unitCost: 6.2, totalCost: 6.2 },
            { component: "Weighted base", material: "Cast Zinc + Silicone", quantity: 1, unit: "pcs", unitCost: 7.4, totalCost: 7.4 },
            { component: "USB-C cable, 1.5m", material: "Silicone-jacketed copper", quantity: 1, unit: "pcs", unitCost: 1.6, totalCost: 1.6 },
          ],
          costEstimate: { low: 52, high: 68, currency: "USD", leadTimeDays: 45 },
          manufacturingNotes:
            "Magnet polarity must be jig-set during press-fit to ensure segments only attach in the intended orientation. Anodizing color batches across runs is the most common consistency risk — pre-approve color chips with the supplier.",
        },
      },
    ];

    for (const seed of seeds) {
      const [session] = await db
        .insert(designSessionsTable)
        .values({ userId: "system-seed", title: seed.title, status: "ready" })
        .returning();

      await db.insert(designMessagesTable).values([
        { sessionId: session.id, role: "user", content: seed.prompt },
        {
          sessionId: session.id,
          role: "assistant",
          content: `${seed.spec.productName} — ${seed.spec.summary}`,
        },
      ]);

      await db.insert(designOutputsTable).values({
        sessionId: session.id,
        productName: seed.spec.productName,
        category: seed.spec.category,
        summary: seed.spec.summary,
        primaryMaterial: seed.spec.primaryMaterial,
        materials: seed.spec.materials,
        dimensions: seed.spec.dimensions,
        weightGrams: String(seed.spec.weightGrams),
        processes: seed.spec.processes,
        bom: seed.spec.bom,
        costEstimate: seed.spec.costEstimate,
        imageUrl: null,
        manufacturingNotes: seed.spec.manufacturingNotes,
      });
    }

    logger.info({ count: seeds.length }, "Seeded design sessions");
  } catch (err) {
    logger.error({ err }, "Failed to seed");
  }
}

export async function seedMarketplaceIfEmpty(): Promise<void> {
  try {
    const [{ c }] = await db
      .select({ c: sql<number>`count(*)::int` })
      .from(marketplaceListingsTable);
    if (c > 0) return;

    const seedSessions = await db
      .select()
      .from(designSessionsTable)
      .where(eq(designSessionsTable.userId, "system-seed"));

    const listingDefaults: Record<
      string,
      { title: string; category: string; description: string; price: number }
    > = {
      "Drift Pour-Over Brewer": {
        title: "Drift Pour-Over Brewer",
        category: "Consumer",
        description:
          "A pocket-sized single-cup pour-over coffee brewer that folds flat for travel. Stainless petals snap into a cone over any standard mug, with a silicone collar for a stable rim grip.",
        price: 24,
      },
      "Axis Modular Lamp": {
        title: "Axis Modular Lamp",
        category: "Consumer",
        description:
          "A desk lamp built from magnetic aluminum segments that snap together at any angle. Reconfigure the arm geometry without tools; USB-C powered with a tactile dimmer wheel.",
        price: 129,
      },
    };

    for (const session of seedSessions) {
      const [output] = await db
        .select()
        .from(designOutputsTable)
        .where(eq(designOutputsTable.sessionId, session.id))
        .limit(1);
      if (!output) continue;
      const meta = listingDefaults[output.productName];
      if (!meta) continue;
      await db.insert(marketplaceListingsTable).values({
        sessionId: session.id,
        userId: "system-seed",
        creatorHandle: "studio",
        title: meta.title,
        category: meta.category,
        description: meta.description,
        listingPrice: String(meta.price),
        status: "active",
      });
    }
    logger.info("Seeded marketplace listings");
  } catch (err) {
    logger.error({ err }, "Failed to seed marketplace");
  }
}
