import React, { useMemo } from 'react';
import * as THREE from 'three';
import type { BuildingData } from '../api';

interface CityModelProps {
  buildings: BuildingData[];
}

interface BuildingMeshData {
  color: string;
  edgeGeometry: THREE.EdgesGeometry;
  geometry: THREE.ExtrudeGeometry;
  height: number;
}

function getHeightColor(height: number) {
  if (height > 110) return '#ffffff';
  if (height > 70) return '#e1e4de';
  if (height > 35) return '#c8ccc7';
  return '#929995';
}

const CityModel: React.FC<CityModelProps> = ({ buildings }) => {
  const buildingMeshes = useMemo<BuildingMeshData[]>(() => {
    return buildings.flatMap((building) => {
      if (!building.footprint || building.footprint.length < 3) return [];

      const shape = new THREE.Shape();
      shape.moveTo(building.footprint[0][0], building.footprint[0][1]);
      for (let i = 1; i < building.footprint.length; i += 1) {
        shape.lineTo(building.footprint[i][0], building.footprint[i][1]);
      }
      shape.closePath();

      const geometry = new THREE.ExtrudeGeometry(shape, {
        steps: 1,
        depth: building.height,
        bevelEnabled: false,
      });
      geometry.rotateX(-Math.PI / 2);
      geometry.computeVertexNormals();

      return [{
        color: getHeightColor(building.height),
        edgeGeometry: new THREE.EdgesGeometry(geometry, 28),
        geometry,
        height: building.height,
      }];
    });
  }, [buildings]);

  return (
    <group>
      {buildingMeshes.map((building, index) => (
        <group key={`${index}-${building.height.toFixed(1)}`}>
          <mesh geometry={building.geometry} receiveShadow castShadow>
            <meshStandardMaterial
              color={building.color}
              metalness={0.1}
              roughness={0.72}
              transparent
              opacity={0.86}
            />
          </mesh>
          <lineSegments geometry={building.edgeGeometry}>
            <lineBasicMaterial color="#15191d" transparent opacity={0.2} />
          </lineSegments>
        </group>
      ))}

      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.15, 0]} receiveShadow>
        <planeGeometry args={[5200, 5200]} />
        <meshStandardMaterial color="#161a1d" roughness={1} metalness={0} />
      </mesh>
      <gridHelper args={[5200, 104, '#39424a', '#20252a']} position={[0, 0.04, 0]} />
    </group>
  );
};

export default CityModel;
