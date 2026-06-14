import React, { useRef, useState, useEffect } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { calculateWindDrag } from '../utils/windDrag';
import { calculateEnergyConsumption, type EnergyMetrics } from '../utils/energySystem';
import type { BuildingData } from '../api';

interface AircraftProps {
    globalWindSpeed: number;
    globalWindDir: number;
    buildings: BuildingData[];
    onMetricsUpdate?: (metrics: AircraftMetrics) => void;
}

export interface AircraftMetrics {
    position: THREE.Vector3;
    velocity: THREE.Vector3;
    windSpeed: number;
    windDirection: THREE.Vector3;
    energy: number;
    energyMetrics: EnergyMetrics;
    yaw: number;   // Aircraft heading for camera
    pitch: number; // Aircraft pitch for camera
}

const Aircraft: React.FC<AircraftProps> = ({
    globalWindSpeed,
    globalWindDir,
    buildings,
    onMetricsUpdate
}) => {
    const groupRef = useRef<THREE.Group>(null);

    // Aircraft state
    const positionRef = useRef(new THREE.Vector3(0, 50, 0));
    const velocityRef = useRef(new THREE.Vector3(0, 0, 0));
    const [totalEnergyUsed, setTotalEnergyUsed] = useState(0);
    const [yaw, setYaw] = useState(0);     // Aircraft rotation angle (radians)
    const [pitch, setPitch] = useState(0); // Aircraft pitch angle (radians)

    // Controls state
    const keysPressed = useRef<Set<string>>(new Set());

    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            keysPressed.current.add(e.code.toLowerCase());
        };

        const handleKeyUp = (e: KeyboardEvent) => {
            keysPressed.current.delete(e.code.toLowerCase());
        };

        window.addEventListener('keydown', handleKeyDown);
        window.addEventListener('keyup', handleKeyUp);

        return () => {
            window.removeEventListener('keydown', handleKeyDown);
            window.removeEventListener('keyup', handleKeyUp);
        };
    }, []);

    useFrame((_, delta) => {
        if (!groupRef.current) return;
        const position = positionRef.current;
        const velocity = velocityRef.current;

        // Simplified flight controls
        const forwardSpeed = 40;     // m/s
        const turnSpeed = 1.5;       // radians/s
        const pitchSpeed = 1.0;      // radians/s for pitch control

        // A/D for turning (yaw) - update rotation first
        if (keysPressed.current.has('keya')) {
            setYaw(prev => prev + turnSpeed * delta);
        }
        if (keysPressed.current.has('keyd')) {
            setYaw(prev => prev - turnSpeed * delta);
        }

        // Arrow Up/Down for pitch control (nose up/down)
        if (keysPressed.current.has('arrowup')) {
            setPitch(prev => Math.min(prev + pitchSpeed * delta, Math.PI / 4)); // Max 45° up
        }
        if (keysPressed.current.has('arrowdown')) {
            setPitch(prev => Math.max(prev - pitchSpeed * delta, -Math.PI / 4)); // Max 45° down
        }

        // W for forward movement - in the direction aircraft is facing (including pitch)
        const acceleration = new THREE.Vector3(0, 0, 0);
        if (keysPressed.current.has('keyw')) {
            // Calculate forward direction based on current yaw and pitch
            const forward = new THREE.Vector3(
                -Math.sin(yaw) * Math.cos(pitch),  // X component
                Math.sin(pitch),                     // Y component (affected by pitch)
                -Math.cos(yaw) * Math.cos(pitch)    // Z component
            );
            acceleration.add(forward.multiplyScalar(forwardSpeed));
        }

        // Smooth velocity transition
        velocity.lerp(acceleration, 0.15);

        // Get wind force at current position
        const windInfo = calculateWindDrag(position, globalWindSpeed, globalWindDir, buildings);

        // Apply wind force (subtle influence)
        const windForce = windInfo.force.clone().multiplyScalar(0.03);
        velocity.add(windForce.clone().multiplyScalar(delta));

        // Update position
        position.add(velocity.clone().multiplyScalar(delta));

        // Boundary constraints (stay within domain)
        const maxDist = 1500;
        const dist2D = Math.sqrt(position.x ** 2 + position.z ** 2);
        if (dist2D > maxDist) {
            const angle = Math.atan2(position.z, position.x);
            position.x = Math.cos(angle) * maxDist;
            position.z = Math.sin(angle) * maxDist;
            velocity.multiplyScalar(0.5); // Slow down at boundary
        }

        // Height constraints
        position.y = THREE.MathUtils.clamp(position.y, 5, 300);
        if (position.y <= 5 || position.y >= 300) {
            velocity.y *= -0.3; // Bounce
        }

        // Calculate energy consumption and accumulate total used
        const energyMetrics = calculateEnergyConsumption(velocity, windInfo);
        const energyConsumed = energyMetrics.consumptionRate * delta;
        setTotalEnergyUsed(prev => prev + energyConsumed);

        // Update mesh position
        groupRef.current.position.copy(position);

        // Set aircraft rotation (yaw and pitch)
        groupRef.current.rotation.y = yaw;
        groupRef.current.rotation.x = pitch;

        // Send metrics to parent
        if (onMetricsUpdate) {
            onMetricsUpdate({
                position: position.clone(),
                velocity: velocity.clone(),
                windSpeed: windInfo.speed,
                windDirection: windInfo.direction.clone(),
                energy: totalEnergyUsed,
                energyMetrics,
                yaw,
                pitch
            });
        }
    });

    return (
        <group ref={groupRef}>
            {/* Pegasus-inspired aircraft - Dark Gray */}

            {/* Horse body (elongated box) */}
            <mesh position={[0, 0, 0]}>
                <boxGeometry args={[4, 5, 12]} />
                <meshStandardMaterial color="#f2f3ef" metalness={0.18} roughness={0.5} />
            </mesh>

            {/* Head/neck (cone pointing forward) */}
            <mesh position={[0, 3, -8]} rotation={[Math.PI / 2, 0, 0]}>
                <coneGeometry args={[2, 6, 8]} />
                <meshStandardMaterial color="#d8dcd6" metalness={0.2} roughness={0.55} />
            </mesh>

            {/* Left Wing */}
            <group position={[-2, 2, 0]}>
                <mesh rotation={[0, 0, -0.3]}>
                    <boxGeometry args={[20, 0.8, 8]} />
                    <meshStandardMaterial
                        color="#c7ccc6"
                        metalness={0.4}
                        roughness={0.5}
                        emissive="#1a1a1a"
                        emissiveIntensity={0.1}
                    />
                </mesh>
                {/* Wing feather detail */}
                <mesh position={[-8, 0, 0]} rotation={[0, 0, -0.2]}>
                    <boxGeometry args={[6, 0.6, 6]} />
                    <meshStandardMaterial color="#8e969c" metalness={0.25} roughness={0.6} />
                </mesh>
            </group>

            {/* Right Wing */}
            <group position={[2, 2, 0]}>
                <mesh rotation={[0, 0, 0.3]}>
                    <boxGeometry args={[20, 0.8, 8]} />
                    <meshStandardMaterial
                        color="#c7ccc6"
                        metalness={0.4}
                        roughness={0.5}
                        emissive="#1a1a1a"
                        emissiveIntensity={0.1}
                    />
                </mesh>
                {/* Wing feather detail */}
                <mesh position={[8, 0, 0]} rotation={[0, 0, 0.2]}>
                    <boxGeometry args={[6, 0.6, 6]} />
                    <meshStandardMaterial color="#8e969c" metalness={0.25} roughness={0.6} />
                </mesh>
            </group>

            {/* Tail (flowing) */}
            <mesh position={[0, 0, 8]} rotation={[0.3, 0, 0]}>
                <boxGeometry args={[2, 1, 6]} />
                <meshStandardMaterial color="#8e969c" metalness={0.2} roughness={0.7} />
            </mesh>

            {/* Nose sensor */}
            <mesh position={[0, 4, -10]}>
                <sphereGeometry args={[0.8, 8, 8]} />
                <meshStandardMaterial
                    color="#22b8ff"
                    metalness={0.45}
                    roughness={0.3}
                    emissive="#0b6f9e"
                    emissiveIntensity={0.35}
                />
            </mesh>
        </group>
    );
};

export default Aircraft;
