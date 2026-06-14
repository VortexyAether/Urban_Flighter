import './EnergyGraph.css';

export type EnergyGraphScale = 'absolute' | 'focus' | 'zoom';

interface EnergyGraphProps {
  history: number[];
  scale?: EnergyGraphScale;
  adjustable?: boolean;
  onScaleChange?: (scale: EnergyGraphScale) => void;
}

const SCALE_OPTIONS: Array<{ label: string; value: EnergyGraphScale }> = [
  { label: 'ABS', value: 'absolute' },
  { label: 'FOCUS', value: 'focus' },
  { label: 'ZOOM', value: 'zoom' },
];

function resolveDomain(history: number[], scale: EnergyGraphScale) {
  const finite = history.filter((value) => Number.isFinite(value));
  if (scale === 'absolute' || finite.length === 0) {
    return { min: 0, max: Math.max(40, ...finite) };
  }

  const active = finite.filter((value) => value > 0.05);
  const values = active.length ? active : finite;
  const rawMin = Math.min(...values);
  const rawMax = Math.max(...values);
  const rawSpan = Math.max(0.01, rawMax - rawMin);
  const minimumSpan = scale === 'zoom' ? 1.8 : 5.5;
  const span = Math.max(minimumSpan, rawSpan * (scale === 'zoom' ? 1.45 : 2.4));
  const center = (rawMin + rawMax) * 0.5;
  const min = Math.max(0, center - span * 0.5);
  const max = Math.max(min + minimumSpan, center + span * 0.5);
  return { min, max };
}

export default function EnergyGraph({
  history,
  scale = 'absolute',
  adjustable = false,
  onScaleChange,
}: EnergyGraphProps) {
  const domain = resolveDomain(history, scale);
  const span = Math.max(0.01, domain.max - domain.min);
  const points = history.map((value, index) => {
    const x = (index / Math.max(1, history.length - 1)) * 240;
    const normalized = Math.max(0, Math.min(1, (value - domain.min) / span));
    const y = 88 - normalized * 72;
    return `${x},${y}`;
  }).join(' ');
  const current = history.at(-1) ?? 0;
  const scaleLabel = scale === 'absolute' ? `0-${domain.max.toFixed(0)}` : `${domain.min.toFixed(1)}-${domain.max.toFixed(1)}`;

  return (
    <div className="energy-graph">
      <div className="energy-graph__header">
        <div>
          <span>Energy Over Time</span>
          <small>{scaleLabel} u/s</small>
        </div>
        <strong>{current.toFixed(1)} u/s</strong>
      </div>
      {adjustable && (
        <div className="energy-graph__scale" aria-label="Energy graph scale">
          {SCALE_OPTIONS.map((option) => (
            <button
              key={option.value}
              type="button"
              className={scale === option.value ? 'active' : ''}
              onClick={() => onScaleChange?.(option.value)}
            >
              {option.label}
            </button>
          ))}
        </div>
      )}
      <svg viewBox="0 0 240 96" className="energy-graph__svg" preserveAspectRatio="none">
        <defs>
          <linearGradient id="energy-fill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="rgba(34, 184, 255, 0.38)" />
            <stop offset="100%" stopColor="rgba(255, 138, 42, 0.03)" />
          </linearGradient>
        </defs>
        <line x1="0" y1="16" x2="240" y2="16" stroke="rgba(17,20,23,0.1)" />
        <line x1="0" y1="52" x2="240" y2="52" stroke="rgba(17,20,23,0.08)" />
        <line x1="0" y1="88" x2="240" y2="88" stroke="rgba(17,20,23,0.1)" />
        <polyline fill="url(#energy-fill)" points={`0,96 ${points} 240,96`} />
        <polyline fill="none" stroke="#ff8a2a" strokeWidth="2.5" points={points} />
      </svg>
    </div>
  );
}
