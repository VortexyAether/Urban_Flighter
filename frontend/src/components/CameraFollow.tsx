import React, { useRef } from 'react';
import { useThree, useFrame } from '@react-three/fiber';
import * as THREE from 'three';

interface CameraFollowProps {
    target: THREE.Vector3;
    yaw: number;   // Aircraft heading
    pitch: number; // Aircraft pitch
    enabled: boolean;
}

const CameraFollow: React.FC<CameraFollowProps> = ({ target, yaw, pitch, enabled }) => {
    const { camera } = useThree();
    const smoothTarget = useRef(new THREE.Vector3(0, 50, 0));

    useFrame(() => {
        if (!enabled) return;

        // Calculate camera position behind aircraft based on its yaw and pitch
        const distance = 50; // Distance behind aircraft
        const height = 30;   // Height above aircraft

        // Camera position rotates with aircraft (yaw and pitch)
        const cameraOffset = new THREE.Vector3(
            Math.sin(yaw) * Math.cos(pitch) * distance,  // X offset
            height - Math.sin(pitch) * distance * 0.5,   // Y offset (affected by pitch)
            Math.cos(yaw) * Math.cos(pitch) * distance   // Z offset
        );

        const desiredPosition = new THREE.Vector3(
            target.x + cameraOffset.x,
            target.y + cameraOffset.y,
            target.z + cameraOffset.z
        );

        // Smooth camera movement (reduced from 0.1 to 0.05 for smoother motion)
        camera.position.lerp(desiredPosition, 0.05);

        // Smooth lookAt target to prevent jittery rotation
        smoothTarget.current.lerp(target, 0.1);
        camera.lookAt(smoothTarget.current);
    });

    return null;
};

export default CameraFollow;
