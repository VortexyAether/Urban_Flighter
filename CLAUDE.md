# CLAUDE.md - Urban Flighter Project Guide

## Project Overview

Urban Flighter is a full-stack 3D interactive drone simulator for urban environments combining:
- **Backend**: Python FastAPI with real-time weather data and OSM building geometry
- **Frontend**: React + Three.js interactive 3D visualization with physics simulation
- **urbanFlowGen**: Python library for generating synthetic/real urban CFD scenarios

## Quick Start Commands

### Backend
```bash
cd backend
source venv/bin/activate
python main.py                    # Runs on http://localhost:8000
```

### Frontend
```bash
cd frontend
npm install                       # First time only
npm run dev                       # Dev server on http://localhost:5173
npm run build                     # Production build
npm run lint                      # ESLint check
```

### urbanFlowGen
```bash
cd urbanFlowGen
source venv/bin/activate
python geometryGenerator.py <SAMPLE_ID>          # Synthetic geometry
python realCityGeometryGenerator.py <SAMPLE_ID>  # Real city geometry
python gridGenerator.py <SAMPLE_ID>              # Grid properties
./urbanFlowGen.sh                                # Batch processing
```

## Project Structure

```
urbanflighter/
├── backend/                    # FastAPI backend (Python)
│   ├── main.py                 # API entry point (/map, /weather endpoints)
│   ├── services/
│   │   ├── geometry.py         # OSM building data via OSMnx
│   │   └── wind.py             # Open-Meteo weather API
│   └── requirements.txt
├── frontend/                   # React + TypeScript + Vite
│   ├── src/
│   │   ├── App.tsx             # Main application component
│   │   ├── api.ts              # API client
│   │   ├── components/         # React 3D components
│   │   ├── systems/            # Physics systems (WindSystem.ts)
│   │   └── utils/              # Utilities (energySystem.ts, windDrag.ts)
│   └── package.json
└── urbanFlowGen/               # CFD geometry generation
    ├── geometryGenerator.py    # Synthetic urban geometry
    ├── realCityGeometryGenerator.py  # Real city from Overture Maps
    ├── gridGenerator.py        # m-AIA grid properties
    ├── config.toml             # Master configuration
    └── city_config.toml        # Real city presets
```

## Code Style

### Python (backend, urbanFlowGen)
- `snake_case` for variables/functions
- Use `os.path.join()` for paths
- Load config from TOML files with `import toml`
- Scripts require SAMPLE_ID argument: `python script.py <ID>`

### TypeScript/React (frontend)
- `camelCase` for variables/functions
- `PascalCase` for components
- Use TypeScript interfaces for data types
- Functional components with hooks

## API Endpoints

| Endpoint | Method | Parameters | Description |
|----------|--------|------------|-------------|
| `/` | GET | - | Health check |
| `/map` | GET | `lat`, `lon`, `radius` | Fetch building data |
| `/weather` | GET | `lat`, `lon` | Get weather & simulation params |

## Key Dependencies

### Backend
- fastapi, uvicorn, osmnx, shapely, geopandas, scipy, numpy

### Frontend
- react@19, three@0.182, @react-three/fiber, @react-three/drei, react-leaflet, typescript, vite

### urbanFlowGen
- numpy, trimesh, shapely, toml, overturemaps, geopandas, pyproj

## Configuration

- **config.toml**: Master CFD parameters (domain, buildings, grid, simulation)
- **city_config.toml**: Real city presets (Seoul, Tokyo, NYC, London, Paris, etc.)
- Default location: Gangnam Station, Seoul (37.4979°N, 127.0276°E)

## Testing

No automated tests configured. Validate manually:
- Geometry generation: Check STL output files
- Frontend: Visual inspection of 3D rendering
- Backend: Test API endpoints directly

## Important Notes

- Always activate virtual environment before running Python scripts
- SAMPLE_ID is required integer for geometry generators
- Output organized in `./<SAMPLE_ID>/stl/` and `./<SAMPLE_ID>/out/`
- CORS enabled on backend for frontend communication
- Wind units: m/s (speed), degrees 0-360 (direction)
- Designed for JURECA-DC GPU cluster with SLURM for HPC runs
