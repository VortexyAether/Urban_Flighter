from __future__ import annotations

from typing import Any

import numpy as np
from scipy.ndimage import distance_transform_edt, gaussian_filter
from scipy.sparse import lil_matrix
from scipy.sparse.linalg import cg

from services.cfd import point_in_polygon


def wind_dir_to_inlet_vector(speed_mps: float, deg_from_north: float) -> np.ndarray:
    """
    Convert meteorological direction to a world-space inlet velocity.
    The UI/domain stays aligned to cardinal axes. The solver changes only the inlet.
    - 0 deg: wind coming from north -> flow toward south
    - 90 deg: wind coming from east -> flow toward west
    """
    theta = np.deg2rad(float(deg_from_north))
    vx = -np.sin(theta)
    vy = -np.cos(theta)
    return np.array([vx, vy], dtype=np.float32) * float(speed_mps)


def rasterize_building_mask(
    buildings: list[dict[str, Any]],
    nx: int,
    ny: int,
    cell_size_m: float,
) -> np.ndarray:
    mask = np.zeros((nx, ny), dtype=bool)
    cx = nx / 2.0
    cy = ny / 2.0

    for building in buildings:
        footprint = np.asarray(building.get("footprint", []), dtype=np.float32)
        if footprint.ndim != 2 or footprint.shape[0] < 3 or footprint.shape[1] != 2:
            continue

        min_x, min_y = footprint.min(axis=0)
        max_x, max_y = footprint.max(axis=0)
        ix0 = max(0, int(np.floor(min_x / cell_size_m + cx)) - 1)
        ix1 = min(nx - 1, int(np.ceil(max_x / cell_size_m + cx)) + 1)
        iy0 = max(0, int(np.floor(min_y / cell_size_m + cy)) - 1)
        iy1 = min(ny - 1, int(np.ceil(max_y / cell_size_m + cy)) + 1)

        for ix in range(ix0, ix1 + 1):
            wx = (ix + 0.5 - cx) * cell_size_m
            for iy in range(iy0, iy1 + 1):
                wy = (iy + 0.5 - cy) * cell_size_m
                if point_in_polygon(wx, wy, footprint):
                    mask[ix, iy] = True

    return mask


def build_wake_and_deflection_sources(
    buildings: list[dict[str, Any]],
    xx: np.ndarray,
    yy: np.ndarray,
    wind_hat: np.ndarray,
    cross_hat: np.ndarray,
    cell_size_m: float,
) -> tuple[np.ndarray, np.ndarray]:
    shelter = np.zeros_like(xx, dtype=np.float32)
    deflection = np.zeros_like(xx, dtype=np.float32)

    for building in buildings:
        footprint = np.asarray(building.get("footprint", []), dtype=np.float32)
        if footprint.ndim != 2 or footprint.shape[0] < 3 or footprint.shape[1] != 2:
            continue

        center = footprint.mean(axis=0)
        rel_x = xx - float(center[0])
        rel_y = yy - float(center[1])
        along = rel_x * wind_hat[0] + rel_y * wind_hat[1]
        cross = rel_x * cross_hat[0] + rel_y * cross_hat[1]

        span = max(
            float(np.ptp(footprint[:, 0])),
            float(np.ptp(footprint[:, 1])),
            float(cell_size_m * 2.0),
        )

        wake_width = span * 0.9 + np.maximum(along, 0.0) * 0.22 + cell_size_m * 2.0
        wake_decay = np.exp(-np.maximum(along, 0.0) / max(span * 4.5, cell_size_m * 8.0))
        wake_profile = np.exp(-np.square(cross / np.maximum(wake_width, cell_size_m)))
        shelter += (along > 0.0).astype(np.float32) * wake_decay * wake_profile * 2.2

        side_band = np.exp(-np.abs(cross) / max(span * 0.8, cell_size_m * 2.0))
        along_falloff = np.exp(-np.abs(along) / max(span * 1.6, cell_size_m * 3.0))
        deflection += side_band * along_falloff * np.sign(cross) * 0.9

    return shelter, deflection


