import React, { useRef, useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { getWindVector } from '../systems/WindSystem';
import type { BuildingData } from '../api';

interface WindArrowGridProps {
    globalWindSpeed?: number;
    globalWindDir?: number;
    buildings?: BuildingData[];
    gridSize?: number; // Grid spacing in meters
    gridExtent?: number; // Total area coverage (meters from center)
    height?: number; // Height above ground
}

const WindArrowGrid: React.FC<WindArrowGridProps> = ({
    globalWindSpeed = 10,
    globalWindDir = 45,
    buildings = [],
    gridSize = 40, // 40m spacing
    gridExtent = 500, // 500m radius
    height = 15 // 15m above ground
}) => {
    const meshRef = useRef<THREE.InstancedMesh>(null);
    const dummy = useMemo(() => new THREE.Object3D(), []);
    const colorHelper = useMemo(() => new THREE.Color(), []);

    const globalWindVector = useMemo(() => {
        const rad = (globalWindDir * Math.PI) / 180;
        return new THREE.Vector3(Math.cos(rad), 0, Math.sin(rad)).multiplyScalar(globalWindSpeed);
    }, [globalWindSpeed, globalWindDir]);

    // Generate grid points
    const gridPoints = useMemo(() => {
        const points = [];
        const steps = Math.floor(gridExtent / gridSize);

        for (let x = -steps; x <= steps; x++) {
            for (let z = -steps; z <= steps; z++) {
                points.push(new THREE.Vector3(x * gridSize, height, z * gridSize));
            }
        }

        return points;
    }, [gridSize, gridExtent, height]);

    const totalArrows = gridPoints.length;

    useFrame(() => {
        if (!meshRef.current) return;

        gridPoints.forEach((pos, idx) => {
            // Calculate wind at this grid point
            const windVec = getWindVector(pos, globalWindVector, buildings);
            const speed = windVec.length();

            // Skip if wind is too weak (inside building or dead zone)
            if (speed < 0.5) {
                dummy.scale.set(0, 0, 0);
            } else {
                // Position arrow at grid point
                dummy.position.copy(pos);

                // Orient arrow to wind direction
                const direction = windVec.clone().normalize();
                dummy.lookAt(pos.clone().add(direction));
                dummy.rotateX(Math.PI / 2); // Align cone tip to direction

                // Size based on speed (bigger = faster)
                const arrowSize = THREE.MathUtils.clamp(speed / 10.0, 0.3, 2.5);
                dummy.scale.set(arrowSize, arrowSize, arrowSize * 1.5);

                // Color based on speed: Blue (slow) -> Red (fast)
                const hue = THREE.MathUtils.clamp(0.7 - (speed / 25.0) * 0.7, 0.0, 0.7);
                colorHelper.setHSL(hue, 1.0, 0.6);
                meshRef.current!.setColorAt(idx, colorHelper);
            }

            dummy.updateMatrix();
            meshRef.current!.setMatrixAt(idx, dummy.matrix);
        });

        meshRef.current.instanceMatrix.needsUpdate = true;
        if (meshRef.current.instanceColor) meshRef.current.instanceColor.needsUpdate = true;
    });

    return (
        <instancedMesh ref={meshRef} args={[undefined, undefined, totalArrows]} frustumCulled={false}>
            {/* Large cone for clear arrow visualization */}
            <coneGeometry args={[1.5, 4, 8]} />
            <meshBasicMaterial
                transparent
                opacity={0.85}
                blending={THREE.AdditiveBlending}
                depthWrite={false}
                toneMapped={false}
            />
        </instancedMesh>
    );
};

export default WindArrowGrid;
