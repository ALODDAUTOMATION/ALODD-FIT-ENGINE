import type { Context, Config } from "@netlify/edge-functions";

// ALODD Phygital Fit Engine — computes a shoe size recommendation deterministically
// from the Calpierre CH616E last chart. Runs as a Netlify Edge Function for
// near-instant response: no cold start, no external API call.
// Called from the Shopify /fit-engine page via fetch("/api/fit-recommendation", { method: "POST", body: ... })

interface FitRequestBody {
  length?: number;
  girth?: number;
  instep?: number;
  model?: string;
  sessionId?: string;
  customerEmail?: string;
}

interface SizeRow {
  size: string;
  girth: number;
  instep: number;
  length: number;
}

const CH616E_TABLE: SizeRow[] = [
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

const TOE_CLEARANCE_MM = 27;

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

function pickBestRow(targetLastLength: number, girth: number, instep: number): SizeRow {
  let best = CH616E_TABLE[0];
  let bestScore = Infinity;
  for (const row of CH616E_TABLE) {
    const score =
      Math.abs(targetLastLength - row.length) * 1.0 +
      Math.abs(girth - row.girth) * 0.6 +
      Math.abs(instep - row.instep) * 0.4;
    if (score < bestScore) {
      bestScore = score;
      best = row;
    }
  }
  return best;
}

function widthFromDiff(diff: number): { widthProfile: "C" | "D" | "E"; widthLabel: string } {
  if (diff > 3) return { widthProfile: "E", widthLabel: "Wide" };
  if (diff < -3) return { widthProfile: "C", widthLabel: "Narrow" };
  return { widthProfile: "D", widthLabel: "Standard" };
}

function pick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

function buildFitNote(size: string, widthLabel: string, confidence: number): string {
  const w = widthLabel.toLowerCase();
  if (confidence >= 90) {
    return pick([
      `Your measurements align closely with our ${size} EU last — expect a ${w} fit with confident, all-day comfort.`,
      `A precise match: ${size} EU, ${w} profile. This is as close to made-to-measure as ready sizing gets.`,
      `Your ${size} EU size is a strong match for the Calpierre last — ${w} width, built for comfort from the first step.`,
    ]);
  }
  if (confidence >= 75) {
    return pick([
      `Based on your measurements, ${size} EU should serve you well, with a ${w} profile close to your foot's true shape.`,
      `We recommend ${size} EU in a ${w} fit — a solid match, with a touch of natural break-in expected.`,
      `Your foot falls close to our ${size} EU last, ${w} profile. A comfortable, dependable choice.`,
    ]);
  }
  return pick([
    `Your ${size} EU size is our best match, though your foot sits between two of our reference profiles — ${w} is our closest recommendation.`,
    `We recommend starting with ${size} EU, ${w} width — your measurements sit at the edge of this range, so a quick try-on is worth it.`,
    `${size} EU, ${w} fit, is our nearest match for your measurements — slightly outside our most common range, but a great starting point.`,
  ]);
}

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

  const { length, girth, instep } = body;
  if (!length || !girth || !instep) {
    return new Response(
      JSON.stringify({ success: false, error: "Missing required measurements" }),
      { status: 400, headers: { "Content-Type": "application/json", ...CORS_HEADERS } }
    );
  }

  try {
    const targetLastLength = length + TOE_CLEARANCE_MM;
    const matchedRow = pickBestRow(targetLastLength, girth, instep);

    const girthDiff = girth - matchedRow.girth;
    const instepDiff = instep - matchedRow.instep;
    const combinedDiff = (girthDiff + instepDiff) / 2;

    const { widthProfile, widthLabel } = widthFromDiff(combinedDiff);

    const totalDeviation =
      Math.abs(targetLastLength - matchedRow.length) +
      Math.abs(girthDiff) +
      Math.abs(instepDiff);

    const confidence = Math.max(55, Math.min(98, Math.round(97 - totalDeviation * 1.1)));

    const fitNote = buildFitNote(matchedRow.size, widthLabel, confidence);

    const result = {
      size: matchedRow.size,
      sizeSystem: "EU",
      confidence,
      widthProfile,
      widthLabel,
      fitNote,
    };

    return new Response(JSON.stringify({ success: true, result }), {
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
