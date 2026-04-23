import { useEffect, useMemo, useRef } from 'react';
import type { BuildingData, FlowField2DResponse } from '../api';

interface Vec2 {
  x: number;
  y: number;
}

interface TopDownGameProps {
  flow: FlowField2DResponse | null;
  showFlowAnimation: boolean;
  onTelemetry: (telemetry: Telemetry) => void;
}

export interface Telemetry {
  droneSpeed: number;
  localWindSpeed: number;
  localWindDirDeg: number;
  energyRate: number;
  energyUsed: number;
  headingDeg: number;
  position: Vec2;
}

interface WorldState {
  position: Vec2;
  velocity: Vec2;
  heading: number;
  energyUsed: number;
}

interface FlowParticle {
  position: Vec2;
  age: number;
  life: number;
  hue: number;
  width: number;
}

interface FlowObstacle {
  footprint: number[][];
  center: Vec2;
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
  span: number;
}

const MAX_SPEED = 32;
const THRUST = 34;
const DRAG = 0.9;
const DRONE_RADIUS = 12;
const VIEW_RADIUS_M = 200;
const PARTICLE_COUNT = 900;

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function length(vec: Vec2) {
  return Math.hypot(vec.x, vec.y);
}

function normalize(vec: Vec2): Vec2 {
  const len = length(vec);
  return len > 1e-6 ? { x: vec.x / len, y: vec.y / len } : { x: 0, y: 0 };
}

function pointInPolygon(point: Vec2, polygon: number[][]) {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const xi = polygon[i][0];
    const yi = polygon[i][1];
    const xj = polygon[j][0];
    const yj = polygon[j][1];
    const intersect = ((yi > point.y) !== (yj > point.y))
      && (point.x < ((xj - xi) * (point.y - yi)) / ((yj - yi) || 1e-6) + xi);
    if (intersect) inside = !inside;
  }
  return inside;
}

function distanceToSegment(point: Vec2, a: number[], b: number[]) {
  const abx = b[0] - a[0];
  const aby = b[1] - a[1];
  const apx = point.x - a[0];
  const apy = point.y - a[1];
  const ab2 = abx * abx + aby * aby || 1e-6;
  const t = clamp((apx * abx + apy * aby) / ab2, 0, 1);
  const closest = { x: a[0] + abx * t, y: a[1] + aby * t };
  const dx = point.x - closest.x;
  const dy = point.y - closest.y;
  return {
    dist: Math.hypot(dx, dy),
    point: closest,
  };
}

function buildObstacles(buildings: BuildingData[]): FlowObstacle[] {
  return buildings
    .filter((building) => building.footprint.length >= 3)
    .map((building) => {
      let centerX = 0;
      let centerY = 0;
      let minX = Infinity;
      let maxX = -Infinity;
      let minY = Infinity;
      let maxY = -Infinity;

      for (const [x, y] of building.footprint) {
        centerX += x;
        centerY += y;
        minX = Math.min(minX, x);
        maxX = Math.max(maxX, x);
        minY = Math.min(minY, y);
        maxY = Math.max(maxY, y);
      }

      centerX /= building.footprint.length;
      centerY /= building.footprint.length;

      return {
        footprint: building.footprint,
        center: { x: centerX, y: centerY },
        minX,
        maxX,
        minY,
        maxY,
        span: Math.max(8, maxX - minX, maxY - minY),
      };
    });
}

