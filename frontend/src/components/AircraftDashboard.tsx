import React from 'react';
import type { AircraftMetrics } from './Aircraft';
import PerformancePlot from './PerformancePlot';
import './AircraftDashboard.css';

interface AircraftDashboardProps {
    metrics: AircraftMetrics | null;
}

const AircraftDashboard: React.FC<AircraftDashboardProps> = ({ metrics }) => {
    if (!metrics) {
        return (
            <div className="aircraft-dashboard">
                <div className="dashboard-title">AIRCRAFT OFFLINE</div>
            </div>
        );
    }

    const { position, velocity, windSpeed, windDirection, energyMetrics } = metrics;
    const currentSpeed = velocity.length();

    // Calculate wind direction angle for arrow
    const windAngle = Math.atan2(windDirection.z, windDirection.x) * (180 / Math.PI);

    // Get flow type color
    const flowColors = {
        'COUNTER': '#ff4444',
        'CROSS': '#ffaa44',
        'TAIL': '#44ff44'
    };

    const flowColor = flowColors[energyMetrics.flowType];

    return (
        <div className="aircraft-dashboard">
            <div className="dashboard-title">⚔ FLIGHT SYSTEMS ⚔</div>

            <div className="dashboard-grid">
                {/* Wind Speed */}
                <div className="metric-box">
                    <div className="metric-label">WIND SPEED</div>
                    <div className="metric-value">{windSpeed.toFixed(1)} m/s</div>
                </div>

                {/* Wind Direction */}
                <div className="metric-box">
                    <div className="metric-label">WIND DIR</div>
                    <div className="wind-arrow" style={{ transform: `rotate(${windAngle}deg)` }}>
                        ↑
                    </div>
                </div>

                {/* Flow Type */}
                <div className="metric-box">
                    <div className="metric-label">FLOW TYPE</div>
                    <div className="metric-value" style={{ color: flowColor }}>
                        {energyMetrics.flowType}
                    </div>
                    <div className="metric-subtext">{energyMetrics.windAlignment.toFixed(0)}°</div>
                </div>

                {/* Altitude */}
                <div className="metric-box">
                    <div className="metric-label">ALTITUDE</div>
                    <div className="metric-value">{position.y.toFixed(0)} m</div>
                </div>

                {/* Speed */}
                <div className="metric-box">
                    <div className="metric-label">SPEED</div>
                    <div className="metric-value">{currentSpeed.toFixed(1)} m/s</div>
                </div>

                {/* Performance Plot (Replaces numeric energy boxes) */}
                <div className="metric-box wide no-border-bottom">
                    <div className="metric-label">PERFORMANCE TELEMETRY</div>
                    <PerformancePlot
                        consumption={energyMetrics.consumptionRate}
                        speed={currentSpeed}
                    />
                </div>
            </div>

            <div className="controls-hint">
                W: Forward | A/D: Turn | ↑/↓: Vertical
            </div>
        </div>
    );
};

export default AircraftDashboard;
