import * as THREE from 'three';
import type { WindDragInfo } from './windDrag';

/**
 * Energy System for Aircraft
 * Calculates energy consumption based on wind resistance
 */

export interface EnergyMetrics {
    consumptionRate: number;  // Energy units per second
    windAlignment: number;    // Angle between velocity and wind (0-180°)
    flowType: 'COUNTER' | 'CROSS' | 'TAIL';
    efficiency: number;       // 0-1, higher is better
}

/**
 * Calculate angle between aircraft velocity and wind direction
 * Returns angle in degrees (0-180)
 */
export function calculateWindAlignment(
    velocity: THREE.Vector3,
    windDirection: THREE.Vector3
): number {
    if (velocity.length() < 0.1 || windDirection.length() < 0.1) {
        return 90; // No movement or no wind = neutral
    }

    const velNorm = velocity.clone().normalize();
    const windNorm = windDirection.clone().normalize();

    // Dot product gives cos(angle)
    const dot = velNorm.dot(windNorm);
    const angleRad = Math.acos(THREE.MathUtils.clamp(dot, -1, 1));
    const angleDeg = THREE.MathUtils.radToDeg(angleRad);

    return angleDeg;
}

/**
 * Determine flow type based on alignment angle
 */
export function getFlowType(alignmentAngle: number): 'COUNTER' | 'CROSS' | 'TAIL' {
    if (alignmentAngle > 120) {
        return 'COUNTER'; // Flying into wind
    } else if (alignmentAngle < 60) {
        return 'TAIL'; // Flying with wind
    } else {
        return 'CROSS'; // Crosswind
    }
}

/**
 * Calculate energy consumption rate
 * 
 * Formula:
 * E = base_cost + drag_penalty
 * 
 * drag_penalty = k * wind_speed * alignment_factor
 * - COUNTER (120-180°): High penalty (1.5x - 3x)
 * - CROSS (60-120°): Medium penalty (0.5x - 1.5x)
 * - TAIL (0-60°): Low/negative penalty (-0.5x - 0.5x)
 */
export function calculateEnergyConsumption(
    velocity: THREE.Vector3,
    windInfo: WindDragInfo,
    baseCost: number = 10 // Base energy per second when hovering
): EnergyMetrics {
    const speed = velocity.length();

    // No movement = minimal hover cost
    if (speed < 0.1) {
        return {
            consumptionRate: baseCost * 0.5,
            windAlignment: 90,
            flowType: 'CROSS',
            efficiency: 1.0
        };
    }

    const alignment = calculateWindAlignment(velocity, windInfo.direction);
    const flowType = getFlowType(alignment);

    // Calculate drag penalty based on alignment
    // Much steeper penalty for headwinds
    // 0° (Tailwind): factor = -1.5 (Greatly reduced cost)
    // 180° (Headwind): factor = 6.0 (Massive penalty)
    const alignmentFactor = (alignment / 180) * 7.5 - 1.5;

    // Drag penalty scales massively with wind speed (5x current weight)
    const dragPenalty = windInfo.speed * alignmentFactor * 20; // Multiplier increased from 4 to 20

    // Movement cost scales with aircraft speed
    const movementCost = speed * 2.5; // Multiplier increased from 1.5 to 2.5

    // Vertical cost: Climbing is extremely expensive, descending is cheap
    const climbCost = velocity.y > 0 ? velocity.y * 15 : velocity.y * 2;

    // Total consumption
    const consumptionRate = baseCost + movementCost + dragPenalty + climbCost;

    // Efficiency: 1.0 = optimal, 0.0 = worst
    const totalPossibleBase = baseCost + movementCost;
    const efficiency = THREE.MathUtils.clamp(1 - (dragPenalty / (totalPossibleBase + 0.1)), 0, 1);

    return {
        consumptionRate: Math.max(consumptionRate, baseCost * 0.2), // Minimum consumption
        windAlignment: alignment,
        flowType,
        efficiency
    };
}

/**
 * Update energy level based on consumption
 */
export function updateEnergy(
    currentEnergy: number,
    consumptionRate: number,
    deltaTime: number,
    maxEnergy: number = 100
): number {
    const newEnergy = currentEnergy - (consumptionRate * deltaTime);
    return THREE.MathUtils.clamp(newEnergy, 0, maxEnergy);
}