function sampleField(flow: FlowField2DResponse, obstacles: FlowObstacle[], point: Vec2): Vec2 {
  const wind = { x: flow.inlet.ux, y: flow.inlet.uy };
  const speed = Math.max(0.1, length(wind));
  const windHat = normalize(wind);
  const crossHat = { x: -windHat.y, y: windHat.x };
  let velocity = { ...wind };

  for (const obstacle of obstacles) {
    const influencePad = Math.max(18, obstacle.span * 1.6);
    if (
      point.x < obstacle.minX - influencePad
      || point.x > obstacle.maxX + influencePad
      || point.y < obstacle.minY - influencePad
      || point.y > obstacle.maxY + influencePad
    ) {
      continue;
    }

    const rel = { x: point.x - obstacle.center.x, y: point.y - obstacle.center.y };
    const along = rel.x * windHat.x + rel.y * windHat.y;
    const cross = rel.x * crossHat.x + rel.y * crossHat.y;

    if (pointInPolygon(point, obstacle.footprint)) {
      return { x: 0, y: 0 };
    }

    let nearest = { dist: Infinity, point: obstacle.center };
    for (let i = 0; i < obstacle.footprint.length; i += 1) {
      const a = obstacle.footprint[i];
      const b = obstacle.footprint[(i + 1) % obstacle.footprint.length];
      const candidate = distanceToSegment(point, a, b);
      if (candidate.dist < nearest.dist) nearest = candidate;
    }

    if (nearest.dist < 10) {
      const normal = normalize({ x: point.x - nearest.point.x, y: point.y - nearest.point.y });
      const wallFactor = 1 - nearest.dist / 10;
      velocity.x += normal.x * speed * wallFactor * 0.95;
      velocity.y += normal.y * speed * wallFactor * 0.95;
      velocity.x += crossHat.x * Math.sign(cross) * speed * wallFactor * 0.12;
      velocity.y += crossHat.y * Math.sign(cross) * speed * wallFactor * 0.12;
    }

    if (along > 0 && Math.abs(cross) < Math.max(3, obstacle.span * 0.45)) {
      const wakeFalloff = Math.exp(-along / Math.max(14, obstacle.span * 1.6));
      const wakeWidth = Math.exp(-Math.abs(cross) / Math.max(2.5, obstacle.span * 0.3));
      const deficit = wakeFalloff * wakeWidth * 0.5;
      velocity.x -= windHat.x * speed * deficit;
      velocity.y -= windHat.y * speed * deficit;
    }
  }

  return velocity;
}

function computeEnergyRate(velocity: Vec2, wind: Vec2): number {
  const droneSpeed = length(velocity);
  const windSpeed = length(wind);
  const relativeWind = { x: velocity.x - wind.x, y: velocity.y - wind.y };
  const relativeSpeed = length(relativeWind);
  const directionFactor = droneSpeed > 0.25 && windSpeed > 0.25
    ? Math.max(0, (velocity.x * wind.x + velocity.y * wind.y) / (droneSpeed * windSpeed))
    : 0;
  const headwindPenalty = (1 - directionFactor) * windSpeed * 1.2;
  return 8 + droneSpeed * 0.9 + relativeSpeed * 1.6 + headwindPenalty;
}

function worldToCanvas(
  point: Vec2,
  width: number,
  height: number,
  bounds: FlowField2DResponse['field']['bounds'],
) {
  const worldWidth = bounds.max_x - bounds.min_x;
  const worldHeight = bounds.max_y - bounds.min_y;
  const scale = Math.min(width / worldWidth, height / worldHeight);
  const offsetX = (width - worldWidth * scale) * 0.5;
  const offsetY = (height - worldHeight * scale) * 0.5;
  const x = offsetX + (point.x - bounds.min_x) * scale;
  const y = height - offsetY - (point.y - bounds.min_y) * scale;
  return { x, y };
}

function canvasToWorld(
  point: Vec2,
  width: number,
  height: number,
  bounds: FlowField2DResponse['field']['bounds'],
) {
  const worldWidth = bounds.max_x - bounds.min_x;
  const worldHeight = bounds.max_y - bounds.min_y;
  const scale = Math.min(width / worldWidth, height / worldHeight);
  const offsetX = (width - worldWidth * scale) * 0.5;
  const offsetY = (height - worldHeight * scale) * 0.5;
  const x = bounds.min_x + (point.x - offsetX) / scale;
  const y = bounds.min_y + (height - offsetY - point.y) / scale;
  return { x, y };
}

function drawDrone(ctx: CanvasRenderingContext2D, canvasPoint: Vec2, heading: number) {
  ctx.save();
  ctx.translate(canvasPoint.x, canvasPoint.y);
  ctx.rotate(-heading + Math.PI / 2);
  ctx.beginPath();
  ctx.moveTo(0, -14);
  ctx.lineTo(10, 10);
  ctx.lineTo(0, 5);
  ctx.lineTo(-10, 10);
  ctx.closePath();
  ctx.fillStyle = '#fff3bf';
  ctx.strokeStyle = '#1b1b1b';
  ctx.lineWidth = 2;
  ctx.fill();
  ctx.stroke();
  ctx.restore();
}

