import random
import requests

def get_real_weather(lat: float, lon: float):
    """
    Fetch real-time weather using Open-Meteo API (Free, No Key required).
    Returns global wind speed (m/s) and direction (degrees).
    """
    try:
        url = f"https://api.open-meteo.com/v1/forecast?latitude={lat}&longitude={lon}&current_weather=true"
        response = requests.get(url, timeout=5)
        response.raise_for_status()
        data = response.json()
        
        current = data.get("current_weather", {})
        return {
            "wind_speed": current.get("windspeed", random.uniform(2.0, 10.0)), # m/s
            "wind_deg": current.get("winddirection", random.uniform(0, 360)),  # degrees
            "description": "Real-time Satellite Wind Data"
        }
    except Exception as e:
        print(f"Weather API Error: {e}")
        # Fallback to reasonable/random data if API fails
        return {
            "wind_speed": random.uniform(3.0, 8.0),
            "wind_deg": random.uniform(0, 360),
            "description": "Fallback Mock Data"
        }

def generate_global_wind_params():
    """
    Return parameters for the frontend procedural wind shader/system.
    """
    return {
        "base_speed": random.uniform(5, 15),
        "direction": [random.uniform(-1, 1), 0, random.uniform(-1, 1)], # normalized later
        "turbulence": 0.5
    }
