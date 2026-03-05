import requests

TILE_API_URL = "https://data.osmbuildings.org/0.2/anonymous/tile/15/17498/12580.json"
headers = {'User-Agent': 'UrbanDroneGame/1.0 (Research Project)'}

try:
    print(f"Connecting to {TILE_API_URL}...")
    response = requests.get(TILE_API_URL, headers=headers, timeout=10)
    print(f"Status Code: {response.status_code}")
    if response.status_code == 200:
        data = response.json()
        print(f"Features found: {len(data.get('features', []))}")
    else:
        print(f"Error: {response.text}")
except Exception as e:
    print(f"Connection Failed: {e}")
