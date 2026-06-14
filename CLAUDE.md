# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Urban Flighter is a full-stack interactive drone simulator for urban environments. A pilot flies a drone through a real city's building layout while a precomputed/analytical wind field affects flight dynamics and energy consumption. Three moving parts:

- **Backend** (`backend/`): Python FastAPI server. Fetches real OSM building geometry + live weather, computes wind fields (analytical 2D and voxel 3D), and serves precomputed AeroJAX CFD snapshots to the frontend.
- **Frontend** (`frontend/`): React 19 + TypeScript + Vite. A hybrid simulator with three modes — **2D top-down (default)**, **3D (Three.js)**, and **Real (AeroJAX CFD)**. Drone physics + energy model run client-side.
- **AeroJAX_map_test2** (`AeroJAX_map_test2/`): Standalone JAX-based 2D incompressible Navier–Stokes solver. Produces the real-CFD wind snapshots that the backend serves. This is the active high-fidelity CFD engine.

> **Note:** `urbanFlowGen/` is referenced in older docs but currently contains no source files (only a `.venv` and `__pycache__`). The geometry/grid generator scripts described in past versions of this file no longer exist in the repo. **AeroJAX_map_test2 has replaced it** as the CFD pipeline. Do not document or invoke the old `geometryGenerator.py` / `gridGenerator.py` commands.

## Quick Start Commands

### Backend
```bash
cd backend
source venv/bin/activate
python main.py                    # Runs on http://localhost:8000 (uvicorn, reload=True)
```
No API keys required — Open-Meteo (weather) and OSMnx (buildings) are both free.

### Frontend
```bash
cd frontend
npm install                       # First time only
npm run dev                       # Vite dev server on http://localhost:5173
npm run build                     # tsc -b && vite build
npm run lint                      # ESLint check
npm run preview                   # Preview production build
```

### AeroJAX CFD solver (offline, generates Real-mode data)
```bash
cd AeroJAX_map_test2
python run_map.py --check         # Build SDF/mask + diagnostic plots, no solve
python run_map.py --smoke         # Short coarse-grid sanity run (352x256)
python run_map.py --series        # Full transient solve to t=1000, writes snapshot_t*.npz (default)
JAX_PLATFORMS=cpu python run_map.py --series   # Force CPU (GPU/CUDA is default)
python fetch_buildings.py --point <lat> <lon> --dist <m>   # Refresh OSM building input
```
Outputs land in `AeroJAX_map_test2/outputs/` (`snapshot_t*.npz`, figures, vorticity GIF). The backend reads these snapshots directly via `backend/services/aerojax_demo.py`.

## Architecture & Data Flow

### The three simulation modes (frontend)
`App.tsx` holds `simulationMode: '2d' | '3d' | 'real'` and renders accordingly. **All three modes share the same building footprints, inlet wind, and client-side energy physics** — they differ only in rendering and wind-field source.

- **2D** (default, `TopDownGame.tsx`): HTML5 canvas, top-down. Samples the backend's analytical `field.ux/uy` grid at the drone position, applies building-polygon collision, animates particle flow. WASD controls.
- **3D** (`Simulation3D.tsx` → `Aircraft.tsx`, `CityModel.tsx`, `WindContour.tsx`, `WindArrowGrid.tsx`): Three.js / react-three-fiber scene. Wind is computed locally via `systems/WindSystem.ts` (polygon repulsion), not the backend grid.
- **Real** (`Simulation3D`/canvas with AeroJAX data): consumes a precomputed Navier–Stokes velocity snapshot served from `/flow-fields/aerojax-demo`.

### Backend wind pipeline
Three independent solvers live in `backend/services/`, chosen by endpoint:
- `flow_2d.py` — analytical 2D time-averaged field (screened-Poisson CG solver + analytical wake/deflection model). Backs `/flow-fields/2d`, the primary endpoint the frontend uses.
- `cfd.py` — lightweight 3D voxel wind field (distance-transform obstacle shadow + near-wall deflection). Backs the async `/simulations` job system.
- `aerojax_demo.py` — loads/downsamples precomputed AeroJAX NPZ snapshots from `AeroJAX_map_test2/outputs/`. Backs `/flow-fields/aerojax-demo`. **Reads an absolute path to the AeroJAX directory — see Gotchas.**

`geometry.py` (OSM buildings via OSMnx → UTM-projected footprints + heights) and `wind.py` (Open-Meteo live weather) feed all three.

