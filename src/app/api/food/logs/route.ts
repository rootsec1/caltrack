import { and, desc, eq, gte, lte } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { foodLogs } from "@/db/schema";
import {
  foodLogInputSchema,
  parseAssumptions,
  serializeAssumptions,
} from "@/lib/food";
import { requireUser } from "@/lib/session";

export const runtime = "nodejs";

const idSchema = z.object({ id: z.string().min(1) });

function toClientLog(log: typeof foodLogs.$inferSelect) {
  return {
    ...log,
    assumptions: parseAssumptions(log.assumptions),
    loggedAt: log.loggedAt.toISOString(),
    createdAt: log.createdAt.toISOString(),
    updatedAt: log.updatedAt.toISOString(),
  };
}

export async function GET(request: Request) {
  const user = await requireUser(request.headers);
  const url = new URL(request.url);
  const start = url.searchParams.get("start");
  const end = url.searchParams.get("end");

  const filters = [eq(foodLogs.userId, user.id)];
  if (start) filters.push(gte(foodLogs.loggedAt, new Date(start)));
  if (end) filters.push(lte(foodLogs.loggedAt, new Date(end)));

  const logs = await db
    .select()
    .from(foodLogs)
    .where(and(...filters))
    .orderBy(desc(foodLogs.loggedAt));

  return Response.json({ logs: logs.map(toClientLog) });
}

export async function POST(request: Request) {
  const user = await requireUser(request.headers);
  const parsed = foodLogInputSchema.safeParse(await request.json());

  if (!parsed.success) {
    return Response.json({ error: "Invalid food log." }, { status: 400 });
  }

  const now = new Date();
  const [created] = await db
    .insert(foodLogs)
    .values({
      id: crypto.randomUUID(),
      userId: user.id,
      loggedAt: parsed.data.loggedAt ?? now,
      itemName: parsed.data.itemName,
      brandName: parsed.data.brandName ?? null,
      barcode: parsed.data.barcode ?? null,
      imageUrl: parsed.data.imageUrl ?? null,
      servingQuantity: parsed.data.servingQuantity,
      servingUnit: parsed.data.servingUnit,
      calories: parsed.data.calories,
      protein: parsed.data.protein,
      carbs: parsed.data.carbs,
      fat: parsed.data.fat,
      note: parsed.data.note ?? null,
      source: parsed.data.source,
      confidence: parsed.data.confidence ?? null,
      assumptions: serializeAssumptions(parsed.data.assumptions),
      createdAt: now,
      updatedAt: now,
    })
    .returning();

  return Response.json({ log: toClientLog(created) }, { status: 201 });
}

export async function PATCH(request: Request) {
  const user = await requireUser(request.headers);
  const body = await request.json();
  const id = idSchema.safeParse(body);
  const parsed = foodLogInputSchema.partial().safeParse(body);

  if (!id.success || !parsed.success) {
    return Response.json({ error: "Invalid food log update." }, { status: 400 });
  }

  const [updated] = await db
    .update(foodLogs)
    .set({
      ...("loggedAt" in parsed.data && parsed.data.loggedAt
        ? { loggedAt: parsed.data.loggedAt }
        : {}),
      ...("itemName" in parsed.data ? { itemName: parsed.data.itemName } : {}),
      ...("brandName" in parsed.data
        ? { brandName: parsed.data.brandName ?? null }
        : {}),
      ...("barcode" in parsed.data ? { barcode: parsed.data.barcode ?? null } : {}),
      ...("imageUrl" in parsed.data
        ? { imageUrl: parsed.data.imageUrl ?? null }
        : {}),
      ...("servingQuantity" in parsed.data
        ? { servingQuantity: parsed.data.servingQuantity }
        : {}),
      ...("servingUnit" in parsed.data
        ? { servingUnit: parsed.data.servingUnit }
        : {}),
      ...("calories" in parsed.data ? { calories: parsed.data.calories } : {}),
      ...("protein" in parsed.data ? { protein: parsed.data.protein } : {}),
      ...("carbs" in parsed.data ? { carbs: parsed.data.carbs } : {}),
      ...("fat" in parsed.data ? { fat: parsed.data.fat } : {}),
      ...("note" in parsed.data ? { note: parsed.data.note ?? null } : {}),
      ...("source" in parsed.data ? { source: parsed.data.source } : {}),
      ...("confidence" in parsed.data
        ? { confidence: parsed.data.confidence ?? null }
        : {}),
      ...("assumptions" in parsed.data
        ? { assumptions: serializeAssumptions(parsed.data.assumptions) }
        : {}),
      updatedAt: new Date(),
    })
    .where(and(eq(foodLogs.id, id.data.id), eq(foodLogs.userId, user.id)))
    .returning();

  if (!updated) {
    return Response.json({ error: "Food log not found." }, { status: 404 });
  }

  return Response.json({ log: toClientLog(updated) });
}

export async function DELETE(request: Request) {
  const user = await requireUser(request.headers);
  const parsed = idSchema.safeParse(await request.json());
  if (!parsed.success) {
    return Response.json({ error: "Invalid food log id." }, { status: 400 });
  }

  const deleted = await db
    .delete(foodLogs)
    .where(and(eq(foodLogs.id, parsed.data.id), eq(foodLogs.userId, user.id)))
    .returning({ id: foodLogs.id });

  return Response.json({ deleted: deleted.length > 0 });
}
