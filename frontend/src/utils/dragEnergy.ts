export type FlowType = 'COUNTER' | 'CROSS' | 'TAIL';

export interface VectorLike {
  x: number;
  y?: number;
  z?: number;
}

export interface DragEnergyMetrics {
  consumptionRate: number;
  windAlignment: number;
  flowType: FlowType;
  efficiency: number;
  relativeAirSpeed: number;
  dragForceN: number;
  dragPowerW: number;
  inducedPowerW: number;
}

export interface DragEnergyConfig {
  airDensityKgM3?: number;
  dragCoefficient?: number;
  frontalAreaM2?: number;
  vehicleWeightN?: number;
  rotorSpanM?: number;
  hoverPowerW?: number;
  sensorPowerW?: number;
  inducedPowerW?: number;
  energyUnitScale?: number;
  minCruiseSpeedMps?: number;
  optimalCruiseSpeedMps?: number;
}

const DEFAULT_CONFIG = {
  airDensityKgM3: 1.225,
  dragCoefficient: 1.05,
  frontalAreaM2: 0.18,
  vehicleWeightN: 24.5,
  rotorSpanM: 1.15,
  hoverPowerW: 68,
  sensorPowerW: 8,
  inducedPowerW: 28,
  energyUnitScale: 0.03,
  minCruiseSpeedMps: 1.2,
  optimalCruiseSpeedMps: 11,
};

function componentY(vec: VectorLike) {
  return vec.y ?? 0;
}

function componentZ(vec: VectorLike) {
  return vec.z ?? 0;
}

function magnitude(vec: VectorLike) {
  return Math.hypot(vec.x, componentY(vec), componentZ(vec));
}

function dot(a: VectorLike, b: VectorLike) {
  return a.x * b.x + componentY(a) * componentY(b) + componentZ(a) * componentZ(b);
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

export function getFlowType(alignmentAngle: number): FlowType {
  if (alignmentAngle > 120) return 'COUNTER';
  if (alignmentAngle < 60) return 'TAIL';
  return 'CROSS';
}

export function calculateWindAlignment(groundVelocity: VectorLike, windVelocity: VectorLike): number {
  const groundSpeed = magnitude(groundVelocity);
  const windSpeed = magnitude(windVelocity);
  if (groundSpeed < 0.1 || windSpeed < 0.1) {
    return 90;
  }

  const cosine = clamp(dot(groundVelocity, windVelocity) / (groundSpeed * windSpeed), -1, 1);
  return (Math.acos(cosine) * 180) / Math.PI;
}

export function calculateDragEnergy(
  groundVelocity: VectorLike,
  windVelocity: VectorLike,
  config: DragEnergyConfig = {},
): DragEnergyMetrics {
  const resolved = { ...DEFAULT_CONFIG, ...config };
  const groundSpeed = magnitude(groundVelocity);
  const relativeVelocity = {
    x: groundVelocity.x - windVelocity.x,
    y: componentY(groundVelocity) - componentY(windVelocity),
    z: componentZ(groundVelocity) - componentZ(windVelocity),
  };
  const relativeAirSpeed = magnitude(relativeVelocity);
  const effectiveAirSpeed = Math.max(resolved.minCruiseSpeedMps, relativeAirSpeed);
  const alignment = calculateWindAlignment(groundVelocity, windVelocity);
  const flowType = getFlowType(alignment);

  const dragForceN = 0.5
    * resolved.airDensityKgM3
    * resolved.dragCoefficient
    * resolved.frontalAreaM2
    * effectiveAirSpeed ** 2;
  const dragPowerW = dragForceN * effectiveAirSpeed;

  const rotorLoadingW = (resolved.vehicleWeightN ** 2)
    / (resolved.airDensityKgM3 * resolved.rotorSpanM ** 2 * resolved.optimalCruiseSpeedMps);
  const inducedPowerW = resolved.inducedPowerW + rotorLoadingW * 0.18;
  const climbPowerW = Math.max(0, componentY(groundVelocity)) * resolved.vehicleWeightN;
  const slowFlightPenaltyW = groundSpeed < resolved.optimalCruiseSpeedMps
    ? (resolved.optimalCruiseSpeedMps - Math.max(groundSpeed, 0.1)) * 2.4
    : 0;

  const totalPowerW = resolved.hoverPowerW
    + resolved.sensorPowerW
    + dragPowerW
    + inducedPowerW
    + climbPowerW
    + slowFlightPenaltyW;
  const consumptionRate = totalPowerW * resolved.energyUnitScale;
  const cruiseError = Math.abs(effectiveAirSpeed - resolved.optimalCruiseSpeedMps) / resolved.optimalCruiseSpeedMps;
  const efficiency = clamp(1 - cruiseError * 0.72 - Math.max(0, alignment - 120) / 240, 0, 1);

  return {
    consumptionRate,
    windAlignment: alignment,
    flowType,
    efficiency,
    relativeAirSpeed,
    dragForceN,
    dragPowerW,
    inducedPowerW,
  };
}
