// ---------------------------------------------------------------------------
// components/StatusPill.tsx
// The smallest "real" component: it takes one prop and renders a colored badge.
// Good example of the React mental model — a component is just a function that
// takes props (its inputs) and returns JSX (what to draw).
// ---------------------------------------------------------------------------

import type { HealthStatus } from "../types";
import { STATUS_COLOR } from "../lib/anomaly";
import { STATUS_LABEL } from "../lib/format";

interface Props {
  status: HealthStatus;
  pulse?: boolean; // critical pills pulse to pull the eye
}

export function StatusPill({ status, pulse }: Props) {
  const color = STATUS_COLOR[status];
  return (
    <span className="status-pill" style={{ color, borderColor: color }}>
      <span className={`status-dot ${pulse && status === "critical" ? "is-pulsing" : ""}`} style={{ background: color }} />
      {STATUS_LABEL[status]}
    </span>
  );
}
