from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
import uvicorn
from services.geometry import fetch_buildings
from services.wind import get_real_weather, generate_global_wind_params

app = FastAPI(title="Urban Drone Challenge API")

# Enable CORS for frontend
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.get("/")
def read_root():
    return {"message": "Urban Drone Challenge Backend is Ready!"}

@app.get("/map")
def get_map_data(lat: float, lon: float, radius: float = 300):
    """
    Get 3D building data for a location.
    """
    print(f"Requesting map for {lat}, {lon}")
    buildings = fetch_buildings(lat, lon, radius)
    if not buildings:
        return {"features": [], "message": "No buildings found or error occurred."}
    return {"features": buildings, "count": len(buildings)}

@app.get("/weather")
def get_weather_data(lat: float, lon: float):
    """
    Get current weather and simulation wind parameters.
    """
    real_weather = get_real_weather(lat, lon)
    sim_params = generate_global_wind_params()
    return {
        "real": real_weather,
        "simulation": sim_params
    }

if __name__ == "__main__":
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)
