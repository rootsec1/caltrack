import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

const repoOwner = "mvark";
const repoName = "indiafoodstats";
const branch = "main";
const defaultOutput = ".data/india-product-cache.csv";
const confidence = 0.78;
const includeAggregateFiles = process.argv.includes("--include-aggregate");
const includeAllPrefixes = process.argv.includes("--all-prefixes");

function argValue(name, fallback) {
  const index = process.argv.indexOf(name);
  if (index === -1) return fallback;
  return process.argv[index + 1] ?? fallback;
}

function csvEscape(value) {
  if (value === null || value === undefined) return "";
  const text = String(value);
  if (!/[",\n\r]/.test(text)) return text;
  return `"${text.replaceAll('"', '""')}"`;
}

function parseCsv(text) {
  const rows = [];
  let row = [];
  let cell = "";
  let quoted = false;

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    const next = text[index + 1];

    if (quoted) {
      if (char === '"' && next === '"') {
        cell += '"';
        index += 1;
      } else if (char === '"') {
        quoted = false;
      } else {
        cell += char;
      }
      continue;
    }

    if (char === '"') {
      quoted = true;
    } else if (char === ",") {
      row.push(cell);
      cell = "";
    } else if (char === "\n") {
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
    } else if (char !== "\r") {
      cell += char;
    }
  }

  if (cell !== "" || row.length > 0) {
    row.push(cell);
    rows.push(row);
  }

  return rows.filter((cells) => cells.some((value) => value.trim() !== ""));
}

function cleanText(value) {
  const cleaned = value?.trim().replace(/\s+/g, " ");
  return cleaned || null;
}

function numberFrom(value) {
  if (value === null || value === undefined) return null;
  const cleaned = String(value)
    .replace(/,/g, "")
    .replace(/[^\d.+-]/g, "")
    .trim();
  if (!cleaned) return null;
  const parsed = Number(cleaned);
  return Number.isFinite(parsed) ? parsed : null;
}

function firstValue(row, names) {
  for (const name of names) {
    const value = row[name];
    if (value !== undefined && value.trim() !== "") return value;
  }
  return null;
}

function firstNumber(row, names) {
  for (const name of names) {
    const parsed = numberFrom(row[name]);
    if (parsed !== null) return parsed;
  }
  return null;
}

function normalizeBarcode(value) {
  const digits = value?.replace(/\D/g, "") ?? "";
  if (!/^\d{12,14}$/.test(digits)) return null;
  if (!includeAllPrefixes && !digits.startsWith("890")) return null;
  return digits;
}

function scoreCandidate(candidate) {
  let score = 0;
  if (candidate.calories > 0) score += 4;
  if (candidate.protein > 0) score += 1;
  if (candidate.carbs > 0) score += 1;
  if (candidate.fat > 0) score += 1;
  if (candidate.brandName) score += 1;
  return score;
}

function normalizedPayload(candidate) {
  return {
    itemName: candidate.productName,
    brandName: candidate.brandName,
    barcode: candidate.barcode,
    imageUrl: null,
    servingQuantity: 1,
    servingUnit: "100 g",
    calories: candidate.calories,
    protein: candidate.protein,
    carbs: candidate.carbs,
    fat: candidate.fat,
    source: "barcode",
    confidence,
    assumptions: [
      "Imported from public India Food Stats CSV data derived from Open Food Facts India.",
      "Nutrition values are per 100 g where source nutrient columns use per-100g labels.",
    ],
  };
}

function normalizeRow(row, sourceFile, fetchedAt) {
  const barcode = normalizeBarcode(firstValue(row, ["code", "barcode"]));
  const productName = cleanText(
    firstValue(row, ["product_name", "food_name", "name", "products"]),
  );
  const calories =
    firstNumber(row, [
      "energy-kcal_100g",
      "energy_kcal",
      "calories",
      "energy-kcal",
      "energy",
    ]) ?? 0;

  if (!barcode || !productName || calories <= 0) return null;

  const candidate = {
    barcode,
    productName,
    brandName: cleanText(firstValue(row, ["brands", "brand", "brand_name"])),
    imageUrl: null,
    servingQuantity: 1,
    servingUnit: "100 g",
    calories: Math.round(calories),
    protein:
      firstNumber(row, ["proteins_100g", "protein_g", "protein", "proteins"]) ??
      0,
    carbs:
      firstNumber(row, [
        "carbohydrates_100g",
        "carb_g",
        "carbs",
        "carbohydrate",
      ]) ?? 0,
    fat: firstNumber(row, ["fat_100g", "fat_g", "fat"]) ?? 0,
    confidence,
    assumptions: JSON.stringify([
      "Imported from public India Food Stats CSV data derived from Open Food Facts India.",
      `Source file: ${sourceFile}`,
    ]),
    fetchedAt,
    sourceFile,
  };

  const normalized = {
    ...candidate,
    protein: Math.round(candidate.protein * 10) / 10,
    carbs: Math.round(candidate.carbs * 10) / 10,
    fat: Math.round(candidate.fat * 10) / 10,
  };

  return {
    ...normalized,
    payload: JSON.stringify(normalizedPayload(normalized)),
  };
}

async function fetchJson(url) {
  const response = await fetch(url, {
    headers: { "User-Agent": "CaltrackDataPrep/1.0" },
  });
  if (!response.ok) {
    throw new Error(`Failed to fetch ${url}: ${response.status}`);
  }
  return response.json();
}

async function fetchText(url) {
  const response = await fetch(url, {
    headers: { "User-Agent": "CaltrackDataPrep/1.0" },
  });
  if (!response.ok) {
    throw new Error(`Failed to fetch ${url}: ${response.status}`);
  }
  return response.text();
}

async function getCsvFiles() {
  const tree = await fetchJson(
    `https://api.github.com/repos/${repoOwner}/${repoName}/git/trees/${branch}?recursive=1`,
  );

  return tree.tree
    .filter((entry) => entry.type === "blob" && entry.path.endsWith(".csv"))
    .map((entry) => entry.path)
    .filter((path) => includeAggregateFiles || !isAggregateFile(path))
    .sort();
}

function isAggregateFile(path) {
  return (
    path.startsWith("data/") ||
    path.startsWith("Brands/all_") ||
    /top\d+/i.test(path) ||
    path === "Fitness/Gadgets/Smartwatches.csv" ||
    path === "Misc/RegionalNames.csv" ||
    path.startsWith("Nutrients/") ||
    path === "data/weather.csv"
  );
}

function rowsFromCsv(text) {
  const [headers, ...records] = parseCsv(text);
  if (!headers) return [];
  const normalizedHeaders = headers.map((header) => header.trim());

  return records.map((cells) =>
    Object.fromEntries(
      normalizedHeaders.map((header, index) => [header, cells[index] ?? ""]),
    ),
  );
}

function toCacheCsv(candidates) {
  const columns = [
    "barcode",
    "product_name",
    "brand_name",
    "image_url",
    "serving_quantity",
    "serving_unit",
    "calories",
    "protein",
    "carbs",
    "fat",
    "confidence",
    "assumptions",
    "payload",
    "fetched_at",
  ];

  const lines = [columns.join(",")];
  for (const candidate of candidates) {
    lines.push(
      [
        candidate.barcode,
        candidate.productName,
        candidate.brandName,
        candidate.imageUrl,
        candidate.servingQuantity,
        candidate.servingUnit,
        candidate.calories,
        candidate.protein,
        candidate.carbs,
        candidate.fat,
        candidate.confidence,
        candidate.assumptions,
        candidate.payload,
        candidate.fetchedAt,
      ]
        .map(csvEscape)
        .join(","),
    );
  }

  return `${lines.join("\n")}\n`;
}

async function main() {
  const output = resolve(argValue("--out", defaultOutput));
  const fetchedAt = Date.now();
  const csvFiles = await getCsvFiles();
  const byBarcode = new Map();
  let parsedRows = 0;
  let usableRows = 0;

  for (const file of csvFiles) {
    const rawUrl = `https://raw.githubusercontent.com/${repoOwner}/${repoName}/${branch}/${file
      .split("/")
      .map(encodeURIComponent)
      .join("/")}`;
    const csv = await fetchText(rawUrl);
    const rows = rowsFromCsv(csv);
    parsedRows += rows.length;

    for (const row of rows) {
      const candidate = normalizeRow(row, file, fetchedAt);
      if (!candidate) continue;

      usableRows += 1;
      const existing = byBarcode.get(candidate.barcode);
      if (!existing || scoreCandidate(candidate) > scoreCandidate(existing)) {
        byBarcode.set(candidate.barcode, candidate);
      }
    }
  }

  const candidates = [...byBarcode.values()].sort((a, b) =>
    a.barcode.localeCompare(b.barcode),
  );
  mkdirSync(dirname(output), { recursive: true });
  writeFileSync(output, toCacheCsv(candidates), "utf8");

  console.log(
    [
      `Wrote ${candidates.length} product_cache candidates to ${output}.`,
      `${csvFiles.length} CSV files fetched, ${parsedRows} rows parsed, ${usableRows} usable rows before dedupe.`,
      "Import columns match product_cache.",
      includeAggregateFiles
        ? "Aggregate snapshot files were included."
        : "Aggregate snapshot files were skipped; pass --include-aggregate to include them.",
      includeAllPrefixes
        ? "All barcode prefixes were included."
        : "Only 890-prefixed GS1 India barcodes were included; pass --all-prefixes to include all GTIN prefixes.",
    ].join("\n"),
  );
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
