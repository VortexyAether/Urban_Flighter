import React from 'react';
import * as THREE from 'three';

const CircularBoundary: React.FC = () => {
    return (
        <group>
            {/* Ground circle */}
            <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, 0]}>
                <circleGeometry args={[1500, 64]} />
                <meshBasicMaterial
                    color="#1a1a1a"
                    transparent
                    opacity={0.3}
                    side={THREE.DoubleSide}
                />
            </mesh>

            {/* Boundary ring */}
            <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.5, 0]}>
                <ringGeometry args={[1485, 1500, 64]} />
                <meshBasicMaterial
                    color="#4a9eff"
                    transparent
                    opacity={0.6}
                    side={THREE.DoubleSide}
                />
            </mesh>
        </group>
    );
};

export default CircularBoundary;
