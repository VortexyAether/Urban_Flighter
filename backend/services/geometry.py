import osmnx as ox
import geopandas as gpd
import pandas as pd
from shapely.geometry import Polygon, MultiPolygon
import numpy as np

def fetch_buildings(lat: float, lon: float, radius: float = 300):
    """
    Fetch buildings from OSM using OSMnx (Slow but Real, No Key required).
    """
    print(f"Fetching buildings via OSMnx at {lat}, {lon} (Radius: {radius}m)")
    try:
        # Fetch geometries (Can be slow)
        tags = {"building": True}
        gdf = ox.features_from_point((lat, lon), tags=tags, dist=radius)
        
        if gdf.empty:
            print("OSMnx found no buildings.")
            return []

        # Project to local UTM (meters)
        try:
            gdf_proj = ox.project_gdf(gdf)
        except Exception as e:
            # Fallback if projection fails (sometimes happens with empty/weird geoms)
            print(f"Projection failed: {e}. Trying automatic UTM estimation.")
            gdf_proj = gdf.to_crs(epsg=3857) # Web Mercator as fallback

        # Get center point in projected coords
        # We project a point at (lat, lon) to the SAME CRS as gdf_proj
        center_series = gpd.GeoSeries([gpd.points_from_xy([lon], [lat])[0]], crs="EPSG:4326")
        center_proj = center_series.to_crs(gdf_proj.crs).iloc[0]
        center_x, center_y = center_proj.x, center_proj.y

        buildings = []
        
        # Iterate and extract polygons
        for idx, row in gdf_proj.iterrows():
            geom = row.geometry
            if geom.is_empty:
                continue

            # Handle heights
            height = 10.0 # Default
            if 'height' in row and pd.notnull(row['height']):
                try:
                    # Clean height string (sometimes "10 m" or "approx 10")
                    h_str = str(row['height']).lower().replace('m', '').strip()
                    height = float(h_str)
                except:
                    pass
            elif 'building:levels' in row and pd.notnull(row['building:levels']):
                try:
                    levels = float(row['building:levels'])
                    height = levels * 3.5 # Approx 3.5m per floor
                except:
                    pass
            else:
                # Randomize height slightly if unknown to make it look like a city
                height = np.random.uniform(8.0, 25.0)

            # Extract footprint(s)
            polys = []
            if isinstance(geom, Polygon):
                polys = [geom]
            elif isinstance(geom, MultiPolygon):
                polys = list(geom.geoms)

            for poly in polys:
                # Exterior coords
                xx, yy = poly.exterior.coords.xy
                # Shift to local origin (center_x, center_y) -> (0,0)
                local_coords = []
                for x, y in zip(xx, yy):
                    local_coords.append([x - center_x, y - center_y])
                
                # Filter out degenerate polygons
                if len(local_coords) < 3:
                     continue
                
                # Circular boundary check: filter buildings outside radius
                # Check if building centroid is within circular domain
                centroid_x = sum(c[0] for c in local_coords) / len(local_coords)
                centroid_z = sum(c[1] for c in local_coords) / len(local_coords)
                dist_from_center = np.sqrt(centroid_x**2 + centroid_z**2)
                
                if dist_from_center > radius:
                    continue  # Skip buildings outside circular boundary

                buildings.append({
                    "height": height,
                    "footprint": local_coords
                })

        print(f"OSMnx: Fetched {len(buildings)} buildings.")
        return buildings

    except Exception as e:
        print(f"Error fetching buildings with OSMnx: {e}")
        return []
