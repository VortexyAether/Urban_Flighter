import { useState, useEffect } from 'react';
import * as THREE from 'three';
import ThreeCanvas from './components/ThreeCanvas';
import CityModel from './components/CityModel';
import LocationPicker from './components/LocationPicker';
import StreamlineParticles from './components/StreamlineParticles';
import CircularBoundary from './components/CircularBoundary';
import Aircraft, { type AircraftMetrics } from './components/Aircraft';
import AircraftDashboard from './components/AircraftDashboard';
import CameraFollow from './components/CameraFollow';
import { fetchMapData, fetchWeather, type MapData } from './api';
import './App.css';
// Default Location: Gangnam Station
const DEFAULT_LAT = 37.4979;
const DEFAULT_LON = 127.0276;

function App() {
  const [location, setLocation] = useState<{ lat: number; lon: number }>({ lat: DEFAULT_LAT, lon: DEFAULT_LON });
  const [mapData, setMapData] = useState<MapData | null>(null);
  const [weather, setWeather] = useState<{ speed: number; deg: number }>({ speed: 10, deg: 45 });
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState("Ready to fly");
  const [aircraftMetrics, setAircraftMetrics] = useState<AircraftMetrics | null>(null);

  const loadCityAndWeather = async () => {
    setLoading(true);
    setStatus("Fetching city data and weather...");
    try {
      // 1. Fetch Map Data (1500m radius - buildings only)
      const data = await fetchMapData(location.lat, location.lon, 1500);

      // 2. Fetch Weather Data (Simulation or Real)
      const weatherData = await fetchWeather(location.lat, location.lon);
      console.log("Weather Data:", weatherData);

      if (data && data.features) {
        setMapData(data);

        // Update weather state if available
        if (weatherData && weatherData.real) {
          setWeather({
            speed: weatherData.real.wind_speed,
            deg: weatherData.real.wind_deg
          });
        }

        setStatus(`Loaded ${data.count} buildings. Wind: ${weatherData?.real?.wind_speed?.toFixed(1) || 10} m/s`);
      } else {
        setStatus("No buildings found.");
      }
    } catch (e) {
      setStatus("Error loading data.");
      console.error(e);
    }
    setLoading(false);
  };

  useEffect(() => {
    loadCityAndWeather();
  }, []); // Initial load

  const handleLocationSelect = (newLat: number, newLon: number) => {
    setLocation({ lat: newLat, lon: newLon });
  };

  return (
    <div className="App">
      <ThreeCanvas>
        {/* Camera follows aircraft in third-person */}
        <CameraFollow
          target={aircraftMetrics?.position || new THREE.Vector3(0, 50, 0)}
          yaw={aircraftMetrics?.yaw || 0}
          pitch={aircraftMetrics?.pitch || 0}
          enabled={true}
        />

        <CircularBoundary />
        <CityModel buildings={mapData?.features || []} />

        {/* Wind Visualization - Streamline Particles */}
        <StreamlineParticles
          globalWindSpeed={weather.speed}
          globalWindDir={weather.deg}
          buildings={mapData?.features || []}
        />

        {/* Aircraft */}
        <Aircraft
          globalWindSpeed={weather.speed}
          globalWindDir={weather.deg}
          buildings={mapData?.features || []}
          onMetricsUpdate={setAircraftMetrics}
        />
      </ThreeCanvas>

      {/* Aircraft Dashboard */}
      <AircraftDashboard metrics={aircraftMetrics} />

      <div className="ui-overlay">
        <div className="ui-content-frame">
          <h1>Urban Flighter</h1>

          <div className="map-container-wrapper">
            <LocationPicker
              initialLat={location.lat}
              initialLon={location.lon}
              onLocationSelect={handleLocationSelect}
            />
          </div>

          <div className="controls">
            <div className="city-presets">
              <button onClick={() => setLocation({ lat: 40.7128, lon: -74.0060 })}>NYC</button>
              <button onClick={() => setLocation({ lat: 48.8566, lon: 2.3522 })}>PARIS</button>
              <button onClick={() => setLocation({ lat: 35.6762, lon: 139.6503 })}>TOKYO</button>
              <button onClick={() => setLocation({ lat: DEFAULT_LAT, lon: DEFAULT_LON })}>SEOUL</button>
            </div>
            <label>LATITUDE <input type="number" step="0.0001" value={location.lat} readOnly /></label>
            <label>LONGITUDE <input type="number" step="0.0001" value={location.lon} readOnly /></label>
            <button className="teleport-btn" onClick={loadCityAndWeather} disabled={loading}>
              {loading ? 'INVOKING CITY...' : 'TELEPORT'}
            </button>
          </div>
          <div className="status-bar">
            {status}
          </div>

          <div className="wind-indicator">
            <span>💨 WIND:</span>
            <strong>{weather.speed.toFixed(1)} m/s</strong>
            <span style={{ fontSize: '0.8em', color: '#999' }}>({weather.deg.toFixed(0)}°)</span>
          </div>
        </div>
      </div>
    </div>
  );
}

export default App;
