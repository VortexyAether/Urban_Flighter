import { useCallback, useEffect, useRef, useState } from 'react';
import EnergyGraph, { type EnergyGraphScale } from './components/EnergyGraph';
import LocationPicker from './components/LocationPicker';
import MissionIntelligence from './components/MissionIntelligence';
import Simulation3D from './components/Simulation3D';
import TopDownGame, { type FlowVisualization, type Telemetry } from './components/TopDownGame';
import { fetchAeroJaxDemoFlow, fetchFlowField2D, type FlowField2DResponse } from './api';
import './App.css';

const DEFAULT_LAT = 37.451448;
const DEFAULT_LON = 126.6515423;
const GEOMETRY_RADIUS_M = 400;
const SOLVE_RADIUS_M = 400;
const DEFAULT_GRID = 1;
type ViewMode = '2d' | '3d';
type SimulationMode = ViewMode | 'real';

function describeAeroJaxSource(flow: FlowField2DResponse) {
  const timestep = flow.source?.snapshot_t;
  const latest = flow.source?.is_latest ? 'latest ' : '';
  const timestepText = timestep !== undefined ? `, ${latest}t=${timestep.toFixed(0)}` : '';
  return `${flow.buildings.length} Incheon structures, ${flow.field.nx}x${flow.field.ny} down-sampled velocity grid${timestepText}.`;
}

