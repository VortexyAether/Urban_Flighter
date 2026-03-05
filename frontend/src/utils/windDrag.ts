import * as THREE from 'three';
import { getWindVector } from '../systems/WindSystem';
import type { BuildingData } from '../api';

/**
 * Calculate wind drag force at a given position
 * Returns wind speed (m/s) and direction vector
 */
export interface WindDragInfo {
    speed: number;           // Wind speed in m/s
    direction: THREE.Vector3; // Normalized wind direction
    force: THREE.Vector3;     // Wind vector (speed * direction)
}

export function calculateWindDrag(
    position: THREE.Vector3,
    globalWindSpeed: number,
    globalWindDir: number,
    buildings: BuildingData[]
): WindDragInfo {
    // Get global wind vector
    const rad = (globalWindDir * Math.PI) / 180;
    const globalWind = new THREE.Vector3(
        Math.cos(rad),
        0,
        Math.sin(rad)
    ).multiplyScalar(globalWindSpeed);

    // Get local wind vector (affected by buildings)
    const windForce = getWindVector(position, globalWind, buildings);

    // Calculate speed and direction
    const speed = windForce.length();
    const direction = speed > 0.01 ? windForce.clone().normalize() : new THREE.Vector3(0, 0, 0);

    return {
        speed,
        direction,
        force: windForce
    };
}

/**
 * Calculate drag force on an object
 * F_drag = 0.5 * ρ * v² * C_d * A
 * 
 * @param windInfo - Wind information at object position
 * @param dragCoefficient - Drag coefficient (typical: 0.5-1.2)
 * @param frontalArea - Frontal area in m² (e.g., drone: 0.1-0.3)
 * @param airDensity - Air density in kg/m³ (default: 1.225 at sea level)
 */
export function calculateDragForce(
    windInfo: WindDragInfo,
    dragCoefficient: number = 1.0,
    frontalArea: number = 0.2,
    airDensity: number = 1.225
): THREE.Vector3 {
    // F = 0.5 * ρ * v² * C_d * A
    const forceMagnitude = 0.5 * airDensity * windInfo.speed * windInfo.speed * dragCoefficient * frontalArea;

    // Apply force in wind direction
    return windInfo.direction.clone().multiplyScalar(forceMagnitude);
}
