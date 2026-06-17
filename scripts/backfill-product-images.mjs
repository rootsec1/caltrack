import { createClient } from "@libsql/client";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";

function getDatabaseConfig() {
  if (process.env.TURSO_DATABASE_URL) {
    return {
      url: process.env.TURSO_DATABASE_URL,
      authToken: process.env.TURSO_AUTH_TOKEN,
    };
  }

  const url = process.env.DATABASE_URL ?? "file:./.data/caltrack.db";
  if (url.startsWith("file:")) {
    mkdirSync(dirname(url.replace("file:", "")), { recursive: true });
  }

  return { url, authToken: undefined };
}

function validUrl(value) {
  if (typeof value !== "string" || value.trim() === "") return null;
  try {
    return new URL(value).toString();
  } catch {
    return null;
  }
}

function productImageUrl(product) {
  return (
    validUrl(product?.image_front_url) ??
    validUrl(product?.image_url) ??
    validUrl(product?.selected_images?.front?.display?.en) ??
    validUrl(product?.selected_images?.front?.small?.en) ??
    null
  );
}

async function getBackfillBarcodes(client) {
  const result = await client.execute(`
    select barcode from product_cache
    where barcode is not null and barcode != ''
      and (image_url is null or image_url = '')
    union
    select barcode from food_logs
    where barcode is not null and barcode != ''
      and (image_url is null or image_url = '')
  `);

  return result.rows.map((row) => String(row.barcode));
}

async function syncLogsFromCache(client) {
  const result = await client.execute(`
    update food_logs
    set image_url = (
      select product_cache.image_url
      from product_cache
      where product_cache.barcode = food_logs.barcode
    )
    where (image_url is null or image_url = '')
      and barcode is not null
      and exists (
        select 1
        from product_cache
        where product_cache.barcode = food_logs.barcode
          and product_cache.image_url is not null
          and product_cache.image_url != ''
      )
  `);

  return result.rowsAffected;
}

async function fetchProductImage(barcode, userAgent) {
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

  if (!response.ok) return null;
  const data = await response.json();
  return productImageUrl(data.product);
}

async function updateProductCache(client, barcode, imageUrl) {
  const cached = await client.execute({
    sql: "select payload from product_cache where barcode = ?",
    args: [barcode],
  });
  const payload = cached.rows[0]?.payload;

  if (typeof payload === "string") {
    try {
      const parsed = JSON.parse(payload);
      parsed.imageUrl = imageUrl;
      await client.execute({
        sql: "update product_cache set image_url = ?, payload = ? where barcode = ?",
        args: [imageUrl, JSON.stringify(parsed), barcode],
      });
      return;
    } catch {
      // Fall through and preserve the original payload if it is not valid JSON.
    }
  }

  await client.execute({
    sql: "update product_cache set image_url = ? where barcode = ?",
    args: [imageUrl, barcode],
  });
}

async function updateFoodLogs(client, barcode, imageUrl) {
  await client.execute({
    sql: `
      update food_logs
      set image_url = ?
      where barcode = ?
        and (image_url is null or image_url = '')
    `,
    args: [imageUrl, barcode],
  });
}

async function main() {
  const client = createClient(getDatabaseConfig());
  const userAgent =
    process.env.OPENFOODFACTS_USER_AGENT ??
    "Caltrack/1.0 (configure OPENFOODFACTS_USER_AGENT)";
  const syncedLogs = await syncLogsFromCache(client);
  const barcodes = await getBackfillBarcodes(client);
  let updated = 0;
  let missing = 0;

  for (const barcode of barcodes) {
    const imageUrl = await fetchProductImage(barcode, userAgent);
    if (!imageUrl) {
      missing += 1;
      continue;
    }

    await updateProductCache(client, barcode, imageUrl);
    await updateFoodLogs(client, barcode, imageUrl);
    updated += 1;
  }

  client.close();
  console.log(
    `Backfilled product images: ${updated} fetched, ${syncedLogs} logs synced from cache, ${missing} without image, ${barcodes.length} checked.`,
  );
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
