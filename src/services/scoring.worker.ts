// ---------------------------------------------------------------------------
// services/scoring.worker.ts
// The anomaly SCORING service, running in a Web Worker — a separate thread.
// Scoring every channel of every machine on each tick is the heaviest compute
// in the app; doing it here keeps it off the main thread so the UI (charts,
// interactions) never janks while it runs. Conceptually it's a worker service
// you call over a message channel rather than a direct function call.
//
// A Worker has its own global scope (no DOM, no React). We talk to it purely by
// passing serializable messages in and out.
// ---------------------------------------------------------------------------

import type { TelemetryReading, HealthStatus } from "../types";
import { scoreVehicle } from "../lib/anomaly";

interface ScoreRequest {
  id: number;
  histories: Record<string, TelemetryReading[]>;
}

interface Verdict {
  score: number;
  status: HealthStatus;
  alerts: string[];
}

// The worker's global scope. We type just the two members we use so this
// compiles cleanly without pulling in conflicting global libs.
const ctx = self as unknown as {
  onmessage: ((e: MessageEvent<ScoreRequest>) => void) | null;
  postMessage: (msg: { id: number; verdicts: Record<string, Verdict> }) => void;
};

ctx.onmessage = (e) => {
  const { id, histories } = e.data;
  const verdicts: Record<string, Verdict> = {};
  for (const [vehicleId, history] of Object.entries(histories)) {
    verdicts[vehicleId] = scoreVehicle(history);
  }
  ctx.postMessage({ id, verdicts });
};
