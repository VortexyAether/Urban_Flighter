import { useMemo, useState } from 'react';
import type { FlowField2DResponse } from '../api';
import type { Telemetry } from './TopDownGame';

interface MissionIntelligenceProps {
  flow: FlowField2DResponse | null;
  telemetry: Telemetry;
  energyHistory: number[];
  viewMode: '2d' | '3d';
}

interface Insight {
  label: string;
  tone: 'good' | 'warn' | 'alert';
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function angularDeltaDeg(a: number, b: number) {
  return ((((a - b) % 360) + 540) % 360) - 180;
}

function formatMinutes(seconds: number) {
  if (!Number.isFinite(seconds) || seconds <= 0) return '0.0 min';
  return `${(seconds / 60).toFixed(1)} min`;
}

function classifyRisk(score: number) {
  if (score >= 72) return { label: 'HIGH', tone: 'alert' as const };
  if (score >= 44) return { label: 'WATCH', tone: 'warn' as const };
  return { label: 'CLEAR', tone: 'good' as const };
}

function buildInsights(
  flow: FlowField2DResponse | null,
  assistMps: number,
  crosswindMps: number,
  enduranceSeconds: number,
  densityPerHa: number,
): Insight[] {
  if (!flow) {
    return [{ label: 'Load a district to initialize drag envelope.', tone: 'warn' }];
  }

  const insights: Insight[] = [];

  if (assistMps < -2) {
    insights.push({ label: 'Headwind load is elevated; turn with inlet flow to reduce burn.', tone: 'alert' });
  } else if (assistMps > 2) {
    insights.push({ label: 'Tailwind assist available; maintain corridor alignment.', tone: 'good' });
  } else {
    insights.push({ label: 'Wind assist is neutral; conserve energy through steady inputs.', tone: 'warn' });
  }

  if (crosswindMps > 4) {
    insights.push({ label: 'Crosswind drift is material; widen turns around building wakes.', tone: 'warn' });
  }

  if (densityPerHa > 3.2) {
    insights.push({ label: 'Urban occlusion is dense; expect local drag spikes near facades.', tone: 'warn' });
  } else {
    insights.push({ label: 'Building density is workable for low-altitude route testing.', tone: 'good' });
  }

  if (enduranceSeconds < 75) {
    insights.push({ label: 'Reserve window is tight; reduce thrust or reset mission budget.', tone: 'alert' });
  }

  return insights.slice(0, 4);
}

export default function MissionIntelligence({
  flow,
  telemetry,
  energyHistory,
  viewMode,
}: MissionIntelligenceProps) {
  const [batteryBudget, setBatteryBudget] = useState(2800);
  const [reservePct, setReservePct] = useState(18);
  const [payloadKg, setPayloadKg] = useState(1.6);
  const [altitudeBand, setAltitudeBand] = useState(80);

  const model = useMemo(() => {
    const recent = energyHistory.slice(-36).filter(Number.isFinite);
    const meanBurn = recent.length
      ? recent.reduce((sum, value) => sum + value, 0) / recent.length
      : telemetry.energyRate;
    const payloadFactor = 1 + payloadKg * 0.055;
    const altitudeFactor = viewMode === '3d' ? 1 - clamp((altitudeBand - 60) / 500, -0.08, 0.14) : 1;
    const adjustedBurn = Math.max(4, meanBurn || telemetry.energyRate || 10) * payloadFactor * altitudeFactor;
    const usableBudget = Math.max(0, batteryBudget * (1 - reservePct / 100) - telemetry.energyUsed);
    const enduranceSeconds = usableBudget / adjustedBurn;
    const planningSpeed = Math.max(telemetry.droneSpeed, viewMode === '3d' ? 18 : 12);
    const projectedRangeKm = (planningSpeed * enduranceSeconds) / 1000;

    const windDelta = angularDeltaDeg(telemetry.headingDeg, telemetry.localWindDirDeg);
    const deltaRad = (windDelta * Math.PI) / 180;
    const assistMps = Math.cos(deltaRad) * telemetry.localWindSpeed;
    const crosswindMps = Math.abs(Math.sin(deltaRad) * telemetry.localWindSpeed);

    const radius = flow?.domain.geometry_radius_m ?? 400;
    const areaHa = Math.max(1, (Math.PI * radius * radius) / 10000);
    const densityPerHa = (flow?.buildings.length ?? 0) / areaHa;
    const dragLoad = clamp((adjustedBurn / 95) * 100, 0, 100);
    const windLoad = clamp((Math.max(0, -assistMps) * 11) + crosswindMps * 5, 0, 100);
    const densityLoad = clamp((densityPerHa / 5.5) * 100, 0, 100);
    const reserveLoad = clamp(100 - (enduranceSeconds / 240) * 100, 0, 100);
    const riskScore = clamp(dragLoad * 0.36 + windLoad * 0.24 + densityLoad * 0.22 + reserveLoad * 0.18, 0, 100);
    const risk = classifyRisk(riskScore);

    return {
      adjustedBurn,
      assistMps,
      crosswindMps,
      densityPerHa,
      dragLoad,
      enduranceSeconds,
      projectedRangeKm,
      reserveLoad,
      risk,
      riskScore,
      windLoad,
    };
  }, [altitudeBand, batteryBudget, energyHistory, flow, payloadKg, reservePct, telemetry, viewMode]);

  const insights = useMemo(
    () => buildInsights(flow, model.assistMps, model.crosswindMps, model.enduranceSeconds, model.densityPerHa),
    [flow, model.assistMps, model.crosswindMps, model.densityPerHa, model.enduranceSeconds],
  );

  const couplingLabel = model.assistMps > 1.5 ? 'ASSIST' : model.assistMps < -1.5 ? 'HEADWIND' : 'CROSS';

  return (
    <section className="intel-stack" aria-label="Mission intelligence">
      <div className="section-header">
        <span>Mission Intelligence</span>
        <strong className={`state-chip ${model.risk.tone}`}>{model.risk.label}</strong>
      </div>

      <div className="mission-readouts">
        <div>
          <span>Endurance</span>
          <strong>{formatMinutes(model.enduranceSeconds)}</strong>
        </div>
        <div>
          <span>Range</span>
          <strong>{model.projectedRangeKm.toFixed(2)} km</strong>
        </div>
        <div>
          <span>Coupling</span>
          <strong>{couplingLabel}</strong>
        </div>
      </div>

      <div className="risk-bars">
        <div className="risk-row">
          <span>Drag Load</span>
          <meter min="0" max="100" value={model.dragLoad} />
          <strong>{model.adjustedBurn.toFixed(1)}</strong>
        </div>
        <div className="risk-row">
          <span>Wind Load</span>
          <meter min="0" max="100" value={model.windLoad} />
          <strong>{Math.round(model.windLoad)}%</strong>
        </div>
        <div className="risk-row">
          <span>Reserve</span>
          <meter min="0" max="100" value={model.reserveLoad} />
          <strong>{Math.round(100 - model.reserveLoad)}%</strong>
        </div>
      </div>

      <div className="planner-controls">
        <label>
          <span>Battery</span>
          <input
            type="range"
            min="800"
            max="6000"
            step="100"
            value={batteryBudget}
            onChange={(event) => setBatteryBudget(Number(event.target.value))}
          />
          <strong>{batteryBudget} u</strong>
        </label>
        <label>
          <span>Reserve</span>
          <input
            type="range"
            min="5"
            max="35"
            step="1"
            value={reservePct}
            onChange={(event) => setReservePct(Number(event.target.value))}
          />
          <strong>{reservePct}%</strong>
        </label>
        <label>
          <span>Payload</span>
          <input
            type="range"
            min="0"
            max="8"
            step="0.1"
            value={payloadKg}
            onChange={(event) => setPayloadKg(Number(event.target.value))}
          />
          <strong>{payloadKg.toFixed(1)} kg</strong>
        </label>
        <label>
          <span>Alt Band</span>
          <input
            type="range"
            min="20"
            max="180"
            step="5"
            value={altitudeBand}
            onChange={(event) => setAltitudeBand(Number(event.target.value))}
          />
          <strong>{altitudeBand} m</strong>
        </label>
      </div>

      <div className="insight-list">
        {insights.map((insight) => (
          <div className={`insight ${insight.tone}`} key={insight.label}>
            <span />
            <p>{insight.label}</p>
          </div>
        ))}
      </div>
    </section>
  );
}
