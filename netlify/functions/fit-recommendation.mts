import type { Context, Config } from "@netlify/functions";

// ALODD Phygital Fit Engine — recommends a shoe size using Claude.
// Called from the Shopify /fit-engine page via fetch("/api/fit-recommendation", { method: "POST", body: ... })

interface FitRequestBody {
  length?: number;
  standingGirth?: number;
  verticalGirth?: number;
  instep?: number;
  model?: string;
  sessionId?: string;
  customerEmail?: string;
}

const CH616E_TABLE = [
  { size: "39", girth: 228.5, instep: 236.5, length: 282.2 },
  { size: "39.5", girth: 230.5, instep: 238.5, length: 282.2 },
  { size: "40", girth: 233.0, instep: 241.0, length: 288.8 },
  { size: "40.5", girth: 235.0, instep: 243.0, length: 288.8 },
  { size: "41", girth: 237.5, instep: 245.5, length: 295.4 },
  { size: "41.5", girth: 239.5, instep: 247.5, length: 295.4 },
  { size: "42", girth: 242.0, instep: 250.0, length: 302.0 },
  { size: "42.5", girth: 244.5, instep: 252.5, length: 302.0 },
  { size: "43", girth: 246.5, instep: 254.5, length: 308.6 },
  { size: "43.5", girth: 249.0, instep: 257.0, length: 308.6 },
  { size: "44", girth: 251.0, instep: 259.0, length: 315.2 },
  { size: "44.5", girth: 253.5, instep: 261.5, length: 315.2 },
  { size: "45", girth: 255.5, instep: 263.5, length: 321.8 },
  { size: "45.5", girth: 258.0, instep: 266.0, length: 321.8 },
  { size: "46", girth: 260.0, instep: 268.0, length: 328.4 },
];

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

export default async (req: Request, context: Context) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: CORS_HEADERS });
  }

  if (req.method !== "POST") {
    return new Response(JSON.stringify({ success: false, error: "Method not allowed" }), {
      status: 405,
      headers: { "Content-Type": "application/json", ...CORS_HEADERS },
    });
  }

  let body: FitRequestBody;
  try {
    body = await req.json();
  } catch {
    return new Response(JSON.stringify({ success: false, error: "Invalid JSON body" }), {
      status: 400,
      headers: { "Content-Type": "application/json", ...CORS_HEADERS },
    });
  }

  const apiKey = Netlify.env.get("ANTHROPIC_API_KEY");
  if (!apiKey) {
    return new Response(
      JSON.stringify({ success: false, error: "Server misconfigured: missing ANTHROPIC_API_KEY" }),
      { status: 500, headers: { "Content-Type": "application/json", ...CORS_HEADERS } }
    );
  }

  const { length, standingGirth, verticalGirth, instep, model } = body;

  if (!length || !standingGirth || !verticalGirth || !instep) {
    return new Response(
      JSON.stringify({ success: false, error: "Missing required measurements" }),
      { status: 400, headers: { "Content-Type": "application/json", ...CORS_HEADERS } }
    );
  }

  const systemPrompt = `You are the ALODD Phygital Fit Engine, an expert shoe-fit assistant.
You are given a customer's foot measurements in millimetres and a reference last size chart (Calpierre CH616E).
Determine the best EU size, a width profile (C = narrow, D = standard, E = wide), and a confidence percentage (0-100).
Always respond with STRICT JSON only, no prose, no markdown fences, matching exactly this shape:
{"success": true, "result": {"size": string, "sizeSystem": "EU", "confidence": number, "widthProfile": "C"|"D"|"E", "widthLabel": "Narrow"|"Standard"|"Wide", "fitNote": string}}`;

  const userPrompt = `Customer foot measurements (mm):
- Length: ${length}
- Standing girth: ${standingGirth}
- Vertical girth: ${verticalGirth}
- Instep circumference: ${instep}
- Shoe model: ${model || "standard last, no specific model"}

Reference last size chart (Calpierre CH616E, mm):
${JSON.stringify(CH616E_TABLE)}

The last needs roughly 27mm of extra length beyond the foot length for toe clearance.
Compare standing girth against the reference girth for the chosen size to determine width profile:
more than 3mm over reference = Wide (E), more than 3mm under = Narrow (C), otherwise Standard (D).
Write a short, warm fitNote (1-2 sentences) explaining the recommendation in the ALODD brand voice.
Respond with strict JSON per the schema.`;

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
        JSON.stringify({ success: false, error: "Claude API error", details: errText }),
        { status: 502, headers: { "Content-Type": "application/json", ...CORS_HEADERS } }
      );
    }

    const data = await anthropicRes.json();
    const rawText = data?.content?.[0]?.text ?? "{}";
    const cleaned = rawText.replace(/```json|```/g, "").trim();

    let parsed;
    try {
      parsed = JSON.parse(cleaned);
    } catch {
      return new Response(
        JSON.stringify({ success: false, error: "Could not parse Claude response", raw: rawText }),
        { status: 502, headers: { "Content-Type": "application/json", ...CORS_HEADERS } }
      );
    }

    return new Response(JSON.stringify(parsed), {
      status: 200,
      headers: { "Content-Type": "application/json", ...CORS_HEADERS },
    });
  } catch (err) {
    return new Response(
      JSON.stringify({ success: false, error: "Unexpected server error", details: String(err) }),
      { status: 500, headers: { "Content-Type": "application/json", ...CORS_HEADERS } }
    );
  }
};

export const config: Config = {
  path: "/api/fit-recommendation",
};
