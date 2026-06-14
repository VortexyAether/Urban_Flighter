from __future__ import annotations

import json
import re
from functools import lru_cache
from pathlib import Path
from typing import Any

import numpy as np

AREA_NAME = "area_incheon"
WIND_ANGLE_DEG = 0.0
DX = 0.9
NX = 2016
NY = 1280
LX = NX * DX
LY = NY * DX
MARGIN_UP = 180.0
PAD = 40.0


def _repo_root() -> Path:
    return Path(__file__).resolve().parents[2]


def _demo_root() -> Path:
    return _repo_root() / "AeroJAX_map_test2"


@lru_cache(maxsize=1)
def _available_snapshot_timesteps() -> tuple[int, ...]:
    output_root = _demo_root() / "outputs"
    timesteps: list[int] = []

    for path in output_root.glob("snapshot_t*.npz"):
        match = re.fullmatch(r"snapshot_t(\d+)\.npz", path.name)
        if match:
            timesteps.append(int(match.group(1)))

    if not timesteps:
        raise FileNotFoundError(f"No AeroJAX snapshots found in {output_root}")

    return tuple(sorted(timesteps))


def _resolve_snapshot_t(snapshot_t: int | None) -> int:
    available = _available_snapshot_timesteps()
    if snapshot_t is None:
        return available[-1]
    return int(snapshot_t)


def _load_geojson_polygons(path: Path) -> list[np.ndarray]:
    payload = json.loads(path.read_text(encoding="utf-8"))
    polygons: list[np.ndarray] = []

    for feature in payload.get("features", []):
        geometry = feature.get("geometry") or {}
        coordinates = geometry.get("coordinates") or []
        geom_type = geometry.get("type")

        if geom_type == "Polygon" and coordinates:
            polygons.append(np.asarray(coordinates[0], dtype=np.float32)[:, :2])
        elif geom_type == "MultiPolygon":
            for poly in coordinates:
                if poly:
                    polygons.append(np.asarray(poly[0], dtype=np.float32)[:, :2])

    return [poly for poly in polygons if poly.ndim == 2 and poly.shape[0] >= 3]


def _rotate_about(polygons: list[np.ndarray], angle_deg: float, center: np.ndarray) -> list[np.ndarray]:
    theta = np.deg2rad(angle_deg)
    cos_t = np.cos(theta)
    sin_t = np.sin(theta)
    rotation = np.array([[cos_t, -sin_t], [sin_t, cos_t]], dtype=np.float32)
    return [(poly - center) @ rotation.T + center for poly in polygons]


def _place_polygons(polygons: list[np.ndarray]) -> list[np.ndarray]:
    all_points = np.vstack(polygons)
    centroid = all_points.mean(axis=0)
    rotated = _rotate_about(polygons, -WIND_ANGLE_DEG, centroid)

    all_points = np.vstack(rotated)
    min_x, min_y = all_points.min(axis=0)
    max_y = all_points[:, 1].max()
    shift = np.array([MARGIN_UP - min_x, (LY - (max_y - min_y)) / 2.0 - min_y], dtype=np.float32)
    return [poly + shift for poly in rotated]


def _building_height(poly: np.ndarray) -> float:
    centered = poly - poly.mean(axis=0)
    area = 0.5 * abs(
        np.dot(centered[:, 0], np.roll(centered[:, 1], -1))
        - np.dot(centered[:, 1], np.roll(centered[:, 0], -1))
    )
    return float(np.clip(10.0 + np.sqrt(max(area, 1.0)) * 0.36, 12.0, 110.0))


