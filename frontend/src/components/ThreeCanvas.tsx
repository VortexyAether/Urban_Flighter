import { Canvas } from '@react-three/fiber';
import { OrbitControls, PerspectiveCamera } from '@react-three/drei';
import type { ReactNode } from 'react';

interface ThreeCanvasProps {
    children: ReactNode;
}

export default function ThreeCanvas({ children }: ThreeCanvasProps) {
    return (
        <Canvas
            shadows
            gl={{ antialias: true, alpha: false }}
            style={{
                position: 'absolute',
                top: 0,
                left: 0,
                width: '100%',
                height: '100%',
                background: '#050505'
            }}
        >
            <PerspectiveCamera makeDefault position={[0, 100, 200]} fov={60} />

            {/* Atmosphere */}
            <color attach="background" args={['#050505']} />
            <fog attach="fog" args={['#050505', 100, 2500]} />
            {/* <color attach="background" args={['#050505']} />
            <fog attach="fog" args={['#050505', 100, 2500]} />

            <Stars radius={300} depth={60} count={20000} factor={7} saturation={0} fade speed={1} />
            <Sky distance={450000} sunPosition={[0, -1, 0]} inclination={0} azimuth={0.25} /> */}

            {/* Lighting */}
            <ambientLight intensity={0.4} />
            <pointLight position={[100, 100, 100]} intensity={1} castShadow />
            <directionalLight
                position={[-100, 200, 100]}
                intensity={1.5}
                castShadow
                shadow-mapSize={[2048, 2048]}
            />

            <hemisphereLight intensity={0.5} color="#c2a064" groundColor="#000000" />

            {children}

            <OrbitControls
                enablePan={true}
                enableZoom={true}
                enableRotate={true}
                maxPolarAngle={Math.PI / 2.1}
            />
        </Canvas>
    );
}
