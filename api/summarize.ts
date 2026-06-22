// ---------------------------------------------------------------------------
// api/summarize.ts
// Self-contained Vercel serverless function. Everything it needs (prompt +
// Anthropic call) is inline, so there are no helper imports or extra type
// packages for Vercel's builder to trip over. The key is read from an
// environment variable, so it stays server-side and never reaches the browser.
// ---------------------------------------------------------------------------

interface Readings {
  engineTempC: number;
  vibrationG: number;
  oilPressureKpa: number;
  fuelPct: number;
  payloadT: number;
}

interface IncidentInput {
  name: string;
  type: string;
  status: string;
  anomalyScore: number;
  alerts: string[];
  readings: Readings;
  projection: { label: string; etaSeconds: number } | null;
}

// Minimal request/response shapes — matches Vercel's Node function signature
// without depending on the @vercel/node types package.
interface Req {
  method?: string;
  body?: unknown;
}
interface Res {
  status: (code: number) => Res;
  json: (data: unknown) => void;
}

function buildPrompt(i: IncidentInput): string {
  const r = i.readings;
  const forecast = i.projection
    ? `Trend projection: ${i.projection.label} reaches its operational redline in ~${Math.round(i.projection.etaSeconds)}s.`
    : "No channel is currently trending toward a redline.";

  return [
    `You are a mining-equipment maintenance advisor reviewing live telemetry from a ${i.type} (unit ${i.name}).`,
    ``,
    `Current status: ${i.status} (anomaly score ${i.anomalyScore}/100).`,
    `Engine temp: ${r.engineTempC}°C | Vibration: ${r.vibrationG}g | Oil pressure: ${r.oilPressureKpa}kPa | Fuel: ${r.fuelPct}% | Payload: ${r.payloadT}t.`,
    `Active alerts: ${i.alerts.length ? i.alerts.join("; ") : "none"}.`,
    forecast,
    ``,
    `Operating limits — note the direction of danger for each channel:`,
    `- Engine temp: dangerous when HIGH; redline 120°C (overheating).`,
    `- Vibration: dangerous when HIGH; redline 1.6g (mechanical wear/misalignment).`,
    `- Oil pressure: dangerous when LOW; redline 255kPa. A reading falling TOWARD 255 is a pressure LOSS (e.g. low oil level, failing pump, worn bearings, leak) — never describe it as a spike or high pressure.`,
    `- Fuel and payload: informational only, not failure conditions.`,
    ``,
    `Give a brief operational assessment. Respond in exactly three plain-text lines, no markdown, no preamble:`,
    `Assessment: <one sentence on overall condition>`,
    `Likely cause: <one sentence root-cause hypothesis grounded in the readings AND the correct direction of the breach>`,
    `Recommended action: <one concrete next step for the operator>`,
  ].join("\n");
}

async function generateIncidentSummary(input: IncidentInput, apiKey: string): Promise<string> {
  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model: "claude-haiku-4-5",
      max_tokens: 300,
      messages: [{ role: "user", content: buildPrompt(input) }],
    }),
  });

  if (!response.ok) {
    const detail = await response.text();
    throw new Error(`Anthropic API ${response.status}: ${detail.slice(0, 200)}`);
  }

  const data = (await response.json()) as { content: { type: string; text?: string }[] };
  const text = data.content
    .filter((b) => b.type === "text" && b.text)
    .map((b) => b.text)
    .join("\n")
    .trim();

  return text || "No assessment returned.";
}

export default async function handler(req: Req, res: Res) {
  if (req.method !== "POST") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    res.status(500).json({ error: "Server is missing ANTHROPIC_API_KEY" });
    return;
  }

  try {
    const input = (typeof req.body === "string" ? JSON.parse(req.body) : req.body) as IncidentInput;
    const summary = await generateIncidentSummary(input, apiKey);
    res.status(200).json({ summary });
  } catch (err) {
    res.status(502).json({ error: err instanceof Error ? err.message : "Upstream error" });
  }
}
