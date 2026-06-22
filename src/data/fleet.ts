// ---------------------------------------------------------------------------
// data/fleet.ts
// The starting roster, plus the "physics" each machine simulates around.
// Separating the *data* from the *engine that animates it* (the hook) keeps
// the simulation logic generic — swap this file for a real API later and the
// rest of the app doesn't change.
// ---------------------------------------------------------------------------

import type { VehicleType, TelemetryReading } from "../types";

export interface VehicleSeed {
  id: string;
  name: string;
  type: VehicleType;
  /** The center each channel wanders around under normal operation. */
  baseline: Omit<TelemetryReading, "timestamp">;
  /**
   * A scripted fault that ramps in over time, so the demo always has at least
   * one machine drifting into trouble. null = a healthy control.
   */
  fault: { channel: keyof Omit<TelemetryReading, "timestamp">; rampPerTick: number } | null;
}

export const FLEET_SEED: VehicleSeed[] = [
  {
    id: "ht-204",
    name: "HT-204",
    type: "Haul Truck",
    baseline: { engineTempC: 88, fuelPct: 72, payloadT: 220, oilPressureKpa: 320, vibrationG: 0.6 },
    fault: { channel: "engineTempC", rampPerTick: 0.9 }, // slow overheat — the headline failure
  },
  {
    id: "ex-011",
    name: "EX-011",
    type: "Excavator",
    baseline: { engineTempC: 82, fuelPct: 64, payloadT: 0, oilPressureKpa: 300, vibrationG: 0.9 },
    fault: { channel: "vibrationG", rampPerTick: 0.012 }, // bearing wear creeping up
  },
  {
    id: "wl-330",
    name: "WL-330",
    type: "Wheel Loader",
    baseline: { engineTempC: 85, fuelPct: 55, payloadT: 18, oilPressureKpa: 310, vibrationG: 0.7 },
    fault: null,
  },
  {
    id: "ht-207",
    name: "HT-207",
    type: "Haul Truck",
    baseline: { engineTempC: 90, fuelPct: 41, payloadT: 215, oilPressureKpa: 315, vibrationG: 0.65 },
    fault: null,
  },
  {
    id: "dz-052",
    name: "DZ-052",
    type: "Dozer",
    baseline: { engineTempC: 86, fuelPct: 78, payloadT: 0, oilPressureKpa: 305, vibrationG: 0.8 },
    fault: { channel: "oilPressureKpa", rampPerTick: -1.6 }, // pressure bleeding off
  },
  {
    id: "wt-009",
    name: "WT-009",
    type: "Water Truck",
    baseline: { engineTempC: 80, fuelPct: 60, payloadT: 95, oilPressureKpa: 318, vibrationG: 0.55 },
    fault: null,
  },
];