### Async simulation jobs (`simulation_manager.py`)
The `/simulations` endpoints are **poll-based, not websocket**. POST queues a job (single-worker `ThreadPoolExecutor`), status transitions `queued → running → done/error`, client polls `GET /simulations/{id}`. Results persist to `backend/sim_outputs/{id}/` as `wind_field.json/.npy/.vtk` + `solid.npy`. An LRU cache keeps only the 5 most recent simulations on disk.

### Coordinate systems
CFD grids are X-forward; the game engine is Y-up. The mapping (CFD x/y/z → game X/Z/Y) is handled in `cfd.py:sample_wind_trilinear`. Meteorological wind direction is degrees-from-north (0° = wind *from* north → flow south); conversion to inlet velocity vectors lives in `flow_2d.py` and `cfd.py`.

## API Endpoints

| Endpoint | Method | Key params | Description |
|----------|--------|------------|-------------|
| `/`, `/health` | GET | — | Health checks |
| `/map` | GET | `lat`, `lon`, `radius` | OSM building footprints (GeoJSON) — legacy, not in main frontend flow |
| `/weather` | GET | `lat`, `lon` | Live weather + procedural wind params — legacy |
| `/flow-fields/2d` | POST | `lat`, `lon`, `geometry_radius_m`, `solve_radius_m`, `grid_size_m`, `use_real_weather` | **Primary**: buildings + analytical 2D velocity grid + weather |
| `/flow-fields/aerojax-demo` | GET | `stride` (default 8), `snapshot_t` | Real-mode AeroJAX CFD snapshot |
| `/simulations` | POST | SimulationRequest | Queue async 3D voxel CFD job |
| `/simulations/{id}` | GET | `simulation_id` | Poll job status |
| `/sample-wind` | POST | `simulation_id`, `points` | Trilinear-interpolated wind at points |

## Energy / Physics Model

Client-side, shared by all modes. Core math in `frontend/src/utils/dragEnergy.ts`; `energySystem.ts` wraps it. Total power = hover + sensors + drag + induced-rotor + climb + slow-flight penalty, where drag scales with relative-air-speed² (`F = 0.5·ρ·Cd·A·v²`). Wind alignment angle classifies flight as COUNTER (headwind, >120°), CROSS, or TAIL (<60°). Key constants (ρ=1.225, Cd=1.05, A=0.18 m², hover=68 W, optimal cruise=11 m/s) are at the top of `dragEnergy.ts`. `EnergyGraph.tsx` plots burn history; `MissionIntelligence.tsx` derives headwind alerts and endurance estimates.

## Code Style

### Python (backend, AeroJAX)
- `snake_case` for variables/functions; `os.path.join()` for paths
- Config via TOML (`import toml`) where present

### TypeScript/React (frontend)
- `camelCase` variables/functions, `PascalCase` components
- TypeScript interfaces for all backend data shapes (mirror them in `api.ts`)
- Functional components with hooks; physics in `useFrame`/canvas loops

## Configuration

- **Default location**: Incheon / Inha, Korea (lat 37.451448, lon 126.6515423) — set in `App.tsx` and `AeroJAX_map_test2/config_map.py`. (Older docs say Gangnam, Seoul — that is stale.)
- AeroJAX grid/domain/flow params: `AeroJAX_map_test2/config_map.py` (2016×1280 cells @ dx=0.9 m, west wind, U_ref=1.0 m/s, T_end=1000 s).
- Wind units: m/s (speed), degrees 0–360 from north (direction).

## Testing

No automated tests. Validate manually:
- **Backend**: hit endpoints directly (`backend/CFD_QUICKSTART.md` has a worked `/simulations` example); a good `/simulations` run ends `status=done` with `fallback_used=false`.
- **AeroJAX**: `run_map.py --check` plots before committing to a long `--series` solve.
- **Frontend**: visual inspection of 2D/3D rendering + telemetry; `npm run lint`.

## Gotchas

- `backend/services/aerojax_demo.py` resolves an **absolute path** to the AeroJAX directory (`_demo_root()`). If `AeroJAX_map_test2/` moves or `outputs/` is empty, `/flow-fields/aerojax-demo` (Real mode) fails — run a `--series` solve first.
- If OSM or weather fetches fail, `geometry.py`/`wind.py` silently return **randomized fallback** buildings/wind. Check the `fallback_used` flag before trusting a result.
- `backend/cache/` and `cache/` hold OSMnx query caches (hash-named JSON). `backend/services/clear_cache.py` disables/clears them.
- The async simulation manager is **single-worker** — concurrent `/simulations` jobs queue, they don't parallelize.
