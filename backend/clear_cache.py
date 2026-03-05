import osmnx as ox
print("Clearing OSMnx cache...")
ox.settings.use_cache = False
print("Cache disabled/cleared for next run.")
