// ---------------------------------------------------------------------------
// types.ts
// The shared vocabulary of the whole app. Defining the data model in one place
// first — before any UI — is what keeps the rest of the code honest. Every
// component below is just a different view onto these shapes.
// ---------------------------------------------------------------------------

/** The kinds of equipment a surface mine actually runs. */
export type VehicleType = "Haul Truck" | "Excavator" | "Wheel Loader" | "Dozer" | "Water Truck";

/** A vehicle's health verdict. Order matters: worse states sort first. */
export type HealthStatus = "critical" | "warning" | "healthy" | "offline";

/** The live sensor channels we stream for each machine. */
export interface TelemetryReading {
  timestamp: number; // epoch ms — x-axis for every chart
  engineTempC: number; // °C   — overheats are the classic haul-truck failure
  fuelPct: number; // %     — drains over a shift, refuels in steps
  payloadT: number; // tonnes — swings as the truck loads / dumps
  oilPressureKpa: number; // kPa
  vibrationG: number; // g     — the early-warning signal for mechanical wear
}

/** One machine in the fleet, plus its rolling history and computed health. */
export interface Vehicle {
  id: string;
  name: string; // operator-facing label, e.g. "HT-204"
  type: VehicleType;
  /** Most recent first is annoying to chart, so history is oldest-first. */
  history: TelemetryReading[];
  /** 0–100. Higher = more anomalous. Computed, never streamed. */
  anomalyScore: number;
  status: HealthStatus;
  /** Human-readable reasons the score is high, for the alerts panel. */
  activeAlerts: string[];
}

/** Safe operating envelope for one sensor channel. */
export interface SensorBand {
  warn: number; // deviation (in std-devs) that trips a warning
  crit: number; // deviation that trips a critical alert
  label: string; // how this channel reads in the UI
  unit: string;
}
