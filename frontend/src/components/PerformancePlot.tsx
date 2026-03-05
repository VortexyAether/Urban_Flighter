import React, { useState, useEffect, useRef } from 'react';
import './PerformancePlot.css';

interface PerformancePlotProps {
    consumption: number;
    speed: number;
}

const PerformancePlot: React.FC<PerformancePlotProps> = ({ consumption, speed }) => {
    const [history, setHistory] = useState<{ c: number, s: number }[]>(
        new Array(400).fill({ c: 0, s: 0 })
    );
    const lastUpdate = useRef(0);

    useEffect(() => {
        const now = Date.now();
        // Update only every 100ms to allow a much longer history view (40 seconds total)
        if (now - lastUpdate.current > 100) {
            setHistory(prev => {
                const newHistory = [...prev.slice(1), { c: consumption, s: speed }];
                return newHistory;
            });
            lastUpdate.current = now;
        }
    }, [consumption, speed]);

    // Scaling helpers
    const maxC = Math.max(...history.map(h => h.c), 50);
    const maxS = Math.max(...history.map(h => h.s), 60);

    const pointsC = history.map((val, i) => {
        const x = (i / (history.length - 1)) * 200;
        const y = 80 - (val.c / maxC) * 70;
        return `${x},${y}`;
    }).join(' ');

    const pointsS = history.map((val, i) => {
        const x = (i / (history.length - 1)) * 200;
        const y = 80 - (val.s / maxS) * 70;
        return `${x},${y}`;
    }).join(' ');

    return (
        <div className="performance-plot">
            <div className="plot-legend">
                <span className="legend-item golden">⚡ ENERGY</span>
                <span className="legend-item cyan">💨 SPEED</span>
            </div>
            <svg viewBox="0 0 200 80" className="perf-svg" preserveAspectRatio="none">
                <defs>
                    <linearGradient id="gradC" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#d4af37" stopOpacity="0.4" />
                        <stop offset="100%" stopColor="#d4af37" stopOpacity="0" />
                    </linearGradient>
                    <linearGradient id="gradS" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#449eff" stopOpacity="0.3" />
                        <stop offset="100%" stopColor="#449eff" stopOpacity="0" />
                    </linearGradient>
                </defs>

                {/* Grid */}
                <line x1="0" y1="10" x2="200" y2="10" stroke="rgba(255,255,255,0.05)" />
                <line x1="0" y1="45" x2="200" y2="45" stroke="rgba(255,255,255,0.05)" />

                {/* Speed Area (Blue) */}
                <polyline fill="url(#gradS)" points={`0,80 ${pointsS} 200,80`} />
                <polyline fill="none" stroke="#449eff" strokeWidth="1" points={pointsS} />

                {/* Energy Area (Golden) */}
                <polyline fill="url(#gradC)" points={`0,80 ${pointsC} 200,80`} />
                <polyline fill="none" stroke="#d4af37" strokeWidth="2" points={pointsC} />
            </svg>
        </div>
    );
};

export default PerformancePlot;
