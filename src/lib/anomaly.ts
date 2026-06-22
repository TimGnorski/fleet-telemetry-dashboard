// ---------------------------------------------------------------------------
// lib/anomaly.ts
// The "simulated ML scoring" layer. This is the part of the project that maps
// directly onto your signal-processing background, so it's worth understanding
// cold for the interview.
//
// The idea: instead of hard-coding "engine temp > 110 is bad", we learn each
// channel's *normal* behaviour from its own recent history (a rolling mean and
// standard deviation), then score how many standard deviations the latest
// reading sits from that baseline. That deviation is a z-score. We fuse the
// per-channel z-scores into one 0–100 health score per vehicle.
//
// Why this framing wins: it's the same instinct as adaptive filtering — the
// baseline adapts to the signal rather than being a fixed threshold. You can
// honestly say "this is a statistical anomaly detector; the productionized
// version swaps the z-score for a learned model (e.g. an autoencoder
// reconstruction error or an isolation forest), but the scoring interface
// stays identical." That's the senior answer.
// ---------------------------------------------------------------------------

import type { TelemetryReading, SensorBand, HealthStatus } from "../types";
import { REDLINE } from "./predict";

/** Which channels we monitor and how twitchy each one is. */
export const SENSOR_BANDS: Record<keyof Omit<TelemetryReading, "timestamp">, SensorBand> = {
  engineTempC: { warn: 2.0, crit: 3.0, label: "Engine Temp", unit: "°C" },
  vibrationG: { warn: 2.0, crit: 2.8, label: "Vibration", unit: "g" },
  oilPressureKpa: { warn: 2.2, crit: 3.2, label: "Oil Pressure", unit: "kPa" },
  payloadT: { warn: 3.5, crit: 4.5, label: "Payload", unit: "t" }, // expected to swing — high tolerance
  fuelPct: { warn: 6.0, crit: 8.0, label: "Fuel", unit: "%" }, // monotonic drain — basically never "anomalous"
};

/** Mean of a numeric array. */
function mean(xs: number[]): number {
  if (xs.length === 0) return 0;
  return xs.reduce((a, b) => a + b, 0) / xs.length;
}

/** Sample standard deviation, floored so we never divide by ~0 on flat signals. */
function stdDev(xs: number[], mu: number): number {
  if (xs.length < 2) return 1;
  const variance = xs.reduce((a, x) => a + (x - mu) ** 2, 0) / (xs.length - 1);
  return Math.max(Math.sqrt(variance), 1e-6);
}

/**
 * Score one vehicle's latest reading against its own recent history.
 * Returns a 0–100 anomaly score, a derived status, and the channels to blame.
 */
export function scoreVehicle(history: TelemetryReading[]): {
  score: number;
  status: HealthStatus;
  alerts: string[];
} {
  // Need a baseline before we can call anything abnormal.
  if (history.length < 8) {
    return { score: 0, status: "healthy", alerts: [] };
  }

  const latest = history[history.length - 1];
  // Baseline = everything except the point we're judging, so a spike doesn't
  // get to inflate its own "normal".
  const baseline = history.slice(0, -1);

  let worstZ = 0;
  const alerts: string[] = [];

  for (const key of Object.keys(SENSOR_BANDS) as (keyof typeof SENSOR_BANDS)[]) {
    const series = baseline.map((r) => r[key]);
    const mu = mean(series);
    const sigma = stdDev(series, mu);
    const z = Math.abs((latest[key] - mu) / sigma);

    const band = SENSOR_BANDS[key];
    if (z >= band.crit) {
      alerts.push(`${band.label} critical (${latest[key].toFixed(1)}${band.unit})`);
    } else if (z >= band.warn) {
      alerts.push(`${band.label} elevated (${latest[key].toFixed(1)}${band.unit})`);
    }
    worstZ = Math.max(worstZ, z / band.crit); // normalize each channel to its own crit threshold
  }

  // Map the worst normalized deviation onto 0–100. A reading sitting at its
  // critical threshold lands at ~100; comfortably normal sits near 0.
  let score = Math.min(100, Math.round(worstZ * 100));

  // --- Hard operational limits ---------------------------------------------
  // The z-score above is ADAPTIVE: it learns "normal" from recent history. That
  // means a slow drift can hide from it — the rolling baseline creeps upward
  // along with the drift, so each reading still looks normal even as the
  // absolute value sails past a real limit. That's the classic "boiling frog"
  // blind spot of any adaptive detector. To close it, we also score proximity
  // to fixed redlines and take whichever signal is more alarming.
  let breached = false;
  for (const key of Object.keys(REDLINE) as (keyof typeof REDLINE)[]) {
    const rl = REDLINE[key]!;
    const value = latest[key];
    // progress: 0 at the healthy nominal, 1 at the redline.
    const progress =
      rl.dir === "above"
        ? (value - rl.nominal) / (rl.limit - rl.nominal)
        : (rl.nominal - value) / (rl.nominal - rl.limit);

    if (progress <= 0) continue; // sitting at or moving away from the limit

    const rlScore = Math.min(100, Math.round(progress * 100));
    score = Math.max(score, rlScore);

    const over = rl.dir === "above" ? value >= rl.limit : value <= rl.limit;
    if (over) {
      breached = true;
      alerts.unshift(`${rl.label} past redline (${value.toFixed(1)}${rl.unit})`);
    } else if (rlScore >= 70) {
      alerts.push(`${rl.label} approaching redline (${value.toFixed(1)}${rl.unit})`);
    }
  }

  let status: HealthStatus = "healthy";
  if (breached || score >= 100 || alerts.some((a) => a.includes("critical"))) {
    status = "critical";
  } else if (score >= 65 || alerts.length > 0) {
    status = "warning";
  }

  return { score, status, alerts };
}

/**
 * Expose the same mean/σ the detector uses, so the detail charts can draw the
 * "normal envelope" the scoring is judging against. Visualizing this is what
 * turns the anomaly score from invisible math into something you can point at.
 */
export function channelStats(
  readings: TelemetryReading[],
  key: keyof Omit<TelemetryReading, "timestamp">
): { mean: number; sigma: number } {
  const xs = readings.map((r) => r[key]);
  const mu = mean(xs);
  return { mean: mu, sigma: stdDev(xs, mu) };
}

/** Tailwind-friendly color tokens per status, used all over the UI. */
export const STATUS_COLOR: Record<HealthStatus, string> = {
  healthy: "var(--status-healthy)",
  warning: "var(--status-warning)",
  critical: "var(--status-critical)",
  offline: "var(--text-muted)",
};
