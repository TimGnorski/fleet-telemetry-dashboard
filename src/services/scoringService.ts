// ---------------------------------------------------------------------------
// services/scoringService.ts
// A typed CLIENT for the scoring worker. The hook never touches postMessage or
// worker internals — it calls `score(histories)` and awaits a result, exactly
// as if it were calling a remote service. This is the microservices pattern in
// miniature: a clean async interface over a transport that happens to be a Web
// Worker.
//
// Two reliability features worth pointing at:
//   1. Request IDs — each call is tagged so its response is matched to the right
//      promise, even if several are in flight.
//   2. Graceful fallback — if Workers aren't available, or the worker is slow to
//      respond, we score synchronously on the main thread instead. The consumer
//      can't tell the difference; it just always gets a result.
// ---------------------------------------------------------------------------

import type { TelemetryReading, HealthStatus } from "../types";
import { scoreVehicle } from "../lib/anomaly";

export interface Verdict {
  score: number;
  status: HealthStatus;
  alerts: string[];
}

export interface ScoringClient {
  score(histories: Record<string, TelemetryReading[]>): Promise<Record<string, Verdict>>;
  dispose(): void;
}

/** The main-thread fallback — the same scoring, just not offloaded. */
function scoreSync(histories: Record<string, TelemetryReading[]>): Record<string, Verdict> {
  const out: Record<string, Verdict> = {};
  for (const [id, history] of Object.entries(histories)) {
    out[id] = scoreVehicle(history);
  }
  return out;
}

const RESPONSE_TIMEOUT_MS = 800; // if the worker is slower than this, fall back

export function createScoringClient(): ScoringClient {
  let worker: Worker | null = null;
  try {
    worker = new Worker(new URL("./scoring.worker.ts", import.meta.url), { type: "module" });
  } catch {
    worker = null; // environment without Worker support
  }

  // No worker → a client that just scores inline. Same interface.
  if (!worker) {
    return {
      async score(histories) {
        return scoreSync(histories);
      },
      dispose() {},
    };
  }

  const w = worker;
  let seq = 0;
  const pending = new Map<number, (v: Record<string, Verdict>) => void>();

  w.onmessage = (e: MessageEvent<{ id: number; verdicts: Record<string, Verdict> }>) => {
    const { id, verdicts } = e.data;
    const resolve = pending.get(id);
    if (resolve) {
      pending.delete(id);
      resolve(verdicts);
    }
  };

  return {
    score(histories) {
      const id = ++seq;
      return new Promise((resolve) => {
        const timer = setTimeout(() => {
          // Worker didn't answer in time — drop the pending entry and fall back.
          if (pending.delete(id)) resolve(scoreSync(histories));
        }, RESPONSE_TIMEOUT_MS);

        pending.set(id, (verdicts) => {
          clearTimeout(timer);
          resolve(verdicts);
        });
        w.postMessage({ id, histories });
      });
    },
    dispose() {
      w.terminate();
      pending.clear();
    },
  };
}
