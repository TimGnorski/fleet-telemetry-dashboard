// ---------------------------------------------------------------------------
// components/IncidentAnalysis.tsx
// The AI feature's front end. On click, it POSTs the selected machine's current
// telemetry to our /api/summarize endpoint and renders Claude's assessment.
//
// React ideas worth knowing here:
//   - Async data fetching from an event handler, with explicit loading / error
//     / success states held in useState. Interviewers love asking how you model
//     the three states of an async request — this is the textbook answer.
//   - The request is button-triggered, not automatic, so we don't fire an API
//     call (and a charge) on every 1.5s telemetry tick.
//   - useEffect resets the panel when you switch machines, so you never see one
//     machine's analysis under another's name.
// ---------------------------------------------------------------------------

import { useState, useEffect } from "react";
import type { Vehicle } from "../types";
import { soonestProjection } from "../lib/predict";

interface Props {
  vehicle: Vehicle;
}

type Phase = "idle" | "loading" | "done" | "error";

export function IncidentAnalysis({ vehicle }: Props) {
  const [phase, setPhase] = useState<Phase>("idle");
  const [summary, setSummary] = useState("");
  const [error, setError] = useState("");

  // Reset whenever the selected machine changes.
  useEffect(() => {
    setPhase("idle");
    setSummary("");
    setError("");
  }, [vehicle.id]);

  async function analyze() {
    const latest = vehicle.history[vehicle.history.length - 1];
    const proj = soonestProjection(vehicle.history);

    setPhase("loading");
    setError("");
    try {
      const res = await fetch("/api/summarize", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          name: vehicle.name,
          type: vehicle.type,
          status: vehicle.status,
          anomalyScore: vehicle.anomalyScore,
          alerts: vehicle.activeAlerts,
          readings: {
            engineTempC: latest.engineTempC,
            vibrationG: latest.vibrationG,
            oilPressureKpa: latest.oilPressureKpa,
            fuelPct: latest.fuelPct,
            payloadT: latest.payloadT,
          },
          projection: proj ? { label: proj.label, etaSeconds: proj.etaMs / 1000 } : null,
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`);
      setSummary(data.summary);
      setPhase("done");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
      setPhase("error");
    }
  }

  return (
    <div className="incident">
      <div className="incident__head">
        <span className="incident__title">AI Incident Analysis</span>
        <button
          type="button"
          className="incident__btn"
          onClick={analyze}
          disabled={phase === "loading"}
        >
          {phase === "loading" ? "Analyzing…" : phase === "done" ? "Re-analyze" : "Analyze"}
        </button>
      </div>

      {phase === "idle" && (
        <p className="incident__hint">
          Generate a written assessment of {vehicle.name}'s current condition.
        </p>
      )}
      {phase === "loading" && <p className="incident__hint">Reviewing live telemetry…</p>}
      {phase === "error" && <p className="incident__error">{error}</p>}
      {phase === "done" && (
        <div className="incident__report">
          {summary.split("\n").filter(Boolean).map((line, idx) => (
            <p key={idx}>{line}</p>
          ))}
        </div>
      )}
    </div>
  );
}
