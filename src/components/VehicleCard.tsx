// ---------------------------------------------------------------------------
// components/VehicleCard.tsx
// One tile in the fleet grid. Shows the machine's current vitals, its anomaly
// score, and a tiny live sparkline of engine temp. Clicking it selects the
// vehicle (the parent owns selection; this card just reports the click up via
// an onSelect prop — "data down, events up", the core React data-flow pattern).
// ---------------------------------------------------------------------------

import { ResponsiveContainer, LineChart, Line, YAxis } from "recharts";
import type { Vehicle } from "../types";
import { STATUS_COLOR } from "../lib/anomaly";
import { soonestProjection, formatEta } from "../lib/predict";
import { StatusPill } from "./StatusPill";

interface Props {
  vehicle: Vehicle;
  selected: boolean;
  onSelect: (id: string) => void;
}

export function VehicleCard({ vehicle, selected, onSelect }: Props) {
  const latest = vehicle.history[vehicle.history.length - 1];
  const color = STATUS_COLOR[vehicle.status];
  const forecast = soonestProjection(vehicle.history);

  return (
    <button
      type="button"
      onClick={() => onSelect(vehicle.id)}
      className={`vehicle-card ${selected ? "is-selected" : ""}`}
      style={{ borderColor: selected ? color : undefined }}
    >
      <div className="vehicle-card__head">
        <div>
          <div className="vehicle-card__name">{vehicle.name}</div>
          <div className="vehicle-card__type">{vehicle.type}</div>
        </div>
        <StatusPill status={vehicle.status} pulse />
      </div>

      <div className="vehicle-card__spark">
        <ResponsiveContainer width="100%" height={40}>
          <LineChart data={vehicle.history}>
            <YAxis hide domain={["dataMin - 4", "dataMax + 4"]} />
            <Line
              type="monotone"
              dataKey="engineTempC"
              stroke={color}
              strokeWidth={1.75}
              dot={false}
              isAnimationActive={false}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>

      <div className="vehicle-card__metrics">
        <Metric label="Temp" value={`${latest.engineTempC.toFixed(0)}°`} />
        <Metric label="Fuel" value={`${latest.fuelPct.toFixed(0)}%`} />
        <Metric label="Vibration" value={latest.vibrationG.toFixed(2)} />
        <Metric label="Score" value={`${vehicle.anomalyScore}`} accent={color} />
      </div>

      {forecast && (
        <div className="vehicle-card__forecast">
          <span className="vehicle-card__forecast-dot" />
          {forecast.label} redline in {formatEta(forecast.etaMs)}
        </div>
      )}
    </button>
  );
}

function Metric({ label, value, accent }: { label: string; value: string; accent?: string }) {
  return (
    <div className="metric">
      <span className="metric__label">{label}</span>
      <span className="metric__value" style={accent ? { color: accent } : undefined}>
        {value}
      </span>
    </div>
  );
}