function createParticle(bounds: FlowField2DResponse['field']['bounds'], flow: FlowField2DResponse): FlowParticle {
  const windHat = normalize({ x: flow.inlet.ux, y: flow.inlet.uy });
  const edgeChoice = Math.random();
  let point: Vec2;
  if (Math.abs(windHat.x) > Math.abs(windHat.y)) {
    const x = windHat.x >= 0 ? bounds.min_x + 8 : bounds.max_x - 8;
    point = { x, y: bounds.min_y + Math.random() * (bounds.max_y - bounds.min_y) };
  } else {
    const y = windHat.y >= 0 ? bounds.min_y + 8 : bounds.max_y - 8;
    point = { x: bounds.min_x + Math.random() * (bounds.max_x - bounds.min_x), y };
  }
  if (edgeChoice > 0.8) {
    point = {
      x: bounds.min_x + Math.random() * (bounds.max_x - bounds.min_x),
      y: bounds.min_y + Math.random() * (bounds.max_y - bounds.min_y),
    };
  }
  return {
    position: point,
    age: Math.random() * 4,
    life: 4 + Math.random() * 5,
    hue: 185 + Math.random() * 35,
    width: 0.6 + Math.random() * 1.8,
  };
}

function resetWorld(flow: FlowField2DResponse | null): WorldState {
  if (!flow) {
    return { position: { x: 0, y: 0 }, velocity: { x: 0, y: 0 }, heading: 0, energyUsed: 0 };
  }

  const { bounds } = flow.field;
  const candidates = [
    { x: 0, y: 0 },
    { x: 0, y: bounds.max_y * 0.35 },
    { x: 0, y: bounds.min_y * 0.35 },
    { x: bounds.min_x * 0.35, y: 0 },
    { x: bounds.max_x * 0.35, y: 0 },
  ];

  const isClear = (point: Vec2) => !flow.buildings.some((building) => pointInPolygon(point, building.footprint));
  const found = candidates.find(isClear)
    ?? (() => {
      for (let y = bounds.min_y + 30; y <= bounds.max_y - 30; y += 30) {
        for (let x = bounds.min_x + 30; x <= bounds.max_x - 30; x += 30) {
          const point = { x, y };
          if (isClear(point)) return point;
        }
      }
      return { x: bounds.min_x + 30, y: bounds.min_y + 30 };
    })();

  return {
    position: found,
    velocity: { x: 0, y: 0 },
    heading: 0,
    energyUsed: 0,
  };
}

