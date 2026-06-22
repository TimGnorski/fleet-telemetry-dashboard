// ---------------------------------------------------------------------------
// services/telemetryService.ts
// The telemetry INGESTION service. Its single job is to produce sensor readings
// — in a real system this would be an API/WebSocket client pulling from the
// field; here it simulates that source. Pulling it out of the hook gives us a
// clean seam: the rest of the app depends on the service's typed interface, not
// on how the data is produced, so swapping the simulation for a live feed later
// touches only this file.
// ---------------------------------------------------------------------------

import type { Vehicle, TelemetryReading } from "../types";
import { FLEET_SEED, type VehicleSeed } from "../data/fleet";

const HISTORY_LEN = 40; // bounded rolling window per machine (~1 min)

/** Small gaussian-ish jitter so each channel looks alive, not robotic. */
function jitter(spread: number): number {
  return (Math.random() + Math.random() - 1) * spread;
}

/** Produce the next reading for one vehicle given its seed and the tick count. */
function nextReading(seed: VehicleSeed, tick: number, prev?: TelemetryReading): TelemetryReading {
  const b = seed.baseline;
  const drift = (channel: keyof typeof b, spread: number) => {
    const faultRamp =
      seed.fault && seed.fault.channel === channel ? seed.fault.rampPerTick * tick : 0;
    return b[channel] + faultRamp + jitter(spread);
  };

  const prevFuel = prev?.fuelPct ?? b.fuelPct;
  const refuel = Math.random() < 0.02 && prevFuel < 30;
  const fuelPct = refuel ? 95 : Math.max(4, prevFuel - 0.25 - Math.random() * 0.2);

  return {
    timestamp: Date.now(),
    engineTempC: Math.round(drift("engineTempC", 1.4) * 10) / 10,
    fuelPct: Math.round(fuelPct * 10) / 10,
    payloadT: Math.max(0, Math.round(drift("payloadT", b.payloadT > 0 ? 14 : 0))),
    oilPressureKpa: Math.round(drift("oilPressureKpa", 4)),
    vibrationG: Math.max(0, Math.round(drift("vibrationG", 0.08) * 100) / 100),
  };
}

export interface TelemetryService {
  /** Build the starting fleet with a short warm-up history (unscored). */
  seedFleet(): Vehicle[];
  /** Append one fresh reading to each machine's history and return the new map. */
  advance(histories: Record<string, TelemetryReading[]>): Record<string, TelemetryReading[]>;
}

export function createTelemetryService(): TelemetryService {
  let tick = 0; // service-local clock; survives across renders

  return {
    seedFleet() {
      return FLEET_SEED.map((seed) => {
        const history: TelemetryReading[] = [];
        for (let t = 0; t < 10; t++) {
          history.push(nextReading(seed, 0, history[history.length - 1]));
        }
        return {
          id: seed.id,
          name: seed.name,
          type: seed.type,
          history,
          anomalyScore: 0,
          status: "healthy" as const,
          activeAlerts: [],
        };
      });
    },

    advance(histories) {
      tick += 1;
      const out: Record<string, TelemetryReading[]> = {};
      for (const seed of FLEET_SEED) {
        const prev = histories[seed.id] ?? [];
        const reading = nextReading(seed, tick, prev[prev.length - 1]);
        out[seed.id] = [...prev, reading].slice(-HISTORY_LEN);
      }
      return out;
    },
  };
}
