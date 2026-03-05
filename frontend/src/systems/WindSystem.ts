import * as THREE from 'three';
import type { BuildingData } from '../api';

/**
 * Polygon-based Wind System
 * Uses actual building footprints for accurate wind calculation
 */

interface PolygonBuilding {
    footprint: [number, number][];
    center: THREE.Vector2;
}

// Cache polygon buildings
let cachedPolygons: PolygonBuilding[] | null = null;
let cachedBuildingCount = 0;

function buildingsToPolygons(buildings: BuildingData[]): PolygonBuilding[] {
    if (cachedPolygons && cachedBuildingCount === buildings.length) {
        return cachedPolygons;
    }

    cachedPolygons = buildings.map(b => {
        const footprint = b.footprint;
        if (!footprint || footprint.length < 3) return null;

        // Calculate centroid
        let sumX = 0, sumZ = 0;
        footprint.forEach(([x, z]) => {
            sumX += x;
            sumZ += z;
        });

        return {
            footprint: footprint,
            center: new THREE.Vector2(sumX / footprint.length, sumZ / footprint.length)
        };
    }).filter(p => p !== null) as PolygonBuilding[];

    cachedBuildingCount = buildings.length;
    return cachedPolygons;
}

/**
 * Calculate distance from point to polygon edge (closest edge)
 */
function distanceToPolygon(point: THREE.Vector2, polygon: [number, number][]): { dist: number; normal: THREE.Vector2 } {
    let minDist = Infinity;
    let closestNormal = new THREE.Vector2(0, 0);

    for (let i = 0; i < polygon.length; i++) {
        const p1 = polygon[i];
        const p2 = polygon[(i + 1) % polygon.length];

        // Edge vector
        const edgeX = p2[0] - p1[0];
        const edgeZ = p2[1] - p1[1];
        const edgeLen = Math.sqrt(edgeX * edgeX + edgeZ * edgeZ);

        // Vector from p1 to point
        const toPointX = point.x - p1[0];
        const toPointZ = point.y - p1[1];

        // Project onto edge
        const t = Math.max(0, Math.min(1, (toPointX * edgeX + toPointZ * edgeZ) / (edgeLen * edgeLen)));

        // Closest point on edge
        const closestX = p1[0] + t * edgeX;
        const closestZ = p1[1] + t * edgeZ;

        // Distance to closest point
        const dx = point.x - closestX;
        const dz = point.y - closestZ;
        const dist = Math.sqrt(dx * dx + dz * dz);

        if (dist < minDist) {
            minDist = dist;
            // Normal pointing away from edge
            const normalX = -edgeZ / edgeLen;
            const normalZ = edgeX / edgeLen;
            // Make sure normal points away from polygon center
            const toCenterX = closestX - (p1[0] + p2[0]) / 2;
            const toCenterZ = closestZ - (p1[1] + p2[1]) / 2;
            const dot = normalX * toCenterX + normalZ * toCenterZ;
            closestNormal = new THREE.Vector2(
                dot > 0 ? normalX : -normalX,
                dot > 0 ? normalZ : -normalZ
            );
        }
    }

    return { dist: minDist, normal: closestNormal };
}

/**
 * Check if point is inside polygon (ray casting)
 */
function isInsidePolygon(point: THREE.Vector2, polygon: [number, number][]): boolean {
    let inside = false;
    for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
        const xi = polygon[i][0], zi = polygon[i][1];
        const xj = polygon[j][0], zj = polygon[j][1];

        const intersect = ((zi > point.y) !== (zj > point.y))
            && (point.x < (xj - xi) * (point.y - zi) / (zj - zi) + xi);
        if (intersect) inside = !inside;
    }
    return inside;
}

/**
 * Polygon-based wind calculation
 */
export const getWindVector = (
    position: THREE.Vector3,
    globalWind: THREE.Vector3,
    buildings: BuildingData[]
): THREE.Vector3 => {
    const pos2D = new THREE.Vector2(position.x, position.z);
    const polygons = buildingsToPolygons(buildings);

    let windX = globalWind.x;
    let windZ = globalWind.z;

    polygons.forEach(poly => {
        // Quick distance check to center first (optimization)
        const distToCenter = pos2D.distanceTo(poly.center);
        if (distToCenter > 200) return; // Skip far buildings

        // Check if inside polygon
        const inside = isInsidePolygon(pos2D, poly.footprint);

        if (inside) {
            // Strong repulsion if inside
            const dx = pos2D.x - poly.center.x;
            const dz = pos2D.y - poly.center.y;
            const dist = Math.sqrt(dx * dx + dz * dz) + 0.1;
            windX += (dx / dist) * 20;
            windZ += (dz / dist) * 20;
        } else {
            // Repulsion based on distance to nearest edge
            const { dist, normal } = distanceToPolygon(pos2D, poly.footprint);

            if (dist < 50) {
                const strength = (1 - dist / 50) * 8;
                windX += normal.x * strength;
                windZ += normal.y * strength;
            }
        }
    });

    return new THREE.Vector3(windX, 0, windZ);
};
