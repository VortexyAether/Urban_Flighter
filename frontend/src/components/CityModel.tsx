import React, { useMemo } from 'react';
import * as THREE from 'three';
import { useLoader } from '@react-three/fiber';
import { TextureLoader, RepeatWrapping } from 'three';
import type { BuildingData } from '../api';

interface CityModelProps {
    buildings: BuildingData[];
}

const CityModel: React.FC<CityModelProps> = ({ buildings }) => {
    // Load Textures
    const wallTexture = useLoader(TextureLoader, '/rune_wall_elden_chaotic.png');
    wallTexture.wrapS = RepeatWrapping;
    wallTexture.wrapT = RepeatWrapping;
    // User requested 2x larger again (0.008 / 2 = 0.004)
    wallTexture.repeat.set(0.004, 0.004);

    const groundTexture = useLoader(TextureLoader, '/ground_ashen_soil.png');
    groundTexture.wrapS = RepeatWrapping;
    groundTexture.wrapT = RepeatWrapping;
    groundTexture.repeat.set(100, 100); // Tile heavily for detail

    // Create geometries for all buildings
    const buildingMeshes = useMemo(() => {
        return buildings.map((b, idx) => {
            if (!b.footprint || b.footprint.length < 3) return null;

            const shape = new THREE.Shape();
            shape.moveTo(b.footprint[0][0], b.footprint[0][1]);
            for (let i = 1; i < b.footprint.length; i++) {
                shape.lineTo(b.footprint[i][0], b.footprint[i][1]);
            }
            shape.closePath();

            // Extrude along Z-axis (default)
            const geometry = new THREE.ExtrudeGeometry(shape, {
                steps: 1,
                depth: b.height,
                bevelEnabled: false,
            });

            // Rotate -90 on X so Z-depth becomes Y-height
            geometry.rotateX(-Math.PI / 2);
            // After rotation, Z=0 becomes Y=0.
            // But ExtrudeGeometry extrudes from Z=0 to Z=depth.
            // So after rotation, it goes from Y=0 to Y=height. Correct.

            // UV Mapping adjustment for walls might be tricky with ExtrudeGeometry auto-UVs
            // But let's try default for now.

            return (
                <mesh key={idx} geometry={geometry} receiveShadow castShadow>
                    <meshStandardMaterial
                        map={wallTexture}
                        color="#cccccc" // Neutral Grey Stone to let Gold/Black runes show naturally
                        roughness={0.7}
                        emissive="#000000"
                        emissiveIntensity={0}
                    />
                </mesh>
            );
        });
    }, [buildings, wallTexture]);

    return (
        <group>
            {buildingMeshes}

            {/* Infinite Ground Plane */}
            <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.1, 0]} receiveShadow>
                <planeGeometry args={[5000, 5000]} />
                <meshStandardMaterial
                    map={groundTexture}
                    color="#aaaaaa" // Bleached Ash Ground
                    roughness={1.0}
                />
            </mesh>
        </group>
    );
};

export default CityModel;
