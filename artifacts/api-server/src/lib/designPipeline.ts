import { openai, generateImageBuffer } from "@workspace/integrations-openai-ai-server";
import { randomUUID } from "crypto";
import { z } from "zod";
import { logger } from "./logger";
import { putImage } from "./objectStorage";

const MODEL = "gpt-5.4";

const BomItemSchema = z.object({
  component: z.string().min(1),
  material: z.string().min(1),
  quantity: z.number().positive(),
  unit: z.string().min(1),
  unitCost: z.number().nonnegative(),
  totalCost: z.number().nonnegative(),
});

const CostEstimateSchema = z.object({
  low: z.number().nonnegative(),
  high: z.number().nonnegative(),
  currency: z.string().min(1),
  leadTimeDays: z.number().int().nonnegative(),
});

const DesignSpecSchema = z.object({
  sessionTitle: z.string().min(1),
  productName: z.string().min(1),
  category: z.string().min(1),
  summary: z.string().min(1),
  primaryMaterial: z.string().min(1),
  materials: z.array(z.string().min(1)).min(1),
  dimensions: z.string().min(1),
  weightGrams: z.number().nullable(),
  processes: z.array(z.string().min(1)).min(1),
  bom: z.array(BomItemSchema).min(1),
  costEstimate: CostEstimateSchema,
  manufacturingNotes: z.string().min(1),
  imagePrompt: z.string().min(1),
});

export type DesignSpec = z.infer<typeof DesignSpecSchema>;

const SYSTEM_PROMPT = `You are Reality Compiler — an industrial design and manufacturing engineer. You take a natural-language description of a physical product (and prior design context if any) and return a single JSON design specification that an indie hardware founder could hand to a contract manufacturer.

You MUST return strictly valid JSON matching this TypeScript shape, no prose before or after:

{
  "sessionTitle": string,            // <= 6 words, evocative title for this design session
  "productName": string,             // concrete product name
  "category": string,                // one of: Mechanical, Consumer, Apparel, Electronics, Replacement Parts
  "summary": string,                 // 2-3 sentences describing the design concept
  "primaryMaterial": string,         // single dominant material e.g. "Anodized Aluminum"
  "materials": string[],             // 3-7 distinct materials used
  "dimensions": string,              // e.g. "120 x 80 x 25 mm"
  "weightGrams": number | null,      // estimated finished weight
  "processes": string[],             // 3-6 manufacturing processes e.g. "CNC machining", "PCB assembly", "Injection molding"
  "bom": [                           // 4-8 line items, realistic BOM
    {
      "component": string,
      "material": string,
      "quantity": number,
      "unit": string,               // "pcs", "g", "m", "set"
      "unitCost": number,           // USD
      "totalCost": number           // unitCost * quantity, rounded to 2 decimals
    }
  ],
  "costEstimate": {
    "low": number,                  // total unit cost low estimate USD
    "high": number,                 // total unit cost high estimate USD
    "currency": "USD",
    "leadTimeDays": number          // typical lead time for first 100 units
  },
  "manufacturingNotes": string,     // 2-4 sentences on assembly, sourcing, or risks
  "imagePrompt": string             // a vivid prompt for an image generator describing a clean studio render of this product on a neutral background
}

Rules:
- Costs are realistic per-unit at small batch (100-500 units).
- BOM totalCost = unitCost * quantity, rounded to 2 decimals.
- costEstimate.low/high should bracket the sum of bom totalCost values reasonably.
- No markdown, no commentary, JSON only.`;

type ChatMessage = { role: "user" | "assistant"; content: string };

export async function generateDesignSpec(
  history: ChatMessage[],
): Promise<DesignSpec> {
  const completion = await openai.chat.completions.create({
    model: MODEL,
    response_format: { type: "json_object" },
    messages: [
      { role: "system", content: SYSTEM_PROMPT },
      ...history.map((m) => ({ role: m.role, content: m.content })),
    ],
  });

  const text = completion.choices[0]?.message?.content;
  if (!text) {
    throw new Error("No content returned from model");
  }

  const raw = JSON.parse(text);
  const parsed = DesignSpecSchema.parse(raw);

  for (const item of parsed.bom) {
    item.totalCost = Math.round(item.unitCost * item.quantity * 100) / 100;
  }

  return parsed;
}

export async function generateAndStoreConceptImage(
  imagePrompt: string,
  userId: string,
  sessionId: number,
): Promise<string | null> {
  try {
    const buffer = await generateImageBuffer(
      `${imagePrompt}. Clean studio product photo, soft neutral background, sharp focus, professional industrial design render.`,
      "1024x1024",
    );
    const safeUser = encodeURIComponent(userId);
    const key = `sessions/${safeUser}/${sessionId}/${randomUUID()}.png`;
    return await putImage(key, buffer, "image/png");
  } catch (err) {
    logger.error({ err, sessionId }, "Image generation failed");
    return null;
  }
}
