// ---------------------------------------------------------------------------
// components/VehicleDetail.tsx
// The drill-down view. Now annotated: each chart shows the adaptive "normal
// envelope" (mean ± σ) as a shaded band and the hard operational limit as a
// dashed redline, plus a header readout projecting time-to-failure.
//
// New React/Recharts ideas here:
//   - ReferenceArea / ReferenceLine: declarative chart annotations. You don't
//     draw them imperatively; you describe them and Recharts renders them.
//   - We compute an explicit Y-axis domain so the band and redline are always
//     in frame, instead of letting the axis auto-fit to just the data.
//   - All of this is derived data inside useMemo — recomputed only when the
//     vehicle's history changes, not on every unrelated re-render.
// ---------------------------------------------------------------------------

import { useMemo } from "react";
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  ReferenceArea,
  ReferenceLine,
} from "recharts";
import type { Vehicle, TelemetryReading } from "../types";
import { STATUS_COLOR, channelStats } from "../lib/anomaly";
import { REDLINE, soonestProjection, formatEta } from "../lib/predict";
import { timeLabel } from "../lib/format";
import { StatusPill } from "./StatusPill";
import { IncidentAnalysis } from "./IncidentAnalysis";

interface Props {
  vehicle: Vehicle | null;
}

type Channel = keyof Omit<TelemetryReading, "timestamp">;

const CHANNELS: { key: Channel; label: string; unit: string }[] = [
  { key: "engineTempC", label: "Engine Temperature", unit: "°C" },
  { key: "vibrationG", label: "Vibration", unit: "g" },
  { key: "oilPressureKpa", label: "Oil Pressure", unit: "kPa" },
];

export function VehicleDetail({ vehicle }: Props) {
  // Build everything each chart needs: points, the σ-band bounds, the redline,
  // and a padded Y-domain that keeps all of them visible.
  const charts = useMemo(() => {
    const history = vehicle?.history ?? [];
    return CHANNELS.map((ch) => {
      const { mean, sigma } = channelStats(history, ch.key);
      const bandLo = mean - 2 * sigma; // the "normal" envelope the detector judges against
      const bandHi = mean + 2 * sigma;
      const redline = REDLINE[ch.key]?.limit;

      const data = history.map((r) => ({ t: timeLabel(r.timestamp), v: r[ch.key] }));
      const values = data.map((d) => d.v);
      const lo = Math.min(...values, bandLo, redline ?? Infinity);
      const hi = Math.max(...values, bandHi, redline ?? -Infinity);
      const pad = Math.max((hi - lo) * 0.12, 0.5);

      return { ...ch, data, bandLo, bandHi, redline, domain: [lo - pad, hi + pad] as [number, number] };
    });
  }, [vehicle?.history]);

  const projection = useMemo(
    () => (vehicle ? soonestProjection(vehicle.history) : null),
    [vehicle?.history] // eslint-disable-line react-hooks/exhaustive-deps
  );

  if (!vehicle) {
    return (
      <div className="detail detail--empty">
        <p>Select a machine to inspect its live telemetry.</p>
      </div>
    );
  }

  const color = STATUS_COLOR[vehicle.status];

  return (
    <div className="detail">
      <div className="detail__head">
        <div>
          <div className="detail__name">{vehicle.name}</div>
          <div className="detail__type">{vehicle.type}</div>
        </div>

        {projection && (
          <div className="detail__forecast">
            <span className="detail__forecast-eta">{formatEta(projection.etaMs)}</span>
            <span className="detail__forecast-label">
              to {projection.label} redline
            </span>
          </div>
        )}

        <div className="detail__score" style={{ color }}>
          <span className="detail__score-num">{vehicle.anomalyScore}</span>
          <span className="detail__score-label">anomaly score</span>
        </div>
        <StatusPill status={vehicle.status} pulse />
      </div>

      <div className="detail__charts">
        {charts.map((ch) => (
          <div key={ch.key} className="detail__chart">
            <div className="detail__chart-label">
              {ch.label} <span className="detail__chart-unit">{ch.unit}</span>
              <span className="detail__chart-legend">normal envelope · redline</span>
            </div>
            <ResponsiveContainer width="100%" height={150}>
              <AreaChart data={ch.data} margin={{ top: 4, right: 10, bottom: 0, left: -2 }}>
                <defs>
                  <linearGradient id={`fill-${ch.key}`} x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={color} stopOpacity={0.35} />
                    <stop offset="100%" stopColor={color} stopOpacity={0} />
                  </linearGradient>
                </defs>

                {/* The adaptive normal envelope (mean ± 2σ) the detector scores against. */}
                <ReferenceArea
                  y1={ch.bandLo}
                  y2={ch.bandHi}
                  fill="var(--text-muted)"
                  fillOpacity={0.1}
                  stroke="var(--border)"
                  strokeOpacity={0.4}
                />

                {/* The hard operational limit the projection counts down to. */}
                {ch.redline !== undefined && (
                  <ReferenceLine
                    y={ch.redline}
                    stroke="var(--status-critical)"
                    strokeDasharray="4 4"
                    strokeOpacity={0.7}
                    label={{
                      value: `redline ${ch.redline}${ch.unit}`,
                      position: "insideTopRight",
                      fill: "var(--status-critical)",
                      fontSize: 9,
                    }}
                  />
                )}

                <CartesianGrid stroke="var(--border)" strokeDasharray="2 4" vertical={false} />
                <XAxis dataKey="t" tick={{ fill: "var(--text-muted)", fontSize: 10 }} minTickGap={28} />
                <YAxis
                  tick={{ fill: "var(--text-muted)", fontSize: 10 }}
                  domain={ch.domain}
                  width={50}
                  tickFormatter={(v: number) => (Math.abs(v) < 10 ? v.toFixed(1) : String(Math.round(v)))}
                />
                <Tooltip
                  contentStyle={{
                    background: "var(--surface-2)",
                    border: "1px solid var(--border)",
                    borderRadius: 8,
                    fontSize: 12,
                  }}
                  labelStyle={{ color: "var(--text-muted)" }}
                  formatter={(v: number) => [v.toFixed(2), ch.label]}
                />
                <Area
                  type="monotone"
                  dataKey="v"
                  stroke={color}
                  strokeWidth={2}
                  fill={`url(#fill-${ch.key})`}
                  isAnimationActive={false}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        ))}
      </div>

      <IncidentAnalysis vehicle={vehicle} />
    </div>
  );
}