function App() {
  const [location, setLocation] = useState<{ lat: number; lon: number }>({ lat: DEFAULT_LAT, lon: DEFAULT_LON });
  const [flow, setFlow] = useState<FlowField2DResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState('Select a district or click the map to load a 2D flow field.');
  const [showFlowAnimation, setShowFlowAnimation] = useState(true);
  const [simulationMode, setSimulationMode] = useState<SimulationMode>('2d');
  const [cfdVisualization, setCfdVisualization] = useState<FlowVisualization>('both');
  const [energyGraphScale, setEnergyGraphScale] = useState<EnergyGraphScale>('focus');
  const [cfdWindScale, setCfdWindScale] = useState(18);
  const [energyHistory, setEnergyHistory] = useState<number[]>(() => Array.from({ length: 90 }, () => 0));
  const [telemetry, setTelemetry] = useState<Telemetry>({
    droneSpeed: 0,
    localWindSpeed: 0,
    localWindDirDeg: 0,
    energyRate: 0,
    energyUsed: 0,
    headingDeg: 0,
    position: { x: 0, y: 0 },
  });
  const historyTickRef = useRef(0);
  const requestIdRef = useRef(0);
  const flowCacheRef = useRef<Map<string, FlowField2DResponse>>(new Map());

  const loadFlow = useCallback(async (lat: number, lon: number) => {
    const requestId = requestIdRef.current + 1;
    requestIdRef.current = requestId;
    const cacheKey = `${lat.toFixed(5)},${lon.toFixed(5)},${GEOMETRY_RADIUS_M},${SOLVE_RADIUS_M},${DEFAULT_GRID}`;

    const cachedFlow = flowCacheRef.current.get(cacheKey);
    if (cachedFlow) {
      setLocation({ lat, lon });
      setFlow(cachedFlow);
      setEnergyHistory(Array.from({ length: 90 }, () => 0));
      setStatus(
        `Loaded ${cachedFlow.buildings.length} cached buildings. Inlet ${cachedFlow.weather.wind_speed.toFixed(1)} m/s from ${cachedFlow.weather.wind_deg.toFixed(0)}°.`
      );
      return;
    }

    setLoading(true);
    setStatus('Loading geometry and real-time wind...');
    try {
      const nextFlow = await fetchFlowField2D(lat, lon, GEOMETRY_RADIUS_M, SOLVE_RADIUS_M, DEFAULT_GRID);
      if (requestId !== requestIdRef.current) {
        return;
      }

      if (nextFlow.buildings.length === 0) {
        setFlow((prevFlow) => prevFlow ?? nextFlow);
        setStatus('No buildings found for that point. Keeping the previous geometry visible.');
        return;
      }

      flowCacheRef.current.set(cacheKey, nextFlow);
      setFlow(nextFlow);
      setEnergyHistory(Array.from({ length: 90 }, () => 0));
      setStatus(
        `Loaded ${nextFlow.buildings.length} buildings in ${GEOMETRY_RADIUS_M}m. Inlet ${nextFlow.weather.wind_speed.toFixed(1)} m/s from ${nextFlow.weather.wind_deg.toFixed(0)}°.`
      );
    } catch (e) {
      if (requestId === requestIdRef.current) {
        setStatus('Failed to load geometry/wind. Keeping the previous geometry visible.');
      }
      console.error(e);
    } finally {
      if (requestId === requestIdRef.current) {
        setLoading(false);
      }
    }
  }, []);

  const loadAeroJaxDemo = useCallback(async () => {
    const requestId = requestIdRef.current + 1;
    requestIdRef.current = requestId;
    const cacheKey = 'aerojax-demo:latest:stride8';

    const cachedFlow = flowCacheRef.current.get(cacheKey);
    if (cachedFlow) {
      setFlow(cachedFlow);
      setEnergyHistory(Array.from({ length: 90 }, () => 0));
      setStatus(`Loaded AeroJAX CFD demo: ${describeAeroJaxSource(cachedFlow)}`);
      return;
    }

    setLoading(true);
    setStatus('Loading AeroJAX raw CFD snapshot...');
    try {
      const nextFlow = await fetchAeroJaxDemoFlow(8);
      if (requestId !== requestIdRef.current) {
        return;
      }

      flowCacheRef.current.set(cacheKey, nextFlow);
      setFlow(nextFlow);
      setEnergyHistory(Array.from({ length: 90 }, () => 0));
      setStatus(`Loaded AeroJAX CFD demo: ${describeAeroJaxSource(nextFlow)}`);
    } catch (e) {
      if (requestId === requestIdRef.current) {
        setStatus('Failed to load AeroJAX demo snapshot. Keeping the previous field visible.');
      }
      console.error(e);
    } finally {
      if (requestId === requestIdRef.current) {
        setLoading(false);
      }
    }
  }, []);

  useEffect(() => {
    void loadFlow(DEFAULT_LAT, DEFAULT_LON);
  }, [loadFlow]);

  useEffect(() => {
    const now = Date.now();
    if (now - historyTickRef.current < 150) {
      return;
    }

    setEnergyHistory((prev) => [...prev.slice(1), telemetry.energyRate]);
    historyTickRef.current = now;
  }, [telemetry.energyRate]);

  const handleLocationSelect = (newLat: number, newLon: number) => {
    setLocation({ lat: newLat, lon: newLon });
    if (simulationMode !== 'real') {
      void loadFlow(newLat, newLon);
    }
  };

  const handlePreset = (lat: number, lon: number) => {
    setLocation({ lat, lon });
    if (simulationMode !== 'real') {
      void loadFlow(lat, lon);
    }
  };

  const handleSimulationModeSelect = (nextMode: SimulationMode) => {
    setSimulationMode(nextMode);
    if (nextMode === 'real') {
      void loadAeroJaxDemo();
      return;
    }
    void loadFlow(location.lat, location.lon);
  };

  const handleReload = () => {
    if (simulationMode === 'real') {
      void loadAeroJaxDemo();
      return;
    }
    void loadFlow(location.lat, location.lon);
  };

  const viewMode: ViewMode = simulationMode === '3d' ? '3d' : '2d';
  const isRealMode = simulationMode === 'real';
  const buildingCount = flow?.buildings.length ?? 0;
  const windSpeed = isRealMode ? telemetry.localWindSpeed : flow?.weather.wind_speed ?? telemetry.localWindSpeed;
  const modelStatus = loading ? 'SYNCING' : flow ? 'LIVE' : 'STANDBY';
  const solverLabel = isRealMode ? 'AEROJAX CFD' : 'CG DRAG MODEL';
  const modeLabel = isRealMode ? 'REAL CFD' : `${viewMode.toUpperCase()} VIEW`;
  const cfdLayerLabel = cfdVisualization === 'both' ? 'COLOR + STREAM' : cfdVisualization.toUpperCase();

  return (
    <div className="app-shell">
      {viewMode === '2d' ? (
        <TopDownGame
          flow={flow}
          showFlowAnimation={showFlowAnimation}
          flowVisualization={isRealMode ? cfdVisualization : 'arrows'}
          windScale={isRealMode ? cfdWindScale : 1}
          onTelemetry={setTelemetry}
        />
      ) : (
        <Simulation3D flow={flow} showFlowAnimation={showFlowAnimation} onTelemetry={setTelemetry} />
      )}

      <header className="command-bar">
        <div className="command-title">
          <span>Urban Flighter</span>
          <strong>Drag-Aware Drone Simulator</strong>
        </div>
        <div className="command-pills" aria-label="Simulation status">
          <span data-state={modelStatus.toLowerCase()}>{modelStatus}</span>
          <span>{modeLabel}</span>
          <span>{solverLabel}</span>
          {isRealMode && <span>{cfdLayerLabel}</span>}
          <span>{buildingCount} STRUCTURES</span>
          <span>{windSpeed.toFixed(1)} M/S WIND</span>
          <span>{telemetry.energyRate.toFixed(1)} U/S BURN</span>
        </div>
      </header>

      <aside className="panel panel-map">
        <div className="panel-eyebrow">Region Selector</div>
        <h1>Urban Flighter {isRealMode ? 'CFD' : viewMode.toUpperCase()}</h1>
        <div className="mode-selector" aria-label="Simulation mode">
          <label className={simulationMode === '2d' ? 'active' : ''}>
            <input
              type="checkbox"
              checked={simulationMode === '2d'}
              onChange={() => handleSimulationModeSelect('2d')}
            />
            <span>
              <strong>2D</strong>
              <small>CG domain</small>
            </span>
          </label>
          <label className={simulationMode === '3d' ? 'active' : ''}>
            <input
              type="checkbox"
              checked={simulationMode === '3d'}
              onChange={() => handleSimulationModeSelect('3d')}
            />
            <span>
              <strong>3D</strong>
              <small>Map + CG model</small>
            </span>
          </label>
          <label className={simulationMode === 'real' ? 'active real' : 'real'}>
            <input
              type="checkbox"
              checked={simulationMode === 'real'}
              onChange={() => handleSimulationModeSelect('real')}
            />
            <span>
              <strong>For real?</strong>
              <small>AeroJAX CFD</small>
            </span>
          </label>
        </div>
        <div className="map-container-wrapper">
          <LocationPicker
            initialLat={location.lat}
            initialLon={location.lon}
            onLocationSelect={handleLocationSelect}
          />
        </div>
        <div className="city-presets">
          <button type="button" onClick={() => handlePreset(40.7128, -74.0060)} disabled={isRealMode}>NYC</button>
          <button type="button" onClick={() => handlePreset(48.8566, 2.3522)} disabled={isRealMode}>Paris</button>
          <button type="button" onClick={() => handlePreset(35.6762, 139.6503)} disabled={isRealMode}>Tokyo</button>
          <button type="button" onClick={() => handlePreset(DEFAULT_LAT, DEFAULT_LON)} disabled={isRealMode}>Inha</button>
        </div>
        <div className="coords">
          <div>
            <span>Lat</span>
            <strong>{location.lat.toFixed(4)}</strong>
          </div>
          <div>
            <span>Lon</span>
            <strong>{location.lon.toFixed(4)}</strong>
          </div>
        </div>
        <button type="button" className="reload-btn" onClick={handleReload} disabled={loading}>
          {loading ? 'Solving...' : isRealMode ? 'Reload AeroJAX Field' : 'Reload Flow'}
        </button>
        <p className="status-bar">{status}</p>
      </aside>

      <aside className="panel panel-hud">
        <div className="panel-eyebrow">Aero Command</div>
        <label className="flow-toggle">
          <input
            type="checkbox"
            checked={showFlowAnimation}
            onChange={(event) => setShowFlowAnimation(event.target.checked)}
          />
          <span>{isRealMode ? 'CFD Layer' : viewMode === '2d' ? 'Flow Animation' : 'Camera Follow'}</span>
        </label>
        {isRealMode && (
          <div className="cfd-layer-control" aria-label="CFD visualization">
            <button
              type="button"
              className={cfdVisualization === 'streamlines' ? 'active' : ''}
              onClick={() => setCfdVisualization('streamlines')}
            >
              Stream
            </button>
            <button
              type="button"
              className={cfdVisualization === 'colormap' ? 'active' : ''}
              onClick={() => setCfdVisualization('colormap')}
            >
              Color
            </button>
            <button
              type="button"
              className={cfdVisualization === 'both' ? 'active' : ''}
              onClick={() => setCfdVisualization('both')}
            >
              Both
            </button>
          </div>
        )}
        {isRealMode && (
          <div className="cfd-wind-scale">
            <div>
              <span>CFD Wind Scale</span>
              <strong>x{cfdWindScale.toFixed(1)}</strong>
            </div>
            <input
              type="range"
              min="1"
              max="30"
              step="1"
              value={cfdWindScale}
              onChange={(event) => setCfdWindScale(Number(event.target.value))}
            />
          </div>
        )}
        <div className="hud-grid">
          <div className="metric-card">
            <span>Drone Speed</span>
            <strong>{telemetry.droneSpeed.toFixed(1)} m/s</strong>
          </div>
          <div className="metric-card">
            <span>{isRealMode ? 'Scaled Wind' : 'Local Wind'}</span>
            <strong>{telemetry.localWindSpeed.toFixed(1)} m/s</strong>
          </div>
          <div className="metric-card">
            <span>Wind Dir</span>
            <strong>{telemetry.localWindDirDeg.toFixed(0)}°</strong>
          </div>
          <div className="metric-card">
            <span>Heading</span>
            <strong>{telemetry.headingDeg.toFixed(0)}°</strong>
          </div>
          <div className="metric-card wide">
            <span>Energy Burn</span>
            <strong>{telemetry.energyRate.toFixed(1)} u/s</strong>
          </div>
          <div className="metric-card wide accent">
            <span>Total Energy</span>
            <strong>{telemetry.energyUsed.toFixed(0)} u</strong>
          </div>
        </div>
        <EnergyGraph
          history={energyHistory}
          scale={isRealMode ? energyGraphScale : 'absolute'}
          adjustable={isRealMode}
          onScaleChange={setEnergyGraphScale}
        />
        <MissionIntelligence
          flow={flow}
          telemetry={telemetry}
          energyHistory={energyHistory}
          viewMode={viewMode}
        />
        <div className="legend">
          {viewMode === '2d' ? (
            <>
              <p>Controls: `WASD` moves directly in screen directions.</p>
              <p>{isRealMode ? 'AeroJAX velocity grid drives local wind, wake regions, and energy burn.' : 'Screen stays north-up. Real-time wind only changes inlet flow.'}</p>
              <p>{isRealMode ? 'Color shows velocity magnitude; streamlines trace the CFD vector field.' : 'Dense arrows show the local flow direction and magnitude.'}</p>
              <p>{isRealMode ? `Raw CFD is scaled by x${cfdWindScale.toFixed(1)} for the flight energy scenario.` : 'Flow animation toggle controls the moving particle layer.'}</p>
            </>
          ) : (
            <>
              <p>Controls: `WASD` flies forward/turns, arrow keys control pitch.</p>
              <p>3D uses the same building footprint and inlet wind data as 2D.</p>
              <p>Flow animation toggle switches camera follow on/off.</p>
              <p>Drag, energy, arrows, and contour are CG model approximations.</p>
            </>
          )}
          <p>Geometry {flow?.domain.geometry_radius_m.toFixed(0) ?? '--'}m, solver {flow?.domain.solve_radius_m.toFixed(0) ?? '--'}m.</p>
          <p>
            Solver: {flow?.weather.wind_speed.toFixed(1) ?? '--'} m/s from {flow?.weather.wind_deg.toFixed(0) ?? '--'}°
          </p>
        </div>
      </aside>
    </div>
  );
}

export default App;
