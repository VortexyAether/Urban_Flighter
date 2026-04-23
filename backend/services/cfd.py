from __future__ import annotations

import json
import math
from pathlib import Path
from typing import Any

import numpy as np
from scipy.ndimage import distance_transform_edt, gaussian_filter


def wind_to_vector(speed_mps: float, deg: float) -> np.ndarray:
    rad = np.deg2rad(deg)
    return np.array([math.cos(rad), math.sin(rad), 0.0], dtype=np.float32) * float(speed_mps)


def point_in_polygon(x: float, y: float, poly: np.ndarray) -> bool:
    inside = False
    n = poly.shape[0]
    for i in range(n):
        j = (i - 1) % n
        xi, yi = poly[i]
        xj, yj = poly[j]
        inter = ((yi > y) != (yj > y)) and (x < (xj - xi) * (y - yi) / ((yj - yi) + 1e-12) + xi)
        if inter:
            inside = not inside
    return inside


def voxelize_buildings(
    buildings: list[dict[str, Any]],
    nx: int,
    ny: int,
    nz: int,
    voxel_size_m: float,
) -> np.ndarray:
    solid = np.zeros((nx, ny, nz), dtype=bool)
    cx, cy = nx / 2.0, ny / 2.0

    for b in buildings:
        fp = np.asarray(b.get("footprint", []), dtype=np.float32)
        if fp.ndim != 2 or fp.shape[1] != 2 or fp.shape[0] < 3:
            continue
        h = float(b.get("height", 10.0))
        hz = max(1, min(nz, int(math.ceil(h / voxel_size_m))))

        min_x, min_y = fp.min(axis=0)
        max_x, max_y = fp.max(axis=0)
        ix0 = max(0, int(math.floor(min_x / voxel_size_m + cx)))
        ix1 = min(nx - 1, int(math.ceil(max_x / voxel_size_m + cx)))
        iy0 = max(0, int(math.floor(min_y / voxel_size_m + cy)))
        iy1 = min(ny - 1, int(math.ceil(max_y / voxel_size_m + cy)))
        if ix1 < ix0 or iy1 < iy0:
            continue

        for ix in range(ix0, ix1 + 1):
            for iy in range(iy0, iy1 + 1):
                wx = (ix + 0.5 - cx) * voxel_size_m
                wy = (iy + 0.5 - cy) * voxel_size_m
                if point_in_polygon(wx, wy, fp):
                    solid[ix, iy, :hz] = True

    # Keep boundary planes fluid for stable interpolation
    solid[0, :, :] = False
    solid[-1, :, :] = False
    return solid


def compute_wind_field(
    solid: np.ndarray,
    global_wind_mps: np.ndarray,
    voxel_size_m: float,
    smooth_sigma: float = 1.0,
) -> np.ndarray:
    """
    Lightweight CFD-like average wind field.
    - starts from global wind
    - applies obstacle shadow using distance transform
    - adds near-wall deflection using distance gradients
    """
    nx, ny, nz = solid.shape
    wind = np.zeros((nx, ny, nz, 3), dtype=np.float32)
    wind[..., 0] = global_wind_mps[0]
    wind[..., 1] = global_wind_mps[1]
    wind[..., 2] = global_wind_mps[2]

    fluid = ~solid
    dist_vox = distance_transform_edt(fluid).astype(np.float32)
    dist_m = dist_vox * float(voxel_size_m)

    # Speed attenuation near buildings: 0.25~1.0
    scale_m = max(2.0 * voxel_size_m, 12.0)
    atten = 0.25 + 0.75 * np.clip(dist_m / (dist_m + scale_m), 0.0, 1.0)

    # Signed-like field for gradient direction.
    phi = dist_m.copy()
    phi[solid] *= -1.0
    gx, gy, gz = np.gradient(phi)
    grad_norm = np.sqrt(gx * gx + gy * gy + gz * gz) + 1e-6

    # Deflection strongest near walls.
    near = np.exp(-dist_m / max(scale_m, 1.0))
    beta = 0.35
    wind[..., 0] = wind[..., 0] * atten + beta * near * (gx / grad_norm) * np.linalg.norm(global_wind_mps)
    wind[..., 1] = wind[..., 1] * atten + beta * near * (gy / grad_norm) * np.linalg.norm(global_wind_mps)
    wind[..., 2] = wind[..., 2] * atten + 0.15 * near * (gz / grad_norm) * np.linalg.norm(global_wind_mps)

    wind[solid] = 0.0

    # Smooth for stable sampling/visuals
    for k in range(3):
        wind[..., k] = gaussian_filter(wind[..., k], sigma=smooth_sigma, mode="nearest")
    wind[solid] = 0.0
    return wind


