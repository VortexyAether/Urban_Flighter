import React, { useMemo, useRef } from 'react';
import * as THREE from 'three';
import { getWindVector } from '../systems/WindSystem';
import type { BuildingData } from '../api';

interface WindContourProps {
    globalWindSpeed?: number;
    globalWindDir?: number;
    buildings?: BuildingData[];
    resolution?: number; // Grid resolution
    size?: number; // Total size of plane
    height?: number; // Height above ground
}

const WindContour: React.FC<WindContourProps> = ({
    globalWindSpeed = 10,
    globalWindDir = 45,
    buildings = [],
    resolution = 100, // 100x100 grid
    size = 1000, // 1000m x 1000m
    height = 5 // 5m above ground
}) => {
    const meshRef = useRef<THREE.Mesh>(null);

    const globalWindVector = useMemo(() => {
        const rad = (globalWindDir * Math.PI) / 180;
        return new THREE.Vector3(Math.cos(rad), 0, Math.sin(rad)).multiplyScalar(globalWindSpeed);
    }, [globalWindSpeed, globalWindDir]);

    // Generate plane geometry with vertex colors
    const geometry = useMemo(() => {
        const geo = new THREE.PlaneGeometry(size, size, resolution - 1, resolution - 1);

        // Rotate to horizontal (XZ plane)
        geo.rotateX(-Math.PI / 2);
        geo.translate(0, height, 0);

        const positions = geo.attributes.position;
        const colors = new Float32Array(positions.count * 3);

        // Calculate wind speed at each vertex and assign color
        for (let i = 0; i < positions.count; i++) {
            const x = positions.getX(i);
            const y = positions.getY(i);
            const z = positions.getZ(i);

            const pos = new THREE.Vector3(x, y, z);
            const windVec = getWindVector(pos, globalWindVector, buildings);
            const speed = windVec.length();

            const hue = THREE.MathUtils.lerp(0.08, 0.55, THREE.MathUtils.clamp(speed / 18.0, 0, 1));
            const color = new THREE.Color().setHSL(hue, 0.92, 0.48);

            colors[i * 3] = color.r;
            colors[i * 3 + 1] = color.g;
            colors[i * 3 + 2] = color.b;
        }

        geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));

        return geo;
    }, [globalWindVector, buildings, resolution, size, height]);

    return (
        <mesh ref={meshRef} geometry={geometry}>
            <meshBasicMaterial
                vertexColors
                transparent
                opacity={0.6}
                side={THREE.DoubleSide}
                depthWrite={false}
            />
        </mesh>
    );
};

export default WindContour;
