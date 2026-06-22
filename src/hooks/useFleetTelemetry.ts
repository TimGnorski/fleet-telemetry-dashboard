// ---------------------------------------------------------------------------
// hooks/useFleetTelemetry.ts
// The orchestrator. It no longer generates or scores data itself — it wires two
// services together: the telemetry service produces readings, the scoring
// client (a Web Worker behind a typed interface) turns them into health
// verdicts. The hook's job is just the React lifecycle and timing.
//
// React patterns to know cold here:
//   useState   — holds the fleet; setVehicles triggers a re-render.
//   useRef      — (1) a persistent telemetry service that survives re-renders,
//                 and (2) a "latest value" ref so the interval callback never
//                 reads a stale `vehicles` (the classic closure bug).
//   useEffect   — owns the live loop AND the worker's lifecycle: it creates the
//                 scoring client when running and disposes it on pause/unmount.
// ---------------------------------------------------------------------------

import { useState, useEffect, useRef, useCallback } from "react";
import type { Vehicle } from "../types";
import { createTelemetryService, type TelemetryService } from "../services/telemetryService";
import { createScoringClient } from "../services/scoringService";

const TICK_MS = 1500;

export function useFleetTelemetry() {
  // Persistent telemetry service (lazy-initialized once, kept across renders).
  const telemetryRef = useRef<TelemetryService | null>(null);
  if (!telemetryRef.current) telemetryRef.current = createTelemetryService();

  const [vehicles, setVehicles] = useState<Vehicle[]>(() => telemetryRef.current!.seedFleet());
  const [paused, setPaused] = useState(false);

  // Mirror the latest vehicles so the async interval reads current data.
  const vehiclesRef = useRef(vehicles);
  vehiclesRef.current = vehicles;

  useEffect(() => {
    if (paused) return;

    const telemetry = telemetryRef.current!;
    const scoring = createScoringClient(); // worker spins up while we're live

    const interval = setInterval(async () => {
      const current = vehiclesRef.current;
      const histories = Object.fromEntries(current.map((v) => [v.id, v.history]));

      // 1) ingestion service appends a fresh reading per machine
      const advanced = telemetry.advance(histories);
      // 2) scoring service (worker) turns the new histories into verdicts
      const verdicts = await scoring.score(advanced);

      setVehicles((prev) =>
        prev.map((v) => ({
          ...v,
          history: advanced[v.id] ?? v.history,
          anomalyScore: verdicts[v.id]?.score ?? v.anomalyScore,
          status: verdicts[v.id]?.status ?? v.status,
          activeAlerts: verdicts[v.id]?.alerts ?? v.activeAlerts,
        }))
      );
    }, TICK_MS);

    // Cleanup tears down both the timer and the worker.
    return () => {
      clearInterval(interval);
      scoring.dispose();
    };
  }, [paused]);

  const togglePaused = useCallback(() => setPaused((p) => !p), []);

  return { vehicles, paused, togglePaused };
}
