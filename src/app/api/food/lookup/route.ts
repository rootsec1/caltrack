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

const openFoodFactsTimeoutMs = 8000;
const notFoundProductName = "Unknown product";

async function cacheMissingProduct(barcode: string) {
  const fetchedAt = new Date();
  const cacheEntry = {
    productName: notFoundProductName,
    brandName: null,
    imageUrl: null,
    servingQuantity: 1,
    servingUnit: "serving",
    calories: 0,
    protein: 0,
    carbs: 0,
    fat: 0,
    confidence: null,
    assumptions: null,
    payload: JSON.stringify(null),
    fetchedAt,
  };

  await db
    .insert(productCache)
    .values({ barcode, ...cacheEntry })
    .onConflictDoUpdate({
      target: productCache.barcode,
      set: cacheEntry,
    });
}

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
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), openFoodFactsTimeoutMs);
  let response: Response;
  let data: { product?: Parameters<typeof normalizeOpenFoodFactsProduct>[1] };

  try {
    response = await fetch(
      `https://world.openfoodfacts.org/api/v3/product/${encodeURIComponent(
        barcode,
      )}.json`,
      {
        signal: controller.signal,
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

    data = await response.json();
  } catch {
    return Response.json(
      { error: "Open Food Facts lookup timed out. Fill in the details." },
      { status: 504 },
    );
  } finally {
    clearTimeout(timeout);
  }

  const normalized = normalizeOpenFoodFactsProduct(barcode, data.product ?? {});

  if (!normalized) {
    await cacheMissingProduct(barcode);
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