def save_wind_json(path: Path, wind: np.ndarray, voxel_size_m: float, origin_world: tuple[float, float, float] = (0, 0, 0)) -> None:
    nx, ny, nz, _ = wind.shape
    ux = wind[..., 0].astype(np.float32)
    uy = wind[..., 1].astype(np.float32)
    uz = wind[..., 2].astype(np.float32)
    payload = {
        "nx": nx,
        "ny": ny,
        "nz": nz,
        "voxel_size_m": float(voxel_size_m),
        "origin_world": [float(origin_world[0]), float(origin_world[1]), float(origin_world[2])],
        "data_order": "C-order over (x,y,z), z-fastest",
        "index_formula": "idx=((x*ny+y)*nz+z)",
        "ux": ux.ravel(order="C").tolist(),
        "uy": uy.ravel(order="C").tolist(),
        "uz": uz.ravel(order="C").tolist(),
    }
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(payload), encoding="utf-8")


def save_wind_npy(path: Path, wind: np.ndarray) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    np.save(path, wind.astype(np.float32))


def save_wind_vtk(path: Path, wind: np.ndarray, solid: np.ndarray, voxel_size_m: float) -> None:
    nx, ny, nz, _ = wind.shape
    vel = wind.astype(np.float32)
    speed = np.linalg.norm(vel, axis=-1).astype(np.float32)

    vel_f = np.column_stack((vel[..., 0].ravel(order="F"), vel[..., 1].ravel(order="F"), vel[..., 2].ravel(order="F")))
    speed_f = speed.ravel(order="F")
    solid_f = solid.astype(np.int32).ravel(order="F")

    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", encoding="utf-8") as f:
        f.write("# vtk DataFile Version 3.0\n")
        f.write("urbanflighter wind field\n")
        f.write("ASCII\n")
        f.write("DATASET STRUCTURED_POINTS\n")
        f.write(f"DIMENSIONS {nx} {ny} {nz}\n")
        f.write("ORIGIN 0 0 0\n")
        f.write(f"SPACING {voxel_size_m} {voxel_size_m} {voxel_size_m}\n")
        f.write(f"POINT_DATA {nx*ny*nz}\n")
        f.write("VECTORS velocity float\n")
        for row in vel_f:
            f.write(f"{row[0]} {row[1]} {row[2]}\n")
        f.write("SCALARS speed float 1\n")
        f.write("LOOKUP_TABLE default\n")
        for s in speed_f:
            f.write(f"{s}\n")
        f.write("SCALARS solid int 1\n")
        f.write("LOOKUP_TABLE default\n")
        for s in solid_f:
            f.write(f"{s}\n")


def sample_wind_trilinear(wind: np.ndarray, voxel_size_m: float, points: list[list[float]]) -> list[list[float]]:
    nx, ny, nz, _ = wind.shape

    def tri(arr: np.ndarray, x: float, y: float, z: float) -> float:
        x = float(np.clip(x, 0, nx - 1))
        y = float(np.clip(y, 0, ny - 1))
        z = float(np.clip(z, 0, nz - 1))
        x0, y0, z0 = int(math.floor(x)), int(math.floor(y)), int(math.floor(z))
        x1, y1, z1 = min(x0 + 1, nx - 1), min(y0 + 1, ny - 1), min(z0 + 1, nz - 1)
        tx, ty, tz = x - x0, y - y0, z - z0

        c000 = arr[x0, y0, z0]
        c100 = arr[x1, y0, z0]
        c010 = arr[x0, y1, z0]
        c110 = arr[x1, y1, z0]
        c001 = arr[x0, y0, z1]
        c101 = arr[x1, y0, z1]
        c011 = arr[x0, y1, z1]
        c111 = arr[x1, y1, z1]

        c00 = c000 * (1 - tx) + c100 * tx
        c10 = c010 * (1 - tx) + c110 * tx
        c01 = c001 * (1 - tx) + c101 * tx
        c11 = c011 * (1 - tx) + c111 * tx
        c0 = c00 * (1 - ty) + c10 * ty
        c1 = c01 * (1 - ty) + c11 * ty
        return float(c0 * (1 - tz) + c1 * tz)

    out: list[list[float]] = []
    for p in points:
        # Godot Y-up mapping: CFD x->X, y->Z, z->Y
        wx, wy, wz = p
        gx = wx / voxel_size_m
        gy = wz / voxel_size_m
        gz = wy / voxel_size_m
        u = tri(wind[..., 0], gx, gy, gz)
        v = tri(wind[..., 1], gx, gy, gz)
        w = tri(wind[..., 2], gx, gy, gz)
        out.append([u, w, v])
    return out
