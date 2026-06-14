import { useMemo, useState } from 'react';
import * as THREE from 'three';
import type { FlowField2DResponse } from '../api';
import Aircraft, { type AircraftMetrics } from './Aircraft';
import CameraFollow from './CameraFollow';
import CircularBoundary from './CircularBoundary';
import CityModel from './CityModel';
import ThreeCanvas from './ThreeCanvas';
import WindArrowGrid from './WindArrowGrid';
import WindContour from './WindContour';
import type { Telemetry } from './TopDownGame';

interface Simulation3DProps {
  flow: FlowField2DResponse | null;
  showFlowAnimation: boolean;
  onTelemetry: (telemetry: Telemetry) => void;
}

const EMPTY_TARGET = new THREE.Vector3(0, 50, 0);

function inletDirectionDeg(flow: FlowField2DResponse | null) {
  if (!flow) return 45;
  return (Math.atan2(flow.inlet.uy, flow.inlet.ux) * 180) / Math.PI;
}

function toTelemetry(metrics: AircraftMetrics): Telemetry {
  const horizontalWind = new THREE.Vector2(metrics.windDirection.x, metrics.windDirection.z)
    .multiplyScalar(metrics.windSpeed);

  return {
    droneSpeed: metrics.velocity.length(),
    localWindSpeed: metrics.windSpeed,
    localWindDirDeg: ((Math.atan2(horizontalWind.y, horizontalWind.x) * 180) / Math.PI + 360) % 360,
    energyRate: metrics.energyMetrics.consumptionRate,
    energyUsed: metrics.energy,
    headingDeg: ((metrics.yaw * 180) / Math.PI + 360) % 360,
    position: {
      x: metrics.position.x,
      y: metrics.position.z,
    },
  };
}

export default function Simulation3D({ flow, showFlowAnimation, onTelemetry }: Simulation3DProps) {
  const [aircraftMetrics, setAircraftMetrics] = useState<AircraftMetrics | null>(null);

  const windSpeed = flow?.inlet.speed_mps ?? flow?.weather.wind_speed ?? 8;
  const windDir = useMemo(() => inletDirectionDeg(flow), [flow]);
  const buildings = flow?.buildings ?? [];
  const gridExtent = flow?.domain.solve_radius_m ?? 220;
  const contourSize = Math.max(320, gridExtent * 2);
  const arrowStep = Math.max(24, Math.round(contourSize / 12));

  const handleMetricsUpdate = (metrics: AircraftMetrics) => {
    setAircraftMetrics(metrics);
    onTelemetry(toTelemetry(metrics));
  };

  return (
    <div className="simulation-3d">
      <ThreeCanvas>
        <CircularBoundary />
        <CityModel buildings={buildings} />
        <WindContour
          globalWindSpeed={windSpeed}
          globalWindDir={windDir}
          buildings={buildings}
          resolution={72}
          size={contourSize}
          height={4}
        />
        <WindArrowGrid
          globalWindSpeed={windSpeed}
          globalWindDir={windDir}
          buildings={buildings}
          gridSize={arrowStep}
          gridExtent={gridExtent}
          height={18}
        />
        <Aircraft
          globalWindSpeed={windSpeed}
          globalWindDir={windDir}
          buildings={buildings}
          onMetricsUpdate={handleMetricsUpdate}
        />
        <CameraFollow
          target={aircraftMetrics?.position ?? EMPTY_TARGET}
          yaw={aircraftMetrics?.yaw ?? 0}
          pitch={aircraftMetrics?.pitch ?? 0}
          enabled={showFlowAnimation}
        />
      </ThreeCanvas>
      {!flow && (
        <div className="simulation-3d-loading">
          Loading 3D field...
        </div>
      )}
    </div>
  );
}
