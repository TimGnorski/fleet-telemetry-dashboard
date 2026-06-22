// ---------------------------------------------------------------------------
// lib/format.ts
// Tiny pure helpers. Kept separate so components stay about layout, not string
// fiddling, and so this logic is trivially testable in isolation.
// ---------------------------------------------------------------------------

import type { HealthStatus } from "../types";

export function timeLabel(ts: number): string {
  return new Date(ts).toLocaleTimeString([], { minute: "2-digit", second: "2-digit" });
}

export const STATUS_LABEL: Record<HealthStatus, string> = {
  healthy: "Healthy",
  warning: "Watch",
  critical: "Critical",
  offline: "Offline",
};

/** Sort worst-first so the control room sees problems at the top. */
const STATUS_RANK: Record<HealthStatus, number> = {
  critical: 0,
  warning: 1,
  healthy: 2,
  offline: 3,
};

export function bySeverity<T extends { status: HealthStatus; anomalyScore: number }>(a: T, b: T): number {
  if (STATUS_RANK[a.status] !== STATUS_RANK[b.status]) {
    return STATUS_RANK[a.status] - STATUS_RANK[b.status];
  }
  return b.anomalyScore - a.anomalyScore;
}