def solve_screened_field_cg(
    mask: np.ndarray,
    rhs: np.ndarray,
    dirichlet: np.ndarray,
    cell_size_m: float,
    reaction: np.ndarray,
) -> tuple[np.ndarray, int]:
    nx, ny = mask.shape
    total = nx * ny
    matrix = lil_matrix((total, total), dtype=np.float32)
    vector = np.zeros(total, dtype=np.float32)
    h2 = float(cell_size_m * cell_size_m)
    index = lambda ix, iy: ix * ny + iy

    for ix in range(nx):
        for iy in range(ny):
            row = index(ix, iy)
            is_boundary = ix == 0 or iy == 0 or ix == nx - 1 or iy == ny - 1
            if mask[ix, iy] or is_boundary:
                matrix[row, row] = 1.0
                vector[row] = float(dirichlet[ix, iy])
                continue

            diag = 4.0 + reaction[ix, iy] * h2
            matrix[row, row] = diag
            matrix[row, index(ix - 1, iy)] = -1.0
            matrix[row, index(ix + 1, iy)] = -1.0
            matrix[row, index(ix, iy - 1)] = -1.0
            matrix[row, index(ix, iy + 1)] = -1.0
            vector[row] = float(rhs[ix, iy] * h2)

    solution, info = cg(matrix.tocsr(), vector, rtol=1e-4, atol=1e-6, maxiter=max(800, total // 2))
    if info < 0:
        raise RuntimeError("cg solver failed")
    field = solution.reshape(nx, ny).astype(np.float32)
    field = np.nan_to_num(field, nan=0.0, posinf=0.0, neginf=0.0)
    field[mask] = 0.0
    return field, int(info)


def compute_time_averaged_flow_2d(
    buildings: list[dict[str, Any]],
    inlet_velocity: np.ndarray,
    radius_m: float,
    cell_size_m: float,
) -> dict[str, Any]:
    nx = max(32, int(np.ceil((2.0 * radius_m) / cell_size_m)))
    ny = nx
    if nx % 2 != 0:
        nx += 1
        ny += 1

    mask = rasterize_building_mask(buildings, nx, ny, cell_size_m)
    ux = np.full((nx, ny), float(inlet_velocity[0]), dtype=np.float32)
    uy = np.full((nx, ny), float(inlet_velocity[1]), dtype=np.float32)

    xs = (np.arange(nx, dtype=np.float32) + 0.5 - nx / 2.0) * float(cell_size_m)
    ys = (np.arange(ny, dtype=np.float32) + 0.5 - ny / 2.0) * float(cell_size_m)
    xx, yy = np.meshgrid(xs, ys, indexing="ij")

    speed = float(np.linalg.norm(inlet_velocity))
    solver_info_u = 0
    solver_info_v = 0
    if speed > 1e-4 and buildings:
        wind_hat = inlet_velocity / speed
        cross_hat = np.array([-wind_hat[1], wind_hat[0]], dtype=np.float32)
        shelter, deflection_source = build_wake_and_deflection_sources(buildings, xx, yy, wind_hat, cross_hat, cell_size_m)
        fluid = ~mask
        dist_cells = distance_transform_edt(fluid).astype(np.float32)
        dist_m = dist_cells * float(cell_size_m)
        near_wall = np.exp(-dist_m / max(18.0, cell_size_m * 2.0))
        reaction = 0.018 + 0.22 * near_wall + 0.11 * shelter

        rhs_u = np.full((nx, ny), float(inlet_velocity[0]) * 0.018, dtype=np.float32)
        rhs_v = np.full((nx, ny), float(inlet_velocity[1]) * 0.018, dtype=np.float32)
        rhs_u += cross_hat[0] * deflection_source * speed * 0.012
        rhs_v += cross_hat[1] * deflection_source * speed * 0.012

        dirichlet_u = np.full((nx, ny), float(inlet_velocity[0]), dtype=np.float32)
        dirichlet_v = np.full((nx, ny), float(inlet_velocity[1]), dtype=np.float32)
        dirichlet_u[mask] = 0.0
        dirichlet_v[mask] = 0.0

        ux, solver_info_u = solve_screened_field_cg(mask, rhs_u, dirichlet_u, cell_size_m, reaction)
        uy, solver_info_v = solve_screened_field_cg(mask, rhs_v, dirichlet_v, cell_size_m, reaction)
    elif speed > 1e-4:
        reaction = np.full((nx, ny), 0.018, dtype=np.float32)
        dirichlet_u = np.full((nx, ny), float(inlet_velocity[0]), dtype=np.float32)
        dirichlet_v = np.full((nx, ny), float(inlet_velocity[1]), dtype=np.float32)
        rhs_u = np.full((nx, ny), float(inlet_velocity[0]) * 0.018, dtype=np.float32)
        rhs_v = np.full((nx, ny), float(inlet_velocity[1]) * 0.018, dtype=np.float32)
        ux, solver_info_u = solve_screened_field_cg(mask, rhs_u, dirichlet_u, cell_size_m, reaction)
        uy, solver_info_v = solve_screened_field_cg(mask, rhs_v, dirichlet_v, cell_size_m, reaction)

    ux[mask] = 0.0
    uy[mask] = 0.0

    sigma = max(0.5, 3.0 / max(cell_size_m, 1.0))
    ux = gaussian_filter(ux, sigma=sigma, mode="nearest")
    uy = gaussian_filter(uy, sigma=sigma, mode="nearest")
    ux = np.nan_to_num(ux, nan=0.0, posinf=0.0, neginf=0.0)
    uy = np.nan_to_num(uy, nan=0.0, posinf=0.0, neginf=0.0)
    ux[mask] = 0.0
    uy[mask] = 0.0

    speed_grid = np.sqrt(ux * ux + uy * uy)
    return {
        "nx": int(nx),
        "ny": int(ny),
        "cell_size_m": float(cell_size_m),
        "bounds": {
            "min_x": float(-nx * cell_size_m * 0.5),
            "max_x": float(nx * cell_size_m * 0.5),
            "min_y": float(-ny * cell_size_m * 0.5),
            "max_y": float(ny * cell_size_m * 0.5),
        },
        "ux": ux.ravel(order="C").tolist(),
        "uy": uy.ravel(order="C").tolist(),
        "mask": mask.astype(np.uint8).ravel(order="C").tolist(),
        "stats": {
            "mean_speed_mps": float(speed_grid.mean()),
            "max_speed_mps": float(speed_grid.max()),
            "blocked_fraction": float(mask.mean()),
            "cg_info_u": int(solver_info_u),
            "cg_info_v": int(solver_info_v),
        },
    }
