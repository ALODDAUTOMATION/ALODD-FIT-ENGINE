import type { Context, Config } from "@netlify/functions";

// ALODD Fit Engine — recommends a clothing size using Claude.
// Called from the Shopify product page via fetch("/api/fit-recommendation", { method: "POST", body: ... })

interface FitRequestBody {
  height_cm?: number;
  weight_kg?: number;
  chest_cm?: number;
  waist_cm?: number;
  hips_cm?: number;
  age?: number;
  gender?: string;
  fit_preference?: "slim" | "regular" | "relaxed";
  product_title?: string;
  size_chart?: Record<string, Record<string, [number, number]>>;
}

export default async (req: Request, context: Context) => {
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { "Content-Type": "application/json" },
    });
  }

  let body: FitRequestBody;
  try {
    body = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: "Invalid JSON body" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  const apiKey = Netlify.env.get("ANTHROPIC_API_KEY");
  if (!apiKey) {
    return new Response(
      JSON.stringify({ error: "Server misconfigured: missing ANTHROPIC_API_KEY" }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }

  const {
    height_cm,
    weight_kg,
    chest_cm,
    waist_cm,
    hips_cm,
    age,
    gender,
    fit_preference = "regular",
    product_title,
    size_chart,
  } = body;

  const systemPrompt = `You are the ALODD Fit Engine, an expert sizing assistant for an e-commerce clothing store.
Given a customer's body measurements and (optionally) a product size chart, recommend the single best size.
Always respond with STRICT JSON only, no prose, no markdown fences, matching exactly this shape:
{"recommended_size": string, "confidence": "low"|"medium"|"high", "reasoning": string, "alternative_size": string|null}`;

  const userPrompt = `Customer measurements:
- Height: ${height_cm ?? "unknown"} cm
- Weight: ${weight_kg ?? "unknown"} kg
- Chest: ${chest_cm ?? "unknown"} cm
- Waist: ${waist_cm ?? "unknown"} cm
- Hips: ${hips_cm ?? "unknown"} cm
- Age: ${age ?? "unknown"}
- Gender: ${gender ?? "unknown"}
- Fit preference: ${fit_preference}

Product: ${product_title ?? "unknown"}
Size chart (cm ranges per size): ${size_chart ? JSON.stringify(size_chart) : "not provided, use general industry standard sizing"}

Recommend the best size as strict JSON per the schema.`;

  try {
    const anthropicRes = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-sonnet-5",
        max_tokens: 500,
        system: systemPrompt,
        messages: [{ role: "user", content: userPrompt }],
      }),
    });

    if (!anthropicRes.ok) {
      const errText = await anthropicRes.text();
      return new Response(
        JSON.stringify({ error: "Claude API error", details: errText }),
        { status: 502, headers: { "Content-Type": "application/json" } }
      );
    }

    const data = await anthropicRes.json();
    const rawText = data?.content?.[0]?.text ?? "{}";

    let recommendation;
    try {
      recommendation = JSON.parse(rawText);
    } catch {
      recommendation = { raw: rawText };
    }

    return new Response(JSON.stringify(recommendation), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(
      JSON.stringify({ error: "Unexpected server error", details: String(err) }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
};

export const config: Config = {
  path: "/api/fit-recommendation",
};
