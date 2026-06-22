// ---------------------------------------------------------------------------
// api/summarize.ts
// The PRODUCTION endpoint. On Vercel, any file in /api becomes a serverless
// function automatically — this one is reachable at POST /api/summarize. It is
// where your API key lives at runtime (read from an environment variable), so
// the secret stays on the server and never reaches the browser.
//
// This is, quite literally, a microservice: a small, independently-deployed
// unit with one job (turn telemetry into an assessment), called over HTTP.
// ---------------------------------------------------------------------------

import type { VercelRequest, VercelResponse } from "@vercel/node";
import { generateIncidentSummary } from "./_lib/summarize-core";

export default async function handler(req: VercelRequest, res: VercelResponse) {
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
    const summary = await generateIncidentSummary(req.body, apiKey);
    res.status(200).json({ summary });
  } catch (err) {
    res.status(502).json({ error: err instanceof Error ? err.message : "Upstream error" });
  }
}
