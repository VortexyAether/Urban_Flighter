import './EnergyGraph.css';

interface EnergyGraphProps {
  history: number[];
}

export default function EnergyGraph({ history }: EnergyGraphProps) {
  const maxValue = Math.max(40, ...history);
  const points = history.map((value, index) => {
    const x = (index / Math.max(1, history.length - 1)) * 240;
    const y = 96 - (value / maxValue) * 80;
    return `${x},${y}`;
  }).join(' ');

  return (
    <div className="energy-graph">
      <div className="energy-graph__header">
        <span>Energy Over Time</span>
        <strong>{history.at(-1)?.toFixed(1) ?? '0.0'} u/s</strong>
      </div>
      <svg viewBox="0 0 240 96" className="energy-graph__svg" preserveAspectRatio="none">
        <defs>
          <linearGradient id="energy-fill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="rgba(255, 204, 107, 0.7)" />
            <stop offset="100%" stopColor="rgba(255, 204, 107, 0.02)" />
          </linearGradient>
        </defs>
        <line x1="0" y1="16" x2="240" y2="16" stroke="rgba(255,255,255,0.08)" />
        <line x1="0" y1="56" x2="240" y2="56" stroke="rgba(255,255,255,0.06)" />
        <polyline fill="url(#energy-fill)" points={`0,96 ${points} 240,96`} />
        <polyline fill="none" stroke="#ffcc6b" strokeWidth="2.5" points={points} />
      </svg>
    </div>
  );
}