@lru_cache(maxsize=4)
def _load_snapshot(snapshot_t: int) -> dict[str, Any]:
    root = _demo_root()
    snapshot_path = root / "outputs" / f"snapshot_t{snapshot_t}.npz"
    geojson_path = root / "data" / f"{AREA_NAME}_buildings_utm.geojson"

    if not snapshot_path.exists():
        raise FileNotFoundError(f"AeroJAX snapshot not found: {snapshot_path}")
    if not geojson_path.exists():
        raise FileNotFoundError(f"AeroJAX building data not found: {geojson_path}")

    data = np.load(snapshot_path)
    polygons = _place_polygons(_load_geojson_polygons(geojson_path))
    all_points = np.vstack(polygons)
    min_x, min_y = np.maximum(all_points.min(axis=0) - PAD, np.array([0.0, 0.0]))
    max_x, max_y = np.minimum(all_points.max(axis=0) + PAD, np.array([LX, LY]))

    return {
        "X": np.asarray(data["X"], dtype=np.float32),
        "Y": np.asarray(data["Y"], dtype=np.float32),
        "u": np.asarray(data["u_mean"], dtype=np.float32),
        "v": np.asarray(data["v_mean"], dtype=np.float32),
        "umag": np.asarray(data["umag_mean"], dtype=np.float32),
        "mask": np.asarray(data["mask"], dtype=np.float32),
        "polygons": polygons,
        "crop": (float(min_x), float(min_y), float(max_x), float(max_y)),
    }


def build_aerojax_demo_flow(stride: int = 8, snapshot_t: int | None = None) -> dict[str, Any]:
    stride = int(np.clip(stride, 4, 24))
    resolved_snapshot_t = _resolve_snapshot_t(snapshot_t)
    loaded = _load_snapshot(resolved_snapshot_t)
    min_x, min_y, max_x, max_y = loaded["crop"]
    x_axis = loaded["X"][:, 0]
    y_axis = loaded["Y"][0, :]
    i0 = int(np.searchsorted(x_axis, min_x, side="left"))
    i1 = int(np.searchsorted(x_axis, max_x, side="right"))
    j0 = int(np.searchsorted(y_axis, min_y, side="left"))
    j1 = int(np.searchsorted(y_axis, max_y, side="right"))
    sl = (slice(i0, i1, stride), slice(j0, j1, stride))

    ux = loaded["u"][sl].astype(np.float32)
    uy = loaded["v"][sl].astype(np.float32)
    speed = loaded["umag"][sl].astype(np.float32)
    solid = (loaded["mask"][sl] < 0.5)
    ux[solid] = 0.0
    uy[solid] = 0.0

    shifted_polygons = [poly - np.array([min_x, min_y], dtype=np.float32) for poly in loaded["polygons"]]
    buildings = [
        {
            "height": _building_height(poly),
            "footprint": poly.astype(float).tolist(),
        }
        for poly in shifted_polygons
    ]

    fluid_speed = speed[~solid]
    mean_speed = float(fluid_speed.mean()) if fluid_speed.size else 0.0
    max_speed = float(fluid_speed.max()) if fluid_speed.size else 0.0
    width = max_x - min_x
    height = max_y - min_y

    return {
        "buildings": buildings,
        "weather": {
            "wind_speed": 1.0,
            "wind_deg": 270.0,
            "description": f"AeroJAX CFD demo ({AREA_NAME}, t={resolved_snapshot_t})",
        },
        "inlet": {
            "ux": 1.0,
            "uy": 0.0,
            "speed_mps": 1.0,
        },
        "domain": {
            "geometry_radius_m": float(max(width, height) * 0.5),
            "solve_radius_m": float(max(width, height) * 0.5),
        },
        "field": {
            "nx": int(ux.shape[0]),
            "ny": int(ux.shape[1]),
            "cell_size_m": float(DX * stride),
            "bounds": {
                "min_x": 0.0,
                "max_x": float(width),
                "min_y": 0.0,
                "max_y": float(height),
            },
            "ux": ux.ravel(order="C").tolist(),
            "uy": uy.ravel(order="C").tolist(),
            "mask": solid.astype(np.uint8).ravel(order="C").tolist(),
            "stats": {
                "mean_speed_mps": mean_speed,
                "max_speed_mps": max_speed,
                "blocked_fraction": float(solid.mean()),
            },
        },
        "source": {
            "kind": "aerojax-demo",
            "area": AREA_NAME,
            "snapshot_t": float(resolved_snapshot_t),
            "is_latest": resolved_snapshot_t == _available_snapshot_timesteps()[-1],
            "stride": int(stride),
            "raw_grid": [NX, NY],
        },
    }
