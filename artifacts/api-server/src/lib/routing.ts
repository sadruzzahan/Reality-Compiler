import type {
  Supplier,
  ProcessBreakdownItem,
  QuoteScoreFactors,
  BomItem,
} from "@workspace/db";

function tokenize(input: string): string[] {
  return input
    .toLowerCase()
    .replace(/[^a-z0-9 ]+/g, " ")
    .split(/\s+/)
    .filter((t) => t.length > 2);
}

function tokenSetMatch(target: string, candidates: string[]): boolean {
  const targetTokens = new Set(tokenize(target));
  if (targetTokens.size === 0) return false;
  for (const c of candidates) {
    const cTokens = tokenize(c);
    let overlap = 0;
    for (const t of cTokens) {
      if (targetTokens.has(t)) overlap++;
    }
    if (overlap >= Math.min(2, targetTokens.size)) return true;
    if (cTokens.length === 1 && targetTokens.has(cTokens[0]!)) return true;
  }
  return false;
}

export type DesignSnapshot = {
  productName: string;
  processes: string[];
  materials: string[];
  bom: BomItem[];
  costEstimate: { low: number; high: number; currency: string; leadTimeDays: number };
};

export type RankedQuote = {
  supplier: Supplier;
  unitCost: number;
  setupFee: number;
  totalCost: number;
  leadTimeDays: number;
  processBreakdown: ProcessBreakdownItem[];
  scoreFactors: QuoteScoreFactors;
  notes: string;
};

export function rankSuppliers(
  design: DesignSnapshot,
  suppliers: Supplier[],
  topN = 4,
): RankedQuote[] {
  const designProcesses = design.processes;
  const designMaterials = design.materials;
  const bomTotal = design.bom.reduce((acc, b) => acc + b.totalCost, 0) || design.costEstimate.low;

  const scored = suppliers.map((supplier) => {
    const matchedProcesses = designProcesses.filter((p) =>
      tokenSetMatch(p, supplier.capabilities),
    );
    const matchedMaterials = designMaterials.filter((m) =>
      tokenSetMatch(m, supplier.materials),
    );

    const processMatch = designProcesses.length
      ? matchedProcesses.length / designProcesses.length
      : 0;
    const materialMatch = designMaterials.length
      ? matchedMaterials.length / designMaterials.length
      : 0;

    const leadMid = (supplier.leadTimeMinDays + supplier.leadTimeMaxDays) / 2;
    const leadTime = Math.max(0, 1 - leadMid / 60);
    const rating = Number(supplier.rating) / 5;

    const total =
      0.45 * processMatch + 0.25 * materialMatch + 0.15 * leadTime + 0.15 * rating;

    return { supplier, processMatch, materialMatch, leadTime, rating, total, matchedProcesses, matchedMaterials };
  });

  scored.sort((a, b) => b.total - a.total);
  const top = scored.filter((s) => s.processMatch > 0 || s.materialMatch > 0).slice(0, topN);

  if (top.length === 0) {
    top.push(...scored.slice(0, Math.min(topN, scored.length)));
  }

  return top.map((s) => {
    const multiplier = Number(s.supplier.pricingMultiplier);
    const unitCost = Math.round(bomTotal * multiplier * 100) / 100;
    const setupFee = Number(s.supplier.setupFee);
    const totalCost = Math.round((unitCost + setupFee) * 100) / 100;

    const matched = s.matchedProcesses;
    const breakdownTargets = matched.length > 0 ? matched : designProcesses;
    const perProcessCost = breakdownTargets.length
      ? Math.round((unitCost / breakdownTargets.length) * 100) / 100
      : unitCost;
    const processBreakdown: ProcessBreakdownItem[] = breakdownTargets.map(
      (proc) => ({
        process: proc,
        description: matched.includes(proc)
          ? `Handled in-house at ${s.supplier.name}.`
          : `Outsourced or substituted by ${s.supplier.name}.`,
        cost: perProcessCost,
      }),
    );

    const leadTimeDays = Math.round(
      (s.supplier.leadTimeMinDays + s.supplier.leadTimeMaxDays) / 2,
    );

    const noteParts: string[] = [];
    noteParts.push(
      `${matched.length}/${designProcesses.length} process matches, ${s.matchedMaterials.length}/${designMaterials.length} material matches.`,
    );
    if (multiplier < 1) noteParts.push("Pricing favorable for production volume.");
    if (multiplier > 1.5) noteParts.push("Premium pricing — strong fit for low-volume / regulated runs.");
    if (Number(s.supplier.rating) >= 4.7) noteParts.push("Top-decile customer reviews.");

    return {
      supplier: s.supplier,
      unitCost,
      setupFee,
      totalCost,
      leadTimeDays,
      processBreakdown,
      scoreFactors: {
        processMatch: Math.round(s.processMatch * 100) / 100,
        materialMatch: Math.round(s.materialMatch * 100) / 100,
        leadTime: Math.round(s.leadTime * 100) / 100,
        rating: Math.round(s.rating * 100) / 100,
        total: Math.round(s.total * 100) / 100,
      },
      notes: noteParts.join(" "),
    };
  });
}
