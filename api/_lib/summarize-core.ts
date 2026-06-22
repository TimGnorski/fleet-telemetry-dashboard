// ---------------------------------------------------------------------------
// api/_lib/summarize-core.ts
// The brains of the AI feature, deliberately separated from how it's served.
// This pure function takes a machine's current telemetry and returns a written
// incident assessment from Claude. Two thin adapters call it: the Vercel
// serverless function (production) and a Vite dev middleware (local). Splitting
// the transport from the logic is the same instinct as the rest of the app —
// and it's a clean thing to explain ("the handler is just plumbing; the actual
// work lives in one tested function").
//
// Files starting with "_" inside /api are ignored by Vercel's router, so this
// is shared code, not its own endpoint.
// ---------------------------------------------------------------------------

export interface IncidentInput {
  name: string;
  type: string;
  status: string;
  anomalyScore: number;
  alerts: string[];
  readings: {
    engineTempC: number;
    vibrationG: number;
    oilPressureKpa: number;
    fuelPct: number;
    payloadT: number;
  };
  projection: { label: string; etaSeconds: number } | null;
}

/** Turn the structured telemetry into a focused prompt for the model. */
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

/** Call Claude and return the assessment text. Throws on any API failure. */
export async function generateIncidentSummary(input: IncidentInput, apiKey: string): Promise<string> {
  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model: "claude-haiku-4-5", // cheapest current model — plenty for a short summary
      max_tokens: 300,
      messages: [{ role: "user", content: buildPrompt(input) }],
    }),
  });

  if (!response.ok) {
    const detail = await response.text();
    throw new Error(`Anthropic API ${response.status}: ${detail.slice(0, 200)}`);
  }

  const data = (await response.json()) as { content: { type: string; text?: string }[] };
  // The response is an array of blocks; pull out the text ones and join them.
  const text = data.content
    .filter((b) => b.type === "text" && b.text)
    .map((b) => b.text)
    .join("\n")
    .trim();

  return text || "No assessment returned.";
}
