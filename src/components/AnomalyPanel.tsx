// ---------------------------------------------------------------------------
// components/AnomalyPanel.tsx
// The alerts rail. Flattens every vehicle's active alerts into one severity-
// sorted feed — the thing a control-room operator actually watches. Derived
// entirely from props with useMemo; it holds no state of its own.
// ---------------------------------------------------------------------------

import { useMemo } from "react";
import type { Vehicle } from "../types";
import { STATUS_COLOR } from "../lib/anomaly";

interface Props {
  vehicles: Vehicle[];
  onSelect: (id: string) => void;
}

export function AnomalyPanel({ vehicles, onSelect }: Props) {
  const alerts = useMemo(() => {
    return vehicles
      .filter((v) => v.activeAlerts.length > 0)
      .flatMap((v) =>
        v.activeAlerts.map((text) => ({
          id: `${v.id}-${text}`,
          vehicleId: v.id,
          vehicleName: v.name,
          status: v.status,
          text,
        }))
      )
      .sort((a, b) => (a.status === "critical" ? -1 : 1) - (b.status === "critical" ? -1 : 1));
  }, [vehicles]);

  return (
    <aside className="alerts">
      <div className="alerts__head">
        <span>Active Alerts</span>
        <span className="alerts__count">{alerts.length}</span>
      </div>
      {alerts.length === 0 ? (
        <div className="alerts__empty">All machines nominal.</div>
      ) : (
        <ul className="alerts__list">
          {alerts.map((a) => (
            <li key={a.id}>
              <button type="button" className="alert-row" onClick={() => onSelect(a.vehicleId)}>
                <span className="alert-row__bar" style={{ background: STATUS_COLOR[a.status] }} />
                <span className="alert-row__body">
                  <span className="alert-row__vehicle">{a.vehicleName}</span>
                  <span className="alert-row__text">{a.text}</span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </aside>
  );
}
