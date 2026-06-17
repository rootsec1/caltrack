import { eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { productCache } from "@/db/schema";
import {
  normalizeOpenFoodFactsProduct,
  parseAssumptions,
  serializeAssumptions,
} from "@/lib/food";
import { requireUser } from "@/lib/session";

export const runtime = "nodejs";

const requestSchema = z.object({
  barcode: z.string().trim().min(6).max(32),
});

function productFromCache(cached: typeof productCache.$inferSelect) {
  if (cached.calories > 0) {
    return {
      itemName: cached.productName,
      brandName: cached.brandName,
      barcode: cached.barcode,
      imageUrl: cached.imageUrl,
      servingQuantity: cached.servingQuantity,
      servingUnit: cached.servingUnit,
      calories: cached.calories,
      protein: cached.protein,
      carbs: cached.carbs,
      fat: cached.fat,
      source: "barcode" as const,
      confidence: cached.confidence,
      assumptions: parseAssumptions(cached.assumptions),
    };
  }

  return JSON.parse(cached.payload);
}

export async function POST(request: Request) {
  await requireUser(request.headers);

  const input = requestSchema.safeParse(await request.json());
  if (!input.success) {
    return Response.json({ error: "Invalid barcode." }, { status: 400 });
  }

  const barcode = input.data.barcode;
  const cached = await db.query.productCache.findFirst({
    where: eq(productCache.barcode, barcode),
  });

  if (cached) {
    return Response.json({
      product: productFromCache(cached),
      cached: true,
    });
  }

  const userAgent =
    process.env.OPENFOODFACTS_USER_AGENT ??
    "Caltrack/1.0 (configure OPENFOODFACTS_USER_AGENT)";
  const response = await fetch(
    `https://world.openfoodfacts.org/api/v3/product/${encodeURIComponent(
      barcode,
    )}.json`,
    {
      headers: {
        "User-Agent": userAgent,
        Accept: "application/json",
      },
    },
  );

  if (!response.ok) {
    return Response.json(
      { error: "Open Food Facts is unavailable right now." },
      { status: 502 },
    );
  }

  const data = await response.json();
  const normalized = normalizeOpenFoodFactsProduct(barcode, data.product ?? {});

  if (!normalized) {
    return Response.json({ product: null, cached: false });
  }

  await db
    .insert(productCache)
    .values({
      barcode,
      productName: normalized.itemName,
      brandName: normalized.brandName ?? null,
      imageUrl: normalized.imageUrl ?? null,
      servingQuantity: normalized.servingQuantity,
      servingUnit: normalized.servingUnit,
      calories: normalized.calories,
      protein: normalized.protein,
      carbs: normalized.carbs,
      fat: normalized.fat,
      confidence: normalized.confidence ?? null,
      assumptions: serializeAssumptions(normalized.assumptions),
      payload: JSON.stringify(normalized),
      fetchedAt: new Date(),
    })
    .onConflictDoUpdate({
      target: productCache.barcode,
      set: {
        productName: normalized.itemName,
        brandName: normalized.brandName ?? null,
        imageUrl: normalized.imageUrl ?? null,
        servingQuantity: normalized.servingQuantity,
        servingUnit: normalized.servingUnit,
        calories: normalized.calories,
        protein: normalized.protein,
        carbs: normalized.carbs,
        fat: normalized.fat,
        confidence: normalized.confidence ?? null,
        assumptions: serializeAssumptions(normalized.assumptions),
        payload: JSON.stringify(normalized),
        fetchedAt: new Date(),
      },
    });

  return Response.json({ product: normalized, cached: false });
}
