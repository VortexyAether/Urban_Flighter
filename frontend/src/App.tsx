import { useEffect, useRef, useState } from 'react';
import EnergyGraph from './components/EnergyGraph';
import LocationPicker from './components/LocationPicker';
import TopDownGame, { type Telemetry } from './components/TopDownGame';
import { fetchFlowField2D, type FlowField2DResponse } from './api';
import './App.css';

const DEFAULT_LAT = 37.4979;
const DEFAULT_LON = 127.0276;
const GEOMETRY_RADIUS_M = 200;
const SOLVE_RADIUS_M = 200;
const DEFAULT_GRID = 1;

function App() {
  const [location, setLocation] = useState<{ lat: number; lon: number }>({ lat: DEFAULT_LAT, lon: DEFAULT_LON });
  const [flow, setFlow] = useState<FlowField2DResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState('Select a district or click the map to load a 2D flow field.');
  const [showFlowAnimation, setShowFlowAnimation] = useState(true);
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

  const loadFlow = async (lat: number, lon: number) => {
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
  };

  useEffect(() => {
    void loadFlow(location.lat, location.lon);
  }, []);

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
    void loadFlow(newLat, newLon);
  };

  const handlePreset = (lat: number, lon: number) => {
    setLocation({ lat, lon });
    void loadFlow(lat, lon);
  };

  return (
    <div className="app-shell">
      <TopDownGame flow={flow} showFlowAnimation={showFlowAnimation} onTelemetry={setTelemetry} />

      <aside className="panel panel-map">
        <div className="panel-eyebrow">Region Selector</div>
        <h1>Urban Flighter 2D</h1>
        <div className="map-container-wrapper">
          <LocationPicker
            initialLat={location.lat}
            initialLon={location.lon}
            onLocationSelect={handleLocationSelect}
          />
        </div>
        <div className="city-presets">
          <button type="button" onClick={() => handlePreset(40.7128, -74.0060)}>NYC</button>
          <button type="button" onClick={() => handlePreset(48.8566, 2.3522)}>Paris</button>
          <button type="button" onClick={() => handlePreset(35.6762, 139.6503)}>Tokyo</button>
          <button type="button" onClick={() => handlePreset(DEFAULT_LAT, DEFAULT_LON)}>Seoul</button>
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
        <button type="button" className="reload-btn" onClick={() => void loadFlow(location.lat, location.lon)} disabled={loading}>
          {loading ? 'Solving...' : 'Reload Flow'}
        </button>
        <p className="status-bar">{status}</p>
      </aside>

      <aside className="panel panel-hud">
        <div className="panel-eyebrow">Energy HUD</div>
        <label className="flow-toggle">
          <input
            type="checkbox"
            checked={showFlowAnimation}
            onChange={(event) => setShowFlowAnimation(event.target.checked)}
          />
          <span>Flow Animation</span>
        </label>
        <div className="hud-grid">
          <div className="metric-card">
            <span>Drone Speed</span>
            <strong>{telemetry.droneSpeed.toFixed(1)} m/s</strong>
          </div>
          <div className="metric-card">
            <span>Local Wind</span>
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
        <EnergyGraph history={energyHistory} />
        <div className="legend">
          <p>Controls: `WASD` moves directly in screen directions.</p>
          <p>Screen stays north-up. Real-time wind only changes inlet flow.</p>
          <p>Dense arrows show the local flow direction and magnitude.</p>
          <p>Flow animation toggle controls the moving particle layer.</p>
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
