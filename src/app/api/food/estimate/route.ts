import { z } from "zod";
import {
  foodEstimateSchema,
  normalizeFoodEstimate,
} from "@/lib/food";
import { requireUser } from "@/lib/session";

export const runtime = "nodejs";

const geminiModel = process.env.GEMINI_MODEL ?? "gemini-3.1-flash-lite";
const maxImageBytes = 7 * 1024 * 1024;

const responseSchema = {
  type: "object",
  properties: {
    itemName: {
      type: "string",
      description: "Short recognizable name for the food.",
    },
    servingQuantity: {
      type: "number",
      description: "Quantity represented by the estimate.",
    },
    servingUnit: {
      type: "string",
      description: "Serving unit, for example bowl, plate, sandwich, cup, or grams.",
    },
    calories: {
      type: "number",
      description: "Estimated calories for the serving.",
    },
    protein: {
      type: "number",
      description: "Estimated grams of protein for the serving.",
    },
    carbs: {
      type: "number",
      description: "Estimated grams of carbohydrates for the serving.",
    },
    fat: {
      type: "number",
      description: "Estimated grams of fat for the serving.",
    },
    confidence: {
      type: "number",
      description: "Confidence from 0 to 1.",
    },
    assumptions: {
      type: "array",
      items: { type: "string" },
      description: "Brief assumptions that explain the estimate.",
    },
  },
  required: [
    "itemName",
    "servingQuantity",
    "servingUnit",
    "calories",
    "protein",
    "carbs",
    "fat",
    "confidence",
    "assumptions",
  ],
};

const geminiResponseSchema = z.object({
  output_text: z.string().optional(),
  steps: z
    .array(
      z.object({
        type: z.string().optional(),
        content: z
          .array(
            z.object({
              type: z.string().optional(),
              text: z.string().optional(),
            }),
          )
          .optional(),
      }),
    )
    .optional(),
});

function promptText(note: string, hasImage: boolean) {
  return [
    "Estimate nutrition for a food log entry.",
    "Return only the structured fields requested by the schema.",
    "Estimate calories, protein, carbs, and fat for the described serving.",
    "Be conservative and practical. Do not invent a brand.",
    "If an image is present, use it only to improve the estimate.",
    "The user will review and edit the result before saving.",
    hasImage ? "Input includes an image." : "Input is text-only.",
    `User note: ${note}`,
  ].join("\n");
}

async function fileToBase64(file: File) {
  const bytes = Buffer.from(await file.arrayBuffer());
  return bytes.toString("base64");
}

function extractGeminiText(response: z.infer<typeof geminiResponseSchema>) {
  if (response.output_text) return response.output_text;
  for (const step of response.steps ?? []) {
    if (step.type && step.type !== "model_output") continue;
    for (const content of step.content ?? []) {
      if (content.text) return content.text;
    }
  }
  return null;
}

export async function POST(request: Request) {
  await requireUser(request.headers);

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return Response.json(
      { error: "GEMINI_API_KEY is required for food estimates." },
      { status: 503 },
    );
  }

  const formData = await request.formData();
  const note = String(formData.get("prompt") ?? "").trim();
  const image = formData.get("image");

  if (!note && !(image instanceof File && image.size > 0)) {
    return Response.json(
      { error: "Describe the food or attach an image." },
      { status: 400 },
    );
  }

  if (image instanceof File && image.size > maxImageBytes) {
    return Response.json(
      { error: "Image must be smaller than 7 MB." },
      { status: 400 },
    );
  }

  if (
    image instanceof File &&
    image.size > 0 &&
    !image.type.startsWith("image/")
  ) {
    return Response.json(
      { error: "Attach an image file." },
      { status: 400 },
    );
  }

  const hasImage = image instanceof File && image.size > 0;
  const input: Array<Record<string, string>> = [
    { type: "text", text: promptText(note || "No text note provided.", hasImage) },
  ];

  if (hasImage) {
    input.push({
      type: "image",
      data: await fileToBase64(image),
      mime_type: image.type || "image/jpeg",
    });
  }

  const response = await fetch(
    "https://generativelanguage.googleapis.com/v1beta/interactions",
    {
      method: "POST",
      headers: {
        "x-goog-api-key": apiKey,
        "Content-Type": "application/json",
        "Api-Revision": "2026-05-20",
      },
      body: JSON.stringify({
        model: geminiModel,
        input,
        response_format: {
          type: "text",
          mime_type: "application/json",
          schema: responseSchema,
        },
      }),
    },
  );

  if (!response.ok) {
    return Response.json(
      { error: "Gemini could not estimate this food right now." },
      { status: 502 },
    );
  }

  const raw = geminiResponseSchema.safeParse(await response.json());
  if (!raw.success) {
    return Response.json(
      { error: "Gemini returned an unexpected estimate." },
      { status: 502 },
    );
  }

  const outputText = extractGeminiText(raw.data);
  if (!outputText) {
    return Response.json(
      { error: "Gemini returned an empty estimate." },
      { status: 502 },
    );
  }

  let parsedOutput: unknown;
  try {
    parsedOutput = JSON.parse(outputText);
  } catch {
    return Response.json(
      { error: "Gemini returned malformed nutrition details." },
      { status: 502 },
    );
  }

  const estimate = foodEstimateSchema.safeParse(parsedOutput);
  if (!estimate.success) {
    return Response.json(
      { error: "Gemini returned incomplete nutrition details." },
      { status: 502 },
    );
  }

  return Response.json({
    product: {
      ...normalizeFoodEstimate(estimate.data),
      note: note || null,
    },
  });
}