export default function TopDownGame({ flow, showFlowAnimation, onTelemetry }: TopDownGameProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const animationRef = useRef<number | null>(null);
  const lastTimeRef = useRef<number>(0);
  const worldRef = useRef<WorldState>(resetWorld(flow));
  const keysRef = useRef<Set<string>>(new Set());
  const particlesRef = useRef<FlowParticle[]>([]);
  const flowLayerRef = useRef<HTMLCanvasElement | null>(null);

  const buildings = flow?.buildings ?? [];
  const obstacles = useMemo(() => buildObstacles(buildings), [buildings]);
  const bounds = flow?.field.bounds;
  const viewportBounds = useMemo(() => {
    if (!flow) {
      return null;
    }
    return {
      min_x: -VIEW_RADIUS_M,
      max_x: VIEW_RADIUS_M,
      min_y: -VIEW_RADIUS_M,
      max_y: VIEW_RADIUS_M,
    };
  }, [flow]);

  const fieldPreview = useMemo(() => {
    if (!flow || !viewportBounds) {
      return [];
    }

    const step = 12;
    const arrows: Array<{ x: number; y: number; vx: number; vy: number }> = [];

    for (let x = viewportBounds.min_x + step * 0.5; x <= viewportBounds.max_x; x += step) {
      for (let y = viewportBounds.min_y + step * 0.5; y <= viewportBounds.max_y; y += step) {
        if (obstacles.some((obstacle) => pointInPolygon({ x, y }, obstacle.footprint))) continue;
        const local = sampleField(flow, obstacles, { x, y });
        arrows.push({
          x,
          y,
          vx: local.x,
          vy: local.y,
        });
      }
    }

    return arrows;
  }, [flow, viewportBounds]);

  useEffect(() => {
    worldRef.current = resetWorld(flow);
    particlesRef.current = flow && viewportBounds
      ? Array.from({ length: PARTICLE_COUNT }, () => createParticle(viewportBounds, flow))
      : [];
  }, [flow]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      keysRef.current.add(event.code);
    };
    const handleKeyUp = (event: KeyboardEvent) => {
      keysRef.current.delete(event.code);
    };
    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) {
      return;
    }

    const context = canvas.getContext('2d');
    if (!context) {
      return;
    }
    const flowLayer = document.createElement('canvas');
    const flowContext = flowLayer.getContext('2d');
    if (!flowContext) {
      return;
    }
    flowLayerRef.current = flowLayer;

    const resize = () => {
      const ratio = window.devicePixelRatio || 1;
      canvas.width = Math.floor(canvas.clientWidth * ratio);
      canvas.height = Math.floor(canvas.clientHeight * ratio);
      context.setTransform(ratio, 0, 0, ratio, 0, 0);
      flowLayer.width = canvas.width;
      flowLayer.height = canvas.height;
      flowContext.setTransform(ratio, 0, 0, ratio, 0, 0);
      flowContext.clearRect(0, 0, canvas.clientWidth, canvas.clientHeight);
    };

    resize();
    window.addEventListener('resize', resize);

    const handleClick = (event: MouseEvent) => {
      if (!flow || !viewportBounds) {
        return;
      }

      const rect = canvas.getBoundingClientRect();
      const clickPoint = {
        x: event.clientX - rect.left,
        y: event.clientY - rect.top,
      };
      const worldPoint = canvasToWorld(clickPoint, canvas.clientWidth, canvas.clientHeight, viewportBounds);

      if (
        worldPoint.x < viewportBounds.min_x || worldPoint.x > viewportBounds.max_x
        || worldPoint.y < viewportBounds.min_y || worldPoint.y > viewportBounds.max_y
      ) {
        return;
      }

      const blocked = obstacles.some((obstacle) => pointInPolygon(worldPoint, obstacle.footprint));
      if (blocked) {
        return;
      }

      worldRef.current.position = worldPoint;
      worldRef.current.velocity = { x: 0, y: 0 };
    };

    canvas.addEventListener('click', handleClick);

    const frame = (time: number) => {
      animationRef.current = window.requestAnimationFrame(frame);
      const dt = Math.min(0.033, (time - lastTimeRef.current) / 1000 || 0.016);
      lastTimeRef.current = time;

      const width = canvas.clientWidth;
      const height = canvas.clientHeight;
      context.clearRect(0, 0, width, height);

      const gradient = context.createLinearGradient(0, 0, width, height);
      gradient.addColorStop(0, '#101921');
      gradient.addColorStop(1, '#05090d');
      context.fillStyle = gradient;
      context.fillRect(0, 0, width, height);

      if (!flow || !bounds || !viewportBounds) {
        context.fillStyle = '#f3f5f7';
        context.font = '600 22px ui-sans-serif, system-ui';
        context.fillText('Select a location to load geometry and wind.', 32, 48);
        return;
      }

      const world = worldRef.current;
      const input = {
        x: (keysRef.current.has('KeyD') ? 1 : 0) - (keysRef.current.has('KeyA') ? 1 : 0),
        y: (keysRef.current.has('KeyW') ? 1 : 0) - (keysRef.current.has('KeyS') ? 1 : 0),
      };
      const moveDir = normalize(input);
      world.heading = length(moveDir) > 0.1 ? Math.atan2(moveDir.y, moveDir.x) : world.heading;

      const wind = sampleField(flow, obstacles, world.position);
      world.velocity.x += moveDir.x * THRUST * dt;
      world.velocity.y += moveDir.y * THRUST * dt;
      world.velocity.x += wind.x * 0.22 * dt;
      world.velocity.y += wind.y * 0.22 * dt;
      world.velocity.x *= DRAG;
      world.velocity.y *= DRAG;

      const speed = length(world.velocity);
      if (speed > MAX_SPEED) {
        const dir = normalize(world.velocity);
        world.velocity.x = dir.x * MAX_SPEED;
        world.velocity.y = dir.y * MAX_SPEED;
      }

      const nextPosition = {
        x: world.position.x + world.velocity.x * dt * 16,
        y: world.position.y + world.velocity.y * dt * 16,
      };

      const hitsBuilding = obstacles.some((obstacle) => pointInPolygon(nextPosition, obstacle.footprint));
      if (!hitsBuilding) {
        world.position = nextPosition;
      } else {
        world.velocity.x *= -0.18;
        world.velocity.y *= -0.18;
      }

      world.position.x = clamp(world.position.x, viewportBounds.min_x + DRONE_RADIUS, viewportBounds.max_x - DRONE_RADIUS);
      world.position.y = clamp(world.position.y, viewportBounds.min_y + DRONE_RADIUS, viewportBounds.max_y - DRONE_RADIUS);

      const energyRate = computeEnergyRate(world.velocity, wind);
      world.energyUsed += energyRate * dt;

      const worldWidth = viewportBounds.max_x - viewportBounds.min_x;
      const worldHeight = viewportBounds.max_y - viewportBounds.min_y;
      const scale = Math.min(width / worldWidth, height / worldHeight);
      const offsetX = (width - worldWidth * scale) * 0.5;
      const offsetY = (height - worldHeight * scale) * 0.5;

      context.fillStyle = 'rgba(255,255,255,0.03)';
      context.fillRect(offsetX, offsetY, worldWidth * scale, worldHeight * scale);

      if (showFlowAnimation) {
        flowContext.save();
        flowContext.globalCompositeOperation = 'source-over';
        flowContext.fillStyle = 'rgba(5, 9, 13, 0.09)';
        flowContext.fillRect(0, 0, width, height);
        flowContext.globalCompositeOperation = 'lighter';
        for (const particle of particlesRef.current) {
          const local = sampleField(flow, obstacles, particle.position);
          const mag = length(local);
          particle.position.x += local.x * dt * 8.5;
          particle.position.y += local.y * dt * 8.5;
          particle.age += dt;

          const outOfBounds = (
            particle.position.x < viewportBounds.min_x || particle.position.x > viewportBounds.max_x
            || particle.position.y < viewportBounds.min_y || particle.position.y > viewportBounds.max_y
          );
          const blocked = obstacles.some((obstacle) => pointInPolygon(particle.position, obstacle.footprint));
          if (outOfBounds || blocked || particle.age > particle.life) {
            const next = createParticle(viewportBounds, flow);
            particle.position = next.position;
            particle.age = next.age;
            particle.life = next.life;
            particle.hue = next.hue;
            particle.width = next.width;
            continue;
          }

          const start = worldToCanvas(particle.position, width, height, viewportBounds);
          const prev = worldToCanvas(
            { x: particle.position.x - local.x * (1.4 + mag * 0.08), y: particle.position.y - local.y * (1.4 + mag * 0.08) },
            width,
            height,
            viewportBounds,
          );
          const alpha = Math.min(0.35, 0.08 + mag / 18);
          flowContext.strokeStyle = `hsla(${particle.hue}, 95%, ${60 + Math.min(20, mag * 2)}%, ${alpha})`;
          flowContext.lineWidth = particle.width + Math.min(1.8, mag * 0.08);
          flowContext.beginPath();
          flowContext.moveTo(prev.x, prev.y);
          flowContext.lineTo(start.x, start.y);
          flowContext.stroke();

          if (mag > 2.5) {
            flowContext.fillStyle = `hsla(${particle.hue}, 100%, 78%, ${Math.min(0.22, alpha * 0.8)})`;
            flowContext.beginPath();
            flowContext.arc(start.x, start.y, 1.2 + Math.min(1.8, mag * 0.06), 0, Math.PI * 2);
            flowContext.fill();
          }
        }
        flowContext.restore();
        context.drawImage(flowLayer, 0, 0, width, height);
      } else {
        flowContext.clearRect(0, 0, width, height);
      }

      const windRibbonCount = 16;
      for (let i = 0; i < windRibbonCount; i += 1) {
        const ribbonY = offsetY + ((i + 0.5) / windRibbonCount) * worldHeight * scale;
        const shimmer = ((time * 0.04) + i * 17) % (worldWidth * scale + 140);
        context.strokeStyle = 'rgba(165, 232, 255, 0.055)';
        context.lineWidth = 1;
        context.beginPath();
        context.moveTo(offsetX + shimmer - 90, ribbonY);
        context.lineTo(offsetX + shimmer, ribbonY);
        context.stroke();
      }

      context.strokeStyle = 'rgba(255,255,255,0.08)';
      context.lineWidth = 1;
      for (let i = 1; i < 8; i += 1) {
        const x = offsetX + ((worldWidth * scale) / 8) * i;
        const y = offsetY + ((worldHeight * scale) / 8) * i;
        context.beginPath();
        context.moveTo(x, offsetY);
        context.lineTo(x, offsetY + worldHeight * scale);
        context.stroke();
        context.beginPath();
        context.moveTo(offsetX, y);
        context.lineTo(offsetX + worldWidth * scale, y);
        context.stroke();
      }

      fieldPreview.forEach((arrow) => {
        const origin = worldToCanvas({ x: arrow.x, y: arrow.y }, width, height, viewportBounds);
        const mag = Math.hypot(arrow.vx, arrow.vy);
        if (mag < 0.25) return;
        const arrowScale = Math.min(18, 6 + mag * 1.8);
        const dir = normalize({ x: arrow.vx, y: arrow.vy });
        const tip = { x: origin.x + dir.x * arrowScale, y: origin.y - dir.y * arrowScale };
        context.strokeStyle = `hsla(${190 - Math.min(120, mag * 10)}, 92%, 70%, 0.78)`;
        context.lineWidth = 1.35;
        context.beginPath();
        context.moveTo(origin.x, origin.y);
        context.lineTo(tip.x, tip.y);
        context.stroke();
        context.beginPath();
        context.moveTo(tip.x, tip.y);
        context.lineTo(tip.x - dir.x * 4.5 - dir.y * 3, tip.y + dir.y * 4.5 - dir.x * 3);
        context.lineTo(tip.x - dir.x * 4.5 + dir.y * 3, tip.y + dir.y * 4.5 + dir.x * 3);
        context.closePath();
        context.fillStyle = context.strokeStyle;
        context.fill();
      });

      buildings.forEach((building: BuildingData) => {
        if (!building.footprint.length) return;
        context.beginPath();
        building.footprint.forEach(([x, y], index) => {
          const point = worldToCanvas({ x, y }, width, height, viewportBounds);
          if (index === 0) context.moveTo(point.x, point.y);
          else context.lineTo(point.x, point.y);
        });
        context.closePath();
        context.fillStyle = '#3b4b57';
        context.strokeStyle = '#a2bdcf';
        context.lineWidth = 1.2;
        context.fill();
        context.stroke();
      });

      const droneCanvasPoint = worldToCanvas(world.position, width, height, viewportBounds);
      drawDrone(context, droneCanvasPoint, world.heading);

      const northOrigin = { x: offsetX + 28, y: offsetY + 54 };
      context.strokeStyle = '#ffffff';
      context.lineWidth = 2;
      context.beginPath();
      context.moveTo(northOrigin.x, northOrigin.y);
      context.lineTo(northOrigin.x, northOrigin.y - 28);
      context.stroke();
      context.beginPath();
      context.moveTo(northOrigin.x, northOrigin.y - 28);
      context.lineTo(northOrigin.x - 5, northOrigin.y - 20);
      context.lineTo(northOrigin.x + 5, northOrigin.y - 20);
      context.closePath();
      context.fillStyle = '#ffffff';
      context.fill();
      context.fillStyle = 'rgba(255,255,255,0.85)';
      context.font = '600 13px ui-sans-serif, system-ui';
      context.fillText('N', northOrigin.x - 5, northOrigin.y - 36);

      const windDirRad = Math.atan2(wind.y, wind.x);
      let windDirDeg = 90 - (windDirRad * 180) / Math.PI;
      if (windDirDeg < 0) windDirDeg += 360;

      onTelemetry({
        droneSpeed: length(world.velocity),
        localWindSpeed: length(wind),
        localWindDirDeg: windDirDeg,
        energyRate,
        energyUsed: world.energyUsed,
        headingDeg: ((world.heading * 180) / Math.PI + 360) % 360,
        position: { ...world.position },
      });
    };

    animationRef.current = window.requestAnimationFrame(frame);

    return () => {
      window.removeEventListener('resize', resize);
      canvas.removeEventListener('click', handleClick);
      flowLayerRef.current = null;
      if (animationRef.current !== null) {
        window.cancelAnimationFrame(animationRef.current);
      }
    };
  }, [bounds, buildings, fieldPreview, flow, obstacles, onTelemetry, showFlowAnimation, viewportBounds]);

  return <canvas ref={canvasRef} className="game-canvas" />;
}
