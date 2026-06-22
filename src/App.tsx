// ---------------------------------------------------------------------------
// App.tsx
// The composition root. It owns exactly one piece of UI state — which vehicle
// is selected — and pulls live data from the hook. Everything else is a child
// that receives data as props and reports events back up. Keeping the single
// source of truth here (rather than scattered across children) is what makes
// the data flow easy to reason about.
// ---------------------------------------------------------------------------

import { useState, useMemo } from "react";
import { useFleetTelemetry } from "./hooks/useFleetTelemetry";
import { VehicleCard } from "./components/VehicleCard";
import { VehicleDetail } from "./components/VehicleDetail";
import { AnomalyPanel } from "./components/AnomalyPanel";
import { bySeverity } from "./lib/format";

export default function App() {
  const { vehicles, paused, togglePaused } = useFleetTelemetry();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [sortMode, setSortMode] = useState<"severity" | "name">("severity");

  // Filter by name/type, then sort by the chosen mode. Derived with useMemo so
  // it only recomputes when the inputs actually change.
  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    const filtered = q
      ? vehicles.filter((v) => v.name.toLowerCase().includes(q) || v.type.toLowerCase().includes(q))
      : vehicles;
    const sorted = [...filtered];
    if (sortMode === "name") sorted.sort((a, b) => a.name.localeCompare(b.name));
    else sorted.sort(bySeverity);
    return sorted;
  }, [vehicles, query, sortMode]);

  const selected = vehicles.find((v) => v.id === selectedId) ?? null;

  const fleetStats = useMemo(() => {
    const critical = vehicles.filter((v) => v.status === "critical").length;
    const warning = vehicles.filter((v) => v.status === "warning").length;
    return { total: vehicles.length, critical, warning };
  }, [vehicles]);

  return (
    <div className="app">
      <header className="topbar">
        <div className="topbar__brand">
          <span className="topbar__logo">▰</span>
          <div>
            <div className="topbar__title">MineCore</div>
            <div className="topbar__sub">Fleet Telemetry · Live</div>
          </div>
        </div>

        <div className="topbar__stats">
          <Stat label="Machines" value={fleetStats.total} />
          <Stat label="Watch" value={fleetStats.warning} tone="warning" />
          <Stat label="Critical" value={fleetStats.critical} tone="critical" />
        </div>

        <button type="button" className="topbar__toggle" onClick={togglePaused}>
          <span className={`live-dot ${paused ? "is-paused" : ""}`} />
          {paused ? "Paused" : "Live"}
        </button>
      </header>

      <main className="layout">
        <section className="fleet">
          <div className="fleet__toolbar">
            <input
              type="text"
              className="fleet__search"
              placeholder="Filter by name or type…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
            <div className="fleet__sort">
              <span className="fleet__sort-label">Sort</span>
              <button
                type="button"
                className={`fleet__sort-btn ${sortMode === "severity" ? "is-active" : ""}`}
                onClick={() => setSortMode("severity")}
              >
                Severity
              </button>
              <button
                type="button"
                className={`fleet__sort-btn ${sortMode === "name" ? "is-active" : ""}`}
                onClick={() => setSortMode("name")}
              >
                Name
              </button>
            </div>
          </div>

          {visible.length === 0 ? (
            <div className="fleet__empty">No machines match "{query}".</div>
          ) : (
            <div className="fleet__grid">
              {visible.map((v) => (
                <VehicleCard
                  key={v.id}
                  vehicle={v}
                  selected={v.id === selectedId}
                  onSelect={setSelectedId}
                />
              ))}
            </div>
          )}
          <VehicleDetail vehicle={selected} />
        </section>

        <AnomalyPanel vehicles={vehicles} onSelect={setSelectedId} />
      </main>
    </div>
  );
}

function Stat({ label, value, tone }: { label: string; value: number; tone?: "warning" | "critical" }) {
  const color =
    tone === "critical" ? "var(--status-critical)" : tone === "warning" ? "var(--status-warning)" : undefined;
  return (
    <div className="stat">
      <span className="stat__value" style={color ? { color } : undefined}>
        {value}
      </span>
      <span className="stat__label">{label}</span>
    </div>
  );
}
