// ---------------------------------------------------------------------------
// lib/predict.ts
// Predictive maintenance: fit a line to each channel's recent trend and project
// when it will cross a hard operational limit ("redline"). This is what mining
// fleet software is actually for — catching the failure before the machine dies
// on a haul road.
//
// The fit is ordinary least squares: the slope that minimizes squared error
// between the line and the recent samples. Same family of math as the adaptive
// filtering you do in the lab — here we just want the trend, not a live filter.
// ---------------------------------------------------------------------------

import type { TelemetryReading } from "../types";

type Channel = keyof Omit<TelemetryReading, "timestamp">;

/** A fixed operational limit per channel, with the direction that's dangerous. */
interface Redline {
  limit: number;
  dir: "above" | "below";
  nominal: number; // the healthy center, used as the 0% point for proximity scoring
  label: string;
  unit: string;
}

export const REDLINE: Partial<Record<Channel, Redline>> = {
  engineTempC: { limit: 120, dir: "above", nominal: 88, label: "Engine Temp", unit: "°C" },
  vibrationG: { limit: 1.6, dir: "above", nominal: 0.9, label: "Vibration", unit: "g" },
  oilPressureKpa: { limit: 255, dir: "below", nominal: 305, label: "Oil Pressure", unit: "kPa" },
};

const WINDOW = 12; // fit the trend over the last ~18s of data
const HORIZON_MS = 30 * 60_000; // ignore projections further out than 30 min — that's "stable"

/** Ordinary least-squares fit. Returns slope (units per ms) and intercept. */
export function linearTrend(points: { x: number; y: number }[]): { slope: number; intercept: number } {
  const n = points.length;
  if (n < 2) return { slope: 0, intercept: points[0]?.y ?? 0 };

  const meanX = points.reduce((a, p) => a + p.x, 0) / n;
  const meanY = points.reduce((a, p) => a + p.y, 0) / n;

  let num = 0;
  let den = 0;
  for (const p of points) {
    num += (p.x - meanX) * (p.y - meanY);
    den += (p.x - meanX) ** 2;
  }
  const slope = den === 0 ? 0 : num / den;
  return { slope, intercept: meanY - slope * meanX };
}

export interface Projection {
  channel: Channel;
  label: string;
  unit: string;
  etaMs: number;
  limit: number;
  dir: "above" | "below";
}

/** Project one channel's time-to-redline, or null if it isn't trending toward it. */
export function projectChannel(history: TelemetryReading[], channel: Channel): Projection | null {
  const rl = REDLINE[channel];
  if (!rl || history.length < 5) return null;

  const recent = history.slice(-WINDOW);
  const t0 = recent[0].timestamp;
  const pts = recent.map((r) => ({ x: r.timestamp - t0, y: r[channel] }));
  const { slope } = linearTrend(pts);

  const current = recent[recent.length - 1][channel];
  const movingToward = rl.dir === "above" ? slope > 0 : slope < 0;
  if (!movingToward || Math.abs(slope) < 1e-7) return null; // flat or improving → no alarm

  const distance = rl.dir === "above" ? rl.limit - current : current - rl.limit;
  const etaMs = distance <= 0 ? 0 : distance / Math.abs(slope);
  if (etaMs > HORIZON_MS) return null; // too far out to care

  return { channel, label: rl.label, unit: rl.unit, etaMs, limit: rl.limit, dir: rl.dir };
}

/** The single most-urgent projection across all monitored channels. */
export function soonestProjection(history: TelemetryReading[]): Projection | null {
  let best: Projection | null = null;
  for (const c of Object.keys(REDLINE) as Channel[]) {
    const p = projectChannel(history, c);
    if (p && (best === null || p.etaMs < best.etaMs)) best = p;
  }
  return best;
}

export function formatEta(ms: number): string {
  if (ms <= 0) return "now";
  const min = ms / 60_000;
  if (min < 1) return `${Math.round(ms / 1000)}s`;
  if (min < 60) return `${Math.round(min)} min`;
  return `${(min / 60).toFixed(1)} h`;
}
